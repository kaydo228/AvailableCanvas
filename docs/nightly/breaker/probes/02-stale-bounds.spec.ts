import { expect, test } from '@playwright/test';
import { doc, openBoard, shape, watchErrors } from './helpers';

/** Рамка внешней группы после удаления части содержимого. */
test('02.1 рамка родительской группы не пересчитывается после удаления ребёнка', async ({ page }) => {
  await openBoard(page);
  const ids = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    return { g: b.group(['a', 'b', 'c']) };
  }, [shape('a', 0, 0), shape('b', 200, 0), shape('c', 1000, 0)]);

  const before = (await doc(page))!.nodes[ids.g!] as never as Record<string, number>;
  await page.evaluate(() => window.__board.getState().removeNodes(['c']));
  const after = (await doc(page))!.nodes[ids.g!] as never as Record<string, number>;

  console.log('до удаления :', JSON.stringify(before));
  console.log('после       :', JSON.stringify(after));
  console.log('ожидалось   : x=0 width=320 (a+b)');

  // Проверка: рамка обязана сжаться до a+b
  expect({ x: after.x, width: after.width }).toEqual({ x: 0, width: 320 });
});

test('02.2 то же через moveNodes — контрольный опыт, здесь пересчёт работает', async ({ page }) => {
  await openBoard(page);
  const ids = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    return { g: b.group(['a', 'b']) };
  }, [shape('a', 0, 0), shape('b', 200, 0)]);
  await page.evaluate(() => window.__board.getState().moveNodes(['b'], 500, 0));
  const after = (await doc(page))!.nodes[ids.g!] as never as Record<string, number>;
  console.log('после сдвига ребёнка:', JSON.stringify(after));
  expect(after.width).toBe(820);
});

test('02.3 призрак группы влияет на zoomToFit и на выделение', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const ids = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    return { g: b.group(['a', 'b']) };
  }, [shape('a', 0, 0), shape('b', 5000, 3000)]);

  await page.evaluate(() => window.__board.getState().removeNodes(['a', 'b']));
  await page.evaluate(() => {
    window.__board.getState().addNode(shapeFn() as never);
    function shapeFn() {
      return { id: 'z', type: 'shape', shape: 'rect', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, locked: false, fill: '#fff', stroke: '#000', strokeWidth: 1 };
    }
  });
  await page.evaluate(() => window.__board.getState().zoomToFit());
  const d = (await doc(page))!;
  console.log('в документе после удаления:', JSON.stringify(Object.keys(d.nodes)));
  console.log('призрак:', JSON.stringify(d.nodes[ids.g!]));
  console.log('viewport после zoomToFit:', JSON.stringify(d.viewport));
  console.log('ожидание: zoom≈подогнан под один узел 100×100, а не под 5000×3000');
  console.log('errors:', JSON.stringify(errors));
});
