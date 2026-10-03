import { expect, test } from '@playwright/test';

/**
 * Автосохранение: FR-11 и, главное, NFR-03 — запись не должна подвешивать ввод.
 *
 * Замер настоящий: доска на 1000 узлов, во время сохранения крутится счётчик
 * кадров и слушатель longtask. Если сериализация документа блокирует главный
 * поток, это видно здесь, а не в ощущениях.
 */

const openFreshProject = async (page: import('@playwright/test').Page, name: string) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill(name);
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  // Экран холста приезжает отдельным чанком (ленивый маршрут, 28.08), поэтому
  // адрес меняется раньше, чем экран смонтирован. Фикстура, положенная до этого
  // момента, будет затёрта чтением документа из IndexedDB.
  await expect(page.locator('canvas').first()).toBeVisible();
};

test('индикатор не показывает загрузку и сообщает только о завершённом сохранении', async ({
  page,
}) => {
  await openFreshProject(page, 'Индикатор');

  // До первой правки индикатора нет: обещать «всё сохранено» нечего.
  await expect(page.getByText('Все изменения сохранены')).toHaveCount(0);

  await page.evaluate(() => window.__board.getState().panBy(40, 25));

  await expect(page.getByText('Сохранение…')).toHaveCount(0);
  await expect(page.locator('[data-save-status="saving"]')).toHaveCount(0);
  await expect(page.getByText('Все изменения сохранены')).toBeVisible();
});

test('положение вида переживает перезагрузку', async ({ page }) => {
  await openFreshProject(page, 'Вьюпорт');

  await page.evaluate(() => {
    const board = window.__board;
    board.getState().panBy(-320, 140);
    board.getState().setViewport({ ...board.getState().document.viewport, zoom: 2.5 });
  });
  await expect(page.getByText('Все изменения сохранены')).toBeVisible();

  const before = await page.evaluate(() => window.__board.getState().document.viewport);
  await page.reload();

  await expect(page.locator('canvas').first()).toBeVisible();
  const after = await page.evaluate(() => window.__board.getState().document.viewport);

  expect(after).toEqual(before);
  expect(after.zoom).toBe(2.5);
});

test('NFR-03: набор текста во время сохранения не теряет символов', async ({ page }) => {
  await openFreshProject(page, 'Ввод при сохранении');

  await page.evaluate(() => {
    const store = window.__board.getState();
    const nodes: Record<string, unknown> = {};
    const order: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const id = `n${i}`;
      order.push(id);
      nodes[id] = {
        id,
        type: 'sticky',
        x: i * 3,
        y: i * 2,
        width: 180,
        height: 180,
        rotation: 0,
        opacity: 1,
        locked: false,
        text: `Заметка с довольно длинным текстом номер ${i}`,
        fill: '#fef08a',
      };
    }
    store.loadDocument({ ...window.__board.getState().document, nodes, order });

    // Настоящее поле ввода поверх холста — тот же случай, что оверлей textarea.
    const input = document.createElement('input');
    input.id = 'typing-probe';
    input.style.cssText = 'position:fixed;top:60px;left:8px;z-index:9999';
    document.body.appendChild(input);
    input.focus();
  });

  await page.waitForTimeout(700);

  // Правка запускает сохранение всей доски, и ровно в это время идёт набор.
  await page.evaluate(() => window.__board.getState().updateNode('n0', { x: 9 }));

  const phrase = 'проверка ввода во время сохранения';
  await page.locator('#typing-probe').type(phrase, { delay: 12 });

  await expect(page.locator('#typing-probe')).toHaveValue(phrase);
  await expect(page.getByText('Все изменения сохранены')).toBeVisible();
});
