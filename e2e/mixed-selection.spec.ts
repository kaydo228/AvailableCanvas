import { expect, test } from '@playwright/test';

/**
 * Разнотипное выделение в панели свойств (П7 из
 * docs/nightly/shell/01-план-починки.md).
 *
 * Поле честно писало «разные», но пикер стартовал с #ffffff, поповер
 * открывался под курсором, и один случайный клик затирал цвета всех
 * выделенных узлов. Здесь проверяется, что случайный клик больше ничего
 * не портит, а намеренное применение по-прежнему работает.
 */

const NODES = {
  sh: {
    id: 'sh',
    type: 'shape',
    shape: 'rect',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    rotation: 0,
    opacity: 1,
    locked: false,
    fill: '#ff0000',
    stroke: '#111111',
    strokeWidth: 2,
  },
  st: {
    id: 'st',
    type: 'sticky',
    x: 150,
    y: 0,
    width: 120,
    height: 120,
    rotation: 0,
    opacity: 0.2,
    locked: false,
    fill: '#00ff00',
    text: { value: 'С', fontSize: 16, color: '#222222', align: 'center' },
  },
};

const setup = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('Смешанное');
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);

  // Документ приезжает из IndexedDB асинхронно, и loadDocument обнуляет
  // выделение. Без этого ожидания узлы иногда добавлялись до загрузки
  // и тут же стирались — тест падал через раз.
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForFunction(() => window.__board.getState().document !== null);

  await page.evaluate((nodes) => {
    const board = window.__board.getState();
    for (const node of Object.values(nodes)) board.addNode(node as never);
    board.select(['sh', 'st']);
  }, NODES);

  await expect(page.getByText('Выделено: 2')).toBeVisible();
};

/** Кнопка-открывашка цвета в строке с этой подписью. */
const colorTrigger = (page: import('@playwright/test').Page, label: string) =>
  page.locator('aside label', { hasText: label }).getByRole('button');

const fills = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const document = window.__board.getState().document;
    return ['sh', 'st'].map((id) => (document?.nodes[id] as { fill: string }).fill);
  });

test('один клик по палитре при «разных» ничего не меняет', async ({ page }) => {
  await setup(page);
  expect(await fills(page)).toEqual(['#ff0000', '#00ff00']);

  await colorTrigger(page, 'Заливка').click();
  const picker = page.locator('.react-colorful__saturation');
  const box = await picker.boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);

  // Цвета узлов не тронуты — правка ждёт подтверждения.
  expect(await fills(page)).toEqual(['#ff0000', '#00ff00']);
  await expect(page.getByRole('button', { name: /Применить ко всем \(2\)/ })).toBeVisible();
});

test('намеренное применение по-прежнему красит всё выделение', async ({ page }) => {
  await setup(page);

  await colorTrigger(page, 'Заливка').click();
  await page.getByLabel('Цвет в HEX').fill('123456');
  await page.getByRole('button', { name: /Применить ко всем/ }).click();

  expect(await fills(page)).toEqual(['#123456', '#123456']);
});

test('прозрачность при разных значениях не показывает лживый ползунок', async ({ page }) => {
  await setup(page);

  // Ползунка нет вовсе: раньше он вставал на 0 % при значениях 1 и 0.2.
  await expect(page.locator('aside [role=slider]')).toHaveCount(0);

  await page.getByRole('button', { name: /Задать всем/ }).click();
  const opacities = await page.evaluate(() => {
    const document = window.__board.getState().document;
    return ['sh', 'st'].map((id) => (document?.nodes[id] as { opacity: number }).opacity);
  });
  expect(opacities[0]).toBeCloseTo(0.6, 2);
  expect(opacities[1]).toBeCloseTo(0.6, 2);
});
