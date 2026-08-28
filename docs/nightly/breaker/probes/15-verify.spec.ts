import { test } from '@playwright/test';
import { doc, openBoard, shape, watchErrors } from './helpers';

test('15.1 настоящий Cmd+D по группе со связью внутри', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    b.connect({ nodeId: 'a', anchor: 'auto' }, { nodeId: 'b', anchor: 'auto' });
    b.group(['a', 'b']);
  }, [shape('a', 100, 100), shape('b', 400, 100)]);
  await page.waitForTimeout(500);
  console.log('выделение после группировки:', JSON.stringify(await page.evaluate(() => window.__board.getState().selection.length)));
  await page.evaluate(() => {
    const b = window.__board.getState();
    const g = Object.values(b.document!.nodes).find((n) => n.type === 'group')!;
    b.select([g.id]);
  });
  await page.keyboard.press('Control+d');
  await page.keyboard.press('Meta+d');
  await page.waitForTimeout(600);
  const d = await doc(page);
  const types = Object.values(d!.nodes).map((n) => n.type);
  console.log('типы в документе:', JSON.stringify(types));
  console.log('коннекторов:', types.filter((t) => t === 'connector').length, '(было 1)');
  console.log('errors:', JSON.stringify(errors));
});

test('15.2 клик по узлу с односторонней связью не берёт сам узел', async ({ page }) => {
  await openBoard(page);
  const out = await page.evaluate(async (nodes) => {
    const b = window.__board.getState();
    const base = b.document!;
    const g = { id: 'g', type: 'group', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, locked: false, children: ['a'] };
    b.loadDocument({
      ...base,
      nodes: { a: { ...(nodes[0] as object), groupId: 'g' }, b: { ...(nodes[1] as object), groupId: 'g' }, g } as never,
      order: ['a', 'b', 'g'],
    });
    const mod = await import('/src/features/canvas/selection/groupSelection.ts');
    const doc2 = window.__board.getState().document!;
    return {
      кликПоB: mod.selectionForClick(doc2, 'b'),
      кликПоA: mod.selectionForClick(doc2, 'a'),
    };
  }, [shape('a', 0, 0), shape('b', 400, 0)]);
  console.log('клик по b даёт выделение:', JSON.stringify(out.кликПоB));
  console.log('клик по a даёт выделение:', JSON.stringify(out.кликПоA));
  console.log('ожидалось: клик по b выделяет что-то, включающее b');
});
