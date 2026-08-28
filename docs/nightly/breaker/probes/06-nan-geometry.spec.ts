import { test } from '@playwright/test';
import { doc, openBoard, shape, violations, watchErrors } from './helpers';

/** Сколько непрозрачных пикселей на холсте содержимого. */
const painted = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')];
    return canvases.map((c) => {
      const ctx = (c as HTMLCanvasElement).getContext('2d');
      if (!ctx) return -1;
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n += 1;
      return n;
    });
  });

test('06.1 NaN в ширине узла: что происходит с холстом', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
  }, [shape('a', 100, 100), shape('b', 300, 100, { fill: '#ff0000' })]);
  await page.waitForTimeout(500);
  console.log('пикселей до :', JSON.stringify(await painted(page)));

  await page.evaluate(() => window.__board.getState().updateNode('a', { width: Number.NaN } as never));
  await page.waitForTimeout(500);
  console.log('пикселей после NaN в a:', JSON.stringify(await painted(page)));
  console.log('a в модели:', JSON.stringify((await doc(page))!.nodes.a));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors.slice(0, 5)), 'всего', errors.length);
});

test('06.2 NaN в x узла и в подписи группы', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    b.group(['a', 'b']);
  }, [shape('a', 100, 100), shape('b', 300, 100)]);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__board.getState().updateNode('a', { x: Number.NaN } as never));
  await page.waitForTimeout(500);
  const d = await doc(page);
  const g = Object.values(d!.nodes).find((n) => n.type === 'group');
  console.log('рамка группы:', JSON.stringify(g));
  console.log('пикселей:', JSON.stringify(await painted(page)));
  console.log('errors:', JSON.stringify(errors.slice(0, 5)), 'всего', errors.length);
  // переживает ли перезагрузку
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForFunction(() => window.__board.getState().document !== null);
  await page.waitForTimeout(500);
  const after = await doc(page);
  console.log('после перезагрузки a:', JSON.stringify(after!.nodes.a));
  const g2 = Object.values(after!.nodes).find((n) => n.type === 'group');
  console.log('после перезагрузки группа:', JSON.stringify(g2));
});

test('06.3 узел шириной 1 через панель свойств (min=1 против MIN_NODE_SIDE=8)', async ({ page }) => {
  await openBoard(page);
  await page.evaluate((n) => window.__board.getState().addNode(n as never), shape('a', 100, 100));
  await page.evaluate(() => window.__board.getState().updateNode('a', { width: 1, height: 1 } as never));
  const d = await doc(page);
  console.log('узел:', JSON.stringify(d!.nodes.a));
  console.log('MIN_NODE_SIDE в resize.ts = 8, панель разрешает min=1');
});
