import { test } from '@playwright/test';
import { doc, openBoard, violations, watchErrors } from './helpers';

test.setTimeout(180_000);

test('09.1 тысяча узлов в одной группе, потом Cmd+D по ней', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);

  const build = await page.evaluate(() => {
    const b = window.__board.getState();
    const ids: string[] = [];
    const t0 = performance.now();
    for (let i = 0; i < 1000; i += 1) {
      const id = `n${i}`;
      ids.push(id);
      b.addNode({
        id, type: 'shape', shape: 'rect',
        x: (i % 40) * 140, y: Math.floor(i / 40) * 100,
        width: 120, height: 80, rotation: 0, opacity: 1, locked: false,
        fill: '#ffd6a5', stroke: '#111111', strokeWidth: 2,
      } as never);
    }
    const tAdd = performance.now() - t0;
    const t1 = performance.now();
    const g = window.__board.getState().group(ids);
    return { tAdd, tGroup: performance.now() - t1, g };
  });
  console.log('добавление 1000 узлов, мс:', Math.round(build.tAdd));
  console.log('group(1000), мс:', Math.round(build.tGroup));

  const dup = await page.evaluate((id) => {
    const t = performance.now();
    const created = window.__board.getState().duplicateNodes([id]);
    return { ms: performance.now() - t, n: created.length };
  }, build.g!);
  console.log('duplicateNodes(группа из 1000), мс:', Math.round(dup.ms), 'создано:', dup.n);

  await page.waitForTimeout(2000);
  const d = await doc(page);
  console.log('узлов в документе:', Object.keys(d!.nodes).length, 'в order:', d!.order.length);
  console.log('violations:', JSON.stringify((await violations(page)).slice(0, 3)));

  // отзывчивость после
  const t = Date.now();
  await page.evaluate(() => window.__board.getState().zoomToFit());
  await page.waitForTimeout(300);
  console.log('zoomToFit после, мс:', Date.now() - t);
  console.log('errors:', JSON.stringify(errors.slice(0, 5)), 'всего', errors.length);
});

test('09.2 поворот и растяжение группы из 1000 узлов', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const g = await page.evaluate(() => {
    const b = window.__board.getState();
    const ids: string[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const id = `n${i}`;
      ids.push(id);
      b.addNode({
        id, type: 'shape', shape: 'rect',
        x: (i % 40) * 140, y: Math.floor(i / 40) * 100,
        width: 120, height: 80, rotation: 0, opacity: 1, locked: false,
        fill: '#a5d8ff', stroke: '#111111', strokeWidth: 2,
      } as never);
    }
    return window.__board.getState().group(ids);
  });

  const timings = await page.evaluate((id) => {
    const out: [string, number][] = [];
    let t = performance.now();
    window.__board.getState().rotateNode(id, 30);
    out.push(['rotate 30', performance.now() - t]);
    t = performance.now();
    window.__board.getState().rotateNode(id, 0);
    out.push(['rotate обратно', performance.now() - t]);
    t = performance.now();
    window.__board.getState().resizeNode(id, { x: 0, y: 0, width: 500, height: 300 } as never);
    out.push(['resize', performance.now() - t]);
    t = performance.now();
    window.__board.getState().moveNodes([id], 10, 10);
    out.push(['move', performance.now() - t]);
    return out;
  }, g!);
  console.log(JSON.stringify(timings.map(([k, v]) => [k, Math.round(v)])));

  const d = await doc(page);
  const n0 = d!.nodes.n0 as never as Record<string, number>;
  console.log('n0 после поворота туда-обратно и сжатия:', JSON.stringify({ x: +n0.x.toFixed(2), y: +n0.y.toFixed(2), w: +n0.width.toFixed(2), r: n0.rotation }));
  console.log('рамка группы:', JSON.stringify(d!.nodes[g!]));
  console.log('violations:', JSON.stringify((await violations(page)).slice(0, 3)));
  console.log('errors:', JSON.stringify(errors.slice(0, 5)), 'всего', errors.length);
});
