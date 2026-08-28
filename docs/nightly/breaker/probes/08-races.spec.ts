import { test } from '@playwright/test';
import { doc, openBoard, shape, violations, watchErrors } from './helpers';

/** Экранная точка мирового центра узла. */
const screenOf = (page: import('@playwright/test').Page, id: string) =>
  page.evaluate((nodeId) => {
    const st = window.__board.getState();
    const d = st.document!;
    const n = d.nodes[nodeId] as never as Record<string, number>;
    const v = d.viewport;
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    return {
      x: rect.left + (n.x + n.width / 2) * v.zoom + v.x,
      y: rect.top + (n.y + n.height / 2) * v.zoom + v.y,
    };
  }, id);

test('08.1 удалить узел посреди его перетаскивания', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
  }, [shape('a', 200, 200), shape('b', 500, 200)]);
  await page.waitForTimeout(400);

  const p = await screenOf(page, 'a');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y + 40, { steps: 6 });
  // посреди жеста узел исчезает
  await page.evaluate(() => window.__board.getState().removeNodes(['a']));
  await page.mouse.move(p.x + 160, p.y + 120, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const d = await doc(page);
  console.log('узлы:', JSON.stringify(Object.keys(d!.nodes)));
  console.log('b на месте:', JSON.stringify(d!.nodes.b));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('08.2 удалить узел посреди рисования коннектора от него', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    b.setTool('connector');
  }, [shape('a', 200, 200), shape('b', 600, 200)]);
  await page.waitForTimeout(400);

  const from = await screenOf(page, 'a');
  const to = await screenOf(page, 'b');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, from.y, { steps: 8 });
  await page.evaluate(() => window.__board.getState().removeNodes(['a']));
  await page.waitForTimeout(100);
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const d = await doc(page);
  const conns = Object.values(d!.nodes).filter((n) => n.type === 'connector');
  console.log('коннекторы:', JSON.stringify(conns));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('08.3 удалить ЦЕЛЕВОЙ узел посреди рисования коннектора к нему', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    b.setTool('connector');
  }, [shape('a', 200, 200), shape('b', 600, 200)]);
  await page.waitForTimeout(400);

  const from = await screenOf(page, 'a');
  const to = await screenOf(page, 'b');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.evaluate(() => window.__board.getState().removeNodes(['b']));
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(500);

  const d = await doc(page);
  console.log('узлы:', JSON.stringify(Object.values(d!.nodes).map((n) => [n.id, n.type])));
  const conns = Object.values(d!.nodes).filter((n) => n.type === 'connector');
  console.log('коннекторы:', JSON.stringify(conns));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('08.4 удалить группу посреди перетаскивания её участника', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const g = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    return b.group(['a', 'b']);
  }, [shape('a', 200, 200), shape('b', 400, 200)]);
  await page.waitForTimeout(400);

  const p = await screenOf(page, 'a');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y + 30, { steps: 5 });
  await page.evaluate((id) => window.__board.getState().removeNodes([id]), g!);
  await page.mouse.move(p.x + 200, p.y + 150, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const d = await doc(page);
  console.log('узлы:', JSON.stringify(Object.keys(d!.nodes)));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('08.5 Delete с клавиатуры прямо во время перетаскивания', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    b.select(['a']);
  }, [shape('a', 200, 200), shape('b', 500, 200)]);
  await page.waitForTimeout(400);

  const p = await screenOf(page, 'a');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 50, p.y + 50, { steps: 6 });
  await page.keyboard.press('Delete');
  await page.mouse.move(p.x + 200, p.y + 150, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const d = await doc(page);
  console.log('узлы:', JSON.stringify(Object.keys(d!.nodes)));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('08.6 висячая ссылка из 08.2: что видно и переживает ли перезагрузку', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    b.setTool('connector');
  }, [shape('a', 200, 200), shape('b', 600, 200)]);
  await page.waitForTimeout(400);
  const from = await screenOf(page, 'a');
  const to = await screenOf(page, 'b');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, from.y, { steps: 8 });
  await page.evaluate(() => window.__board.getState().removeNodes(['a']));
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(2500);

  const before = await doc(page);
  const c = Object.values(before!.nodes).find((n) => n.type === 'connector');
  console.log('до перезагрузки:', JSON.stringify(c));
  console.log('ссылка from.nodeId существует?', Boolean(before!.nodes[(c as never as {from:{nodeId?:string}}).from.nodeId ?? '']));

  await page.reload();
  await page.waitForFunction(() => window.__board.getState().document !== null);
  await page.waitForTimeout(800);
  const toasts = await page.locator('[data-sonner-toast]').allInnerTexts();
  const after = await doc(page);
  console.log('после перезагрузки:', JSON.stringify(Object.values(after!.nodes).find((n) => n.type === 'connector')));
  console.log('тост при открытии:', JSON.stringify(toasts));
  console.log('errors:', JSON.stringify(errors));
});
