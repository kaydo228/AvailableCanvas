import { test } from '@playwright/test';
import { doc, openBoard, shape, violations, watchErrors } from './helpers';

test('03.1 Cmd+D по группе со связью внутри', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const g = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    b.connect({ nodeId: 'a', anchor: 'auto' }, { nodeId: 'b', anchor: 'auto' });
    return b.group(['a', 'b']);
  }, [shape('a', 0, 0), shape('b', 300, 0)]);

  const before = await doc(page);
  console.log('до дублирования, узлов:', Object.keys(before!.nodes).length, JSON.stringify(Object.values(before!.nodes).map((n) => n.type)));

  const created = await page.evaluate((id) => window.__board.getState().duplicateNodes([id]), g!);
  const after = await doc(page);
  const types = Object.values(after!.nodes).map((n) => n.type);
  console.log('создано:', created.length, 'типы в документе:', JSON.stringify(types));
  console.log('коннекторов было 1, стало:', types.filter((t) => t === 'connector').length);
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('03.2 Cmd+D по выделению «группа + коннектор»', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const ids = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    const c = b.connect({ nodeId: 'a', anchor: 'auto' }, { nodeId: 'b', anchor: 'auto' });
    return { g: b.group(['a', 'b']), c };
  }, [shape('a', 0, 0), shape('b', 300, 0)]);

  await page.evaluate((x) => window.__board.getState().duplicateNodes([x.g!, x.c]), ids);
  const after = await doc(page);
  const conns = Object.values(after!.nodes).filter((n) => n.type === 'connector');
  console.log('коннекторы:', JSON.stringify(conns.map((c) => ({ id: c.id, from: (c as never as {from: unknown}).from, to: (c as never as {to: unknown}).to }))));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('03.3 Cmd+D по коннектору, оба конца которого — один и тот же узел', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    b.connect({ nodeId: 'a', anchor: 'auto' }, { nodeId: 'a', anchor: 'auto' });
  }, [shape('a', 100, 100)]);
  await page.waitForTimeout(400);
  const d1 = await doc(page);
  const c = Object.values(d1!.nodes).find((n) => n.type === 'connector')!;
  console.log('петля:', JSON.stringify(c));
  await page.evaluate((id) => window.__board.getState().duplicateNodes([id]), c.id);
  await page.waitForTimeout(200);
  // и удалить узел под петлёй
  await page.evaluate(() => window.__board.getState().removeNodes(['a']));
  await page.waitForTimeout(300);
  const d2 = await doc(page);
  console.log('после удаления узла:', JSON.stringify(Object.values(d2!.nodes)));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('03.4 Cmd+D пятьдесят раз подряд по группе (рост документа)', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    b.group(['a', 'b']);
  }, [shape('a', 0, 0), shape('b', 300, 0)]);

  const t0 = Date.now();
  const sizes = await page.evaluate(() => {
    const out: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const b = window.__board.getState();
      b.duplicateNodes(b.selection.length ? b.selection : Object.keys(b.document!.nodes));
      out.push(Object.keys(window.__board.getState().document!.nodes).length);
    }
    return out;
  });
  console.log('размер документа по шагам:', JSON.stringify(sizes.slice(0, 10)), '…', sizes.at(-1));
  console.log('время, мс:', Date.now() - t0);
  console.log('violations:', JSON.stringify((await violations(page)).slice(0, 5)));
  console.log('errors:', JSON.stringify(errors.slice(0, 5)));
});
