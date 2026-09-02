import { expect, type Page, test } from '@playwright/test';

/**
 * Текстовый узел: цвет по умолчанию и ручки размера.
 *
 * Оба сценария — про то, что в юните не ловится. Цвет берётся из темы через
 * getComputedStyle, а темы в jsdom нет; схлопывание растянутого блока делал
 * рендерер Konva, которого в юните тоже нет.
 */

const openBoard = async (page: Page, theme: 'light' | 'dark') => {
  await page.goto('/');
  await page.evaluate((value) => {
    indexedDB.deleteDatabase('prostor');
    localStorage.setItem('prostor-theme', value);
  }, theme);
  await page.reload();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('Текст');
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  // Экран холста приезжает отдельным чанком — ждём сам канвас, а не адрес.
  await expect(page.locator('canvas').first()).toBeVisible();
};

const firstText = (page: Page) =>
  page.evaluate(() => {
    const nodes = Object.values(window.__board.getState().document?.nodes ?? {});
    const node = nodes.find((candidate) => candidate.type === 'text');
    return node?.type === 'text' ? { color: node.text.color, width: node.width } : null;
  });

test('на тёмной теме новый текст светлый', async ({ page }) => {
  await openBoard(page, 'dark');

  await page.getByRole('button', { name: 'Текст', exact: true }).click();
  // Кликаем по контейнеру холста, а не по <canvas>: слоёв Konva несколько,
  // и нижний перекрыт верхними — такой клик Playwright не пустит.
  await page
    .getByRole('application', { name: 'Холст доски' })
    .click({ position: { x: 300, y: 200 } });

  // Токен --ink тёмной темы. Тёмный текст на тёмной доске выглядит как
  // «текст не создался»: он есть в документе, но невидим.
  expect((await firstText(page))?.color).toBe('#e9ece6');
});

test('на светлой теме цвет прежний', async ({ page }) => {
  await openBoard(page, 'light');

  await page.getByRole('button', { name: 'Текст', exact: true }).click();
  // Кликаем по контейнеру холста, а не по <canvas>: слоёв Konva несколько,
  // и нижний перекрыт верхними — такой клик Playwright не пустит.
  await page
    .getByRole('application', { name: 'Холст доски' })
    .click({ position: { x: 300, y: 200 } });

  expect((await firstText(page))?.color).toBe('#191c1a');
});

test('растянутый ручками текст не схлопывается обратно', async ({ page }) => {
  await openBoard(page, 'light');

  await page.evaluate(() => {
    window.__board.getState().addNode({
      id: 't1',
      type: 'text',
      x: 40,
      y: 40,
      width: 200,
      height: 40,
      rotation: 0,
      opacity: 1,
      locked: false,
      autoWidth: true,
      text: { value: 'Привет', fontSize: 16, color: '#111827', align: 'left' },
    });
  });
  await page.evaluate(() =>
    window.__board.getState().resizeNode('t1', { x: 40, y: 40, width: 400, height: 120 }),
  );

  // Рендерер меряет строку в useLayoutEffect и при autoWidth возвращает
  // рамку в модель — до починки ширина откатывалась к ширине слова.
  await expect.poll(async () => (await firstText(page))?.width, { timeout: 3000 }).toBe(400);
});
