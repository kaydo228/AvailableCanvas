import { expect, type Page, test } from '@playwright/test';

async function setup(page: Page) {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('Стрелка');
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForFunction(() => window.__board.getState().document !== null);
  await page.evaluate(() => {
    const board = window.__board.getState();
    for (const [id, x, y, width, height] of [
      ['a', 100, 180, 100, 60],
      ['wall', 270, 120, 100, 180],
      ['b', 470, 180, 100, 60],
    ] as const) {
      board.addNode({
        id,
        type: 'shape',
        shape: 'rect',
        x,
        y,
        width,
        height,
        rotation: 0,
        opacity: 1,
        locked: false,
        fill: '#283448',
        stroke: '#fff',
        strokeWidth: 2,
      });
    }
  });
}

async function route(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/features/canvas/connectors/routing.ts';
    const { connectorPoints } = await import(/* @vite-ignore */ modulePath);
    const document = window.__board.getState().document;
    if (!document) throw new Error('No document');
    const link = Object.values(document.nodes).find((node) => node.type === 'connector');
    return link ? { link, points: connectorPoints(link, document) as number[] } : null;
  });
}

function avoidsWall(points: number[], x: number, y: number, width: number, height: number) {
  for (let i = 2; i < points.length; i += 2) {
    const [x1, y1, x2, y2] = points.slice(i - 2, i + 2) as [number, number, number, number];
    expect(x1 === x2 || y1 === y2).toBe(true);
    const collision =
      x1 === x2
        ? x1 > x && x1 < x + width && Math.max(y1, y2) > y && Math.min(y1, y2) < y + height
        : y1 > y && y1 < y + height && Math.max(x1, x2) > x && Math.min(x1, x2) < x + width;
    expect(collision).toBe(false);
  }
}

test('Стрелка соединяет блоки, обходит контент и перестраивается после его перемещения', async ({
  page,
}) => {
  await setup(page);
  await page.getByTitle('Стрелка (P)').click();
  const box = await page.getByRole('application', { name: 'Холст доски' }).boundingBox();
  if (!box) throw new Error('холст не измерился');

  await page.mouse.move(box.x + 150, box.y + 210);
  await page.mouse.down();
  // A curved mouse gesture must not become stored freehand points.
  await page.mouse.move(box.x + 240, box.y + 80);
  await page.mouse.move(box.x + 430, box.y + 350);
  await page.mouse.move(box.x + 520, box.y + 210);
  await page.mouse.up();

  await expect.poll(async () => (await route(page))?.link.type).toBe('connector');
  const result = await route(page);
  if (!result) throw new Error('No connector');
  expect(result.link).toMatchObject({
    from: { nodeId: 'a' },
    to: { nodeId: 'b' },
    routing: 'elbow',
  });
  avoidsWall(result.points, 258, 108, 124, 204);
  expect(
    await page.evaluate(() =>
      Object.values(window.__board.getState().document?.nodes ?? {}).some(
        (node) => node.type === 'draw',
      ),
    ),
  ).toBe(false);
  await expect(page.getByTitle('Выбор (V)')).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(() => window.__board.getState().updateNode('wall', { y: 400 }));
  await expect.poll(async () => (await route(page))?.points).toEqual([200, 210, 470, 210]);
  await page.evaluate(() => window.__board.getState().updateNode('wall', { y: 100 }));
  const moved = await route(page);
  if (!moved) throw new Error('No connector after move');
  avoidsWall(moved.points, 270, 100, 100, 180);
  await page.evaluate(() => {
    const board = window.__board.getState();
    board.select(['wall']);
  });
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await route(page))?.points).toEqual([200, 210, 470, 210]);
});

test('Стрелка цепляется снаружи блока при увеличенном холсте', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => window.__board.getState().setViewport({ x: -100, y: -100, zoom: 1.5 }));
  await page.getByTitle('Стрелка (P)').click();
  const box = await page.getByRole('application', { name: 'Холст доски' }).boundingBox();
  if (!box) throw new Error('холст не измерился');
  await page.mouse.move(box.x + 210, box.y + 215);
  await page.mouse.down();
  await page.mouse.move(box.x + 595, box.y + 215, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () => (await route(page))?.link)
    .toMatchObject({ from: { nodeId: 'a', anchor: 'right' }, to: { nodeId: 'b', anchor: 'left' } });
});
