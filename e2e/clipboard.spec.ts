import { expect, type Page, test } from '@playwright/test';

/**
 * Копирование и вставка объектов, ТЗ 6.3.
 *
 * Юнитом это не проверить: вся суть в том, доходят ли до страницы СОБЫТИЯ
 * `copy` и `paste` и переживает ли текст системный буфер. Здесь и проверяется
 * ровно это — нажатием клавиш, а не вызовом обработчика.
 */

const openBoard = async (page: Page, name: string) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill(name);
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  await expect(page.locator('canvas').first()).toBeVisible();
};

const addShape = (page: Page, id: string, x: number) =>
  page.evaluate(
    ([nodeId, left]) => {
      const board = window.__board.getState();
      board.addNode({
        id: nodeId as string,
        type: 'shape',
        shape: 'rect',
        x: left as number,
        y: 80,
        width: 160,
        height: 90,
        rotation: 0,
        opacity: 1,
        locked: false,
        fill: '#dbeafe',
        stroke: '#1d4ed8',
        strokeWidth: 2,
      });
      board.select([nodeId as string]);
    },
    [id, x] as const,
  );

const shapes = (page: Page) =>
  page.evaluate(() =>
    Object.values(window.__board.getState().document?.nodes ?? {})
      .filter((node) => node.type === 'shape')
      .map((node) => ({ id: node.id, x: node.type === 'shape' ? node.x : 0 })),
  );

test('Cmd+C и Cmd+V создают копию выделенного', async ({ page }) => {
  await openBoard(page, 'Буфер');
  await addShape(page, 'src', 80);

  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');

  const after = await shapes(page);
  expect(after).toHaveLength(2);
  // Оригинал на месте, копия — с новым id и смещена, чтобы её было видно.
  expect(after.map((node) => node.id)).toContain('src');
  expect(new Set(after.map((node) => node.x)).size).toBe(2);

  // Выделение переехало на копию: дальше работают с тем, что вставили.
  const selection = await page.evaluate(() => window.__board.getState().selection);
  expect(selection).toHaveLength(1);
  expect(selection[0]).not.toBe('src');
});

test('вторая вставка не ложится на первую', async ({ page }) => {
  await openBoard(page, 'Каскад');
  await addShape(page, 'src', 80);

  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await page.keyboard.press('ControlOrMeta+v');

  const positions = (await shapes(page)).map((node) => node.x);
  expect(positions).toHaveLength(3);
  expect(new Set(positions).size).toBe(3);
});

test('вставка работает в соседнем проекте', async ({ page }) => {
  await openBoard(page, 'Откуда');
  await addShape(page, 'src', 80);
  await page.keyboard.press('ControlOrMeta+c');

  await page.getByRole('link', { name: 'Назад к списку' }).click();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('Куда');
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page.locator('canvas').first()).toBeVisible();

  await page.keyboard.press('ControlOrMeta+v');

  await expect.poll(async () => (await shapes(page)).length, { timeout: 3000 }).toBe(1);
});
