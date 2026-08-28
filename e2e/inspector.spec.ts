import { expect, test } from '@playwright/test';

/**
 * Панель свойств, FR-09.
 *
 * Здесь закреплены два требования, названные заказчиком отдельно: цвет
 * применяется мгновенно во время перетаскивания, и при пустом выделении панель
 * показывает свойства холста, а не пустоту.
 */

const openBoard = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('Панель');
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  // Экран холста приезжает отдельным чанком (ленивый маршрут, 28.08), поэтому
  // адрес меняется раньше, чем экран смонтирован. Фикстура, положенная до этого
  // момента, будет затёрта чтением документа из IndexedDB.
  await expect(page.locator('canvas').first()).toBeVisible();

  await page.evaluate(() => {
    const board = window.__board;
    board.getState().loadDocument({
      ...board.getState().document,
      nodes: {
        s1: {
          id: 's1',
          type: 'shape',
          shape: 'rect',
          x: 80,
          y: 80,
          width: 180,
          height: 120,
          rotation: 0,
          opacity: 1,
          locked: false,
          fill: '#dbeafe',
          stroke: '#1d4ed8',
          strokeWidth: 2,
        },
        c1: {
          id: 'c1',
          type: 'connector',
          from: { point: { x: 80, y: 300 } },
          to: { point: { x: 320, y: 360 } },
          routing: 'straight',
          stroke: '#111111',
          strokeWidth: 2,
          startCap: 'none',
          endCap: 'arrow',
          locked: false,
          opacity: 1,
        },
      },
      order: ['s1', 'c1'],
    });
  });
};

test('пустое выделение — панель показывает свойства холста, а не пустеет', async ({ page }) => {
  await openBoard(page);

  await expect(page.getByText('Холст')).toBeVisible();
  // Сегменты Radix ToggleGroup type="single" — это radio, а не button.
  await expect(page.getByRole('radio', { name: 'Точки' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Без сетки' })).toBeVisible();
});

test('цвет применяется мгновенно, пока таскают ползунок, без кнопки «Применить»', async ({
  page,
}) => {
  await openBoard(page);
  await page.evaluate(() => window.__board.getState().select(['s1']));

  // Записываем каждое промежуточное значение заливки.
  await page.evaluate(() => {
    window.__fills = [];
    window.__board.subscribe((s) => {
      const fill = (s.document?.nodes?.s1 as { fill?: string } | undefined)?.fill;
      if (fill && window.__fills.at(-1) !== fill) window.__fills.push(fill);
    });
  });

  await page.getByText('#dbeafe').click();
  const saturation = page.locator('.react-colorful__saturation');
  await expect(saturation).toBeVisible();

  const box = (await saturation.boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  for (const step of [0.4, 0.6, 0.8]) {
    await page.mouse.move(box.x + box.width * step, box.y + box.height * step);
  }
  const duringDrag = await page.evaluate(() => window.__fills.length);
  await page.mouse.up();

  // Больше одного значения ДО отпускания кнопки — значит применяется по ходу,
  // а не по завершении. Кнопки «Применить» в панели нет вовсе.
  expect(duringDrag).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: 'Применить' })).toHaveCount(0);
});

test('разнотипное выделение оставляет только прозрачность, замок и порядок', async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => window.__board.getState().select(['s1', 'c1']));

  await expect(page.getByText('Выделено: 2')).toBeVisible();
  await expect(page.getByText('Прозрачность')).toBeVisible();
  await expect(page.getByText('Заблокирован')).toBeVisible();

  // Ничего сверх этого: у коннектора нет рамки, а заливки нет у обоих сразу.
  await expect(page.getByText('Ширина')).toHaveCount(0);
  await expect(page.getByText('Заливка')).toHaveCount(0);
});

test('изменение при множественном выделении применяется ко всем сразу', async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => window.__board.getState().select(['s1', 'c1']));

  const slider = page.getByRole('slider').first();
  await slider.focus();
  for (let i = 0; i < 5; i++) await slider.press('ArrowLeft');

  const opacity = await page.evaluate(() => {
    const nodes = window.__board.getState().document.nodes as Record<string, { opacity: number }>;
    return { s1: nodes.s1.opacity, c1: nodes.c1.opacity };
  });

  expect(opacity.s1).toBeLessThan(1);
  expect(opacity.c1).toBe(opacity.s1);
});
