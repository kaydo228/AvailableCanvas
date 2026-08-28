import { test } from '@playwright/test';
import { doc, openBoard, shape, violations, watchErrors } from './helpers';

test('05.1 нулевые, отрицательные, дробные и бесконечные размеры', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((n) => window.__board.getState().addNode(n as never), shape('a', 100, 100));
  const out = await page.evaluate(() => {
    const boxes = [
      { x: 0, y: 0, width: 0, height: 0 },
      { x: 0, y: 0, width: -300, height: -200 },
      { x: 0, y: 0, width: 0.0001, height: 1e9 },
      { x: Number.NaN, y: 5, width: 50, height: Number.NaN },
      { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 10 },
      { x: 1e308, y: 1e308, width: 1e308, height: 1e308 },
    ];
    const res: unknown[] = [];
    for (const box of boxes) {
      window.__board.getState().resizeNode('a', box as never);
      const n = window.__board.getState().document!.nodes.a as never as Record<string, number>;
      res.push([JSON.stringify(box), { x: n.x, y: n.y, w: n.width, h: n.height }]);
    }
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('05.2 то же через updateNode мимо resizeNode', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((n) => window.__board.getState().addNode(n as never), shape('a', 100, 100));
  const out = await page.evaluate(() => {
    const res: unknown[] = [];
    for (const patch of [{ width: -500 }, { width: 0 }, { height: Number.NaN }, { width: Number.POSITIVE_INFINITY }, { opacity: 99 }, { opacity: Number.NaN }, { opacity: -3 }]) {
      window.__board.getState().updateNode('a', patch as never);
      const n = window.__board.getState().document!.nodes.a as never as Record<string, number>;
      res.push([JSON.stringify(patch), { w: n.width, h: n.height, o: n.opacity }]);
    }
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('05.3 зум на границах и попытка выйти', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const out = await page.evaluate(() => {
    const res: unknown[] = [];
    const zoom = () => window.__board.getState().document!.viewport.zoom;
    // через zoomAt множителями
    for (const f of [100, 100, 100]) window.__board.getState().zoomAt({ x: 200, y: 200 }, f);
    res.push(['zoomAt ×100 трижды', zoom()]);
    for (const f of [0.0001, 0.0001, 0.0001]) window.__board.getState().zoomAt({ x: 200, y: 200 }, f);
    res.push(['zoomAt ×0.0001 трижды', zoom()]);
    // напрямую через setViewport — мимо clampZoom?
    for (const z of [99, -1, 0, Number.NaN, Number.POSITIVE_INFINITY, 0.05, 4.0001]) {
      window.__board.getState().setViewport({ x: 0, y: 0, zoom: z });
      res.push([`setViewport zoom=${z}`, zoom()]);
    }
    window.__board.getState().zoomAt({ x: 200, y: 200 }, Number.NaN);
    res.push(['zoomAt ×NaN', zoom()]);
    window.__board.getState().panBy(Number.NaN, Number.NaN);
    res.push(['panBy NaN', JSON.stringify(window.__board.getState().document!.viewport)]);
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('05.4 zoomToFit на пустой доске и на доске с одним коннектором в бесконечности', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate(() => {
    const b = window.__board.getState();
    b.zoomToFit();
  });
  console.log('пустая доска:', JSON.stringify((await doc(page))!.viewport));
  await page.evaluate(() => {
    const b = window.__board.getState();
    b.addNode({ id: 'c1', type: 'connector', from: { point: { x: -1e9, y: -1e9 } }, to: { point: { x: 1e9, y: 1e9 } }, routing: 'straight', stroke: '#000', strokeWidth: 1, startCap: 'none', endCap: 'arrow', locked: false, opacity: 1 } as never);
    b.zoomToFit();
  });
  await page.waitForTimeout(300);
  console.log('огромный коннектор:', JSON.stringify((await doc(page))!.viewport));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});
