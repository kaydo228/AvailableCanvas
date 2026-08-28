import { expect, test } from '@playwright/test';
import { doc, openBoard, shape, violations, watchErrors } from './helpers';

test('01.1 удаление всех детей оставляет группу-призрак', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    b.group(['a', 'b']);
  }, [shape('a', 100, 100), shape('b', 300, 200)]);

  const before = await doc(page);
  const groupId = Object.values(before!.nodes).find((n) => n.type === 'group')!.id;

  // Удаляем детей поимённо, саму группу не трогаем.
  await page.evaluate(() => window.__board.getState().removeNodes(['a', 'b']));

  const after = await doc(page);
  console.log('ГРУППА ПОСЛЕ УДАЛЕНИЯ ДЕТЕЙ:', JSON.stringify(after!.nodes[groupId]));
  console.log('order:', JSON.stringify(after!.order));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('01.2 группа внутри группы, удалить среднюю', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const ids = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    const inner = b.group(['a', 'b']);
    const middle = b.group([inner!, 'c']);
    const outer = b.group([middle!, 'd']);
    return { inner, middle, outer };
  }, [shape('a', 0, 0), shape('b', 200, 0), shape('c', 400, 0), shape('d', 600, 0)]);
  console.log('ids:', JSON.stringify(ids));

  await page.evaluate((id) => window.__board.getState().removeNodes([id]), ids.middle!);

  const after = await doc(page);
  console.log('после удаления средней, nodes:', JSON.stringify(Object.keys(after!.nodes)));
  console.log('outer:', JSON.stringify(after!.nodes[ids.outer!]));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('01.3 разгруппировать среднюю (ungroup) во вложенной цепочке', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const ids = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    const inner = b.group(['a', 'b']);
    const outer = b.group([inner!, 'c']);
    return { inner, outer };
  }, [shape('a', 0, 0), shape('b', 200, 0), shape('c', 400, 0)]);

  await page.evaluate((id) => window.__board.getState().ungroup(id), ids.inner!);
  const after = await doc(page);
  console.log('outer.children:', JSON.stringify((after!.nodes[ids.outer!] as never as {children: string[]}).children));
  console.log('a.groupId:', (after!.nodes.a as never as {groupId?: string}).groupId);
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('01.4 группа сама в себе / цикл через прямой документ', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate(() => {
    const b = window.__board.getState();
    const base = window.__board.getState().document!;
    const g1 = { id: 'g1', type: 'group', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, locked: false, children: ['g2'], groupId: 'g2' };
    const g2 = { id: 'g2', type: 'group', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, locked: false, children: ['g1'], groupId: 'g1' };
    b.loadDocument({ ...base, nodes: { g1, g2 } as never, order: ['g1', 'g2'] });
  });
  await page.waitForTimeout(300);
  console.log('violations:', JSON.stringify(await violations(page)));
  // операции над циклом
  await page.evaluate(() => {
    const b = window.__board.getState();
    b.moveNodes(['g1'], 10, 10);
    b.rotateNode('g1', 45);
    b.resizeNode('g1', { x: 0, y: 0, width: 50, height: 50 });
    b.duplicateNodes(['g1']);
  });
  await page.waitForTimeout(300);
  const after = await doc(page);
  console.log('после операций, nodes:', JSON.stringify(Object.keys(after!.nodes)));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
  expect(errors.filter((e) => e.startsWith('pageerror'))).toEqual([]);
});
