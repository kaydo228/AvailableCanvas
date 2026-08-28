import { test } from '@playwright/test';
import { doc, openBoard, shape, violations, watchErrors } from './helpers';

const pos = async (page: import('@playwright/test').Page, ids: string[]) => {
  const d = await doc(page);
  return ids.map((id) => {
    const n = d!.nodes[id] as never as Record<string, number>;
    return { id, x: +n.x.toFixed(3), y: +n.y.toFixed(3), r: n.rotation };
  });
};

test('04.1 поворот группы туда и обратно: 90 и 0', async ({ page }) => {
  await openBoard(page);
  const g = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    return b.group(['a', 'b']);
  }, [shape('a', 0, 0), shape('b', 300, 100)]);

  console.log('исходно :', JSON.stringify(await pos(page, ['a', 'b'])));
  await page.evaluate((id) => window.__board.getState().rotateNode(id, 90), g!);
  console.log('после 90:', JSON.stringify(await pos(page, ['a', 'b'])));
  await page.evaluate((id) => window.__board.getState().rotateNode(id, 0), g!);
  console.log('обратно :', JSON.stringify(await pos(page, ['a', 'b'])));
});

test('04.2 поворот группы на 45 туда и обратно', async ({ page }) => {
  await openBoard(page);
  const g = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    return b.group(['a', 'b']);
  }, [shape('a', 0, 0), shape('b', 300, 100)]);

  console.log('исходно :', JSON.stringify(await pos(page, ['a', 'b'])));
  await page.evaluate((id) => window.__board.getState().rotateNode(id, 45), g!);
  console.log('после 45:', JSON.stringify(await pos(page, ['a', 'b'])));
  await page.evaluate((id) => window.__board.getState().rotateNode(id, 0), g!);
  console.log('обратно :', JSON.stringify(await pos(page, ['a', 'b'])));
});

test('04.3 поворот на 1 градус сто раз подряд против одного на 100', async ({ page }) => {
  await openBoard(page);
  const g = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    return b.group(['a', 'b']);
  }, [shape('a', 0, 0), shape('b', 300, 100)]);
  await page.evaluate((id) => {
    for (let i = 1; i <= 100; i += 1) window.__board.getState().rotateNode(id, i);
  }, g!);
  const step = await pos(page, ['a', 'b']);

  const g2 = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    b.removeNodes(Object.keys(b.document!.nodes));
    for (const n of nodes) b.addNode(n as never);
    return b.group(['a', 'b']);
  }, [shape('a', 0, 0), shape('b', 300, 100)]);
  await page.evaluate((id) => window.__board.getState().rotateNode(id, 100), g2!);
  const once = await pos(page, ['a', 'b']);

  console.log('по градусу :', JSON.stringify(step));
  console.log('сразу на 100:', JSON.stringify(once));
});

test('04.4 крайние углы: 720, -0, 1e9, NaN, Infinity', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((n) => window.__board.getState().addNode(n as never), shape('a', 100, 100));
  const out = await page.evaluate(() => {
    const b = window.__board.getState();
    const res: [string, unknown][] = [];
    for (const v of [720, -0, -720, 1e9, Number.NaN, Number.POSITIVE_INFINITY, 359.9999999]) {
      window.__board.getState().rotateNode('a', v as number);
      const r = (window.__board.getState().document!.nodes.a as never as { rotation: number }).rotation;
      res.push([String(v), [r, Object.is(r, -0)]]);
    }
    // через панель свойств
    b.updateNode('a', { rotation: 370 } as never);
    res.push(['updateNode 370', (window.__board.getState().document!.nodes.a as never as {rotation:number}).rotation]);
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('04.5 повёрнутый ребёнок + resize группы', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const g = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    b.rotateNode('a', 45);
    return b.group(['a', 'b']);
  }, [shape('a', 0, 0), shape('b', 300, 100)]);
  const before = (await doc(page))!.nodes[g!] as never as Record<string, number>;
  await page.evaluate((id) => window.__board.getState().resizeNode(id, { x: 0, y: 0, width: 100, height: 50 }), g!);
  const after = (await doc(page))!.nodes[g!] as never as Record<string, number>;
  console.log('рамка до :', JSON.stringify({ x: before.x, y: before.y, w: before.width, h: before.height }));
  console.log('просили  : 100×50 в (0,0)');
  console.log('стало    :', JSON.stringify({ x: after.x, y: after.y, w: after.width, h: after.height }));
  console.log('дети:', JSON.stringify(await pos(page, ['a', 'b'])));
  console.log('errors:', JSON.stringify(errors));
});
