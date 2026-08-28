import { test } from '@playwright/test';
import { doc, openBoard, shape, watchErrors } from './helpers';

const geom = async (page: import('@playwright/test').Page, ids: string[]) => {
  const d = await doc(page);
  return ids.map((id) => {
    const n = d!.nodes[id] as never as Record<string, number>;
    return `${id}: x=${+n.x.toFixed(1)} y=${+n.y.toFixed(1)} ${+n.width.toFixed(1)}×${+n.height.toFixed(1)}`;
  });
};

test('10.1 сжать группу в минимум и вернуть обратно', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const g = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    return b.group(['a', 'b', 'c']);
  }, [shape('a', 0, 0), shape('b', 500, 0), shape('c', 1000, 400)]);

  console.log('исходно:', JSON.stringify(await geom(page, ['a', 'b', 'c'])));
  console.log('рамка  :', JSON.stringify(await geom(page, [g!])));

  await page.evaluate((id) => window.__board.getState().resizeNode(id, { x: 0, y: 0, width: 10, height: 10 } as never), g!);
  console.log('сжали до 10×10:', JSON.stringify(await geom(page, ['a', 'b', 'c'])));
  console.log('рамка         :', JSON.stringify(await geom(page, [g!])));

  await page.evaluate((id) => window.__board.getState().resizeNode(id, { x: 0, y: 0, width: 1120, height: 480 } as never), g!);
  console.log('вернули 1120×480:', JSON.stringify(await geom(page, ['a', 'b', 'c'])));
  console.log('рамка           :', JSON.stringify(await geom(page, [g!])));
  console.log('ожидалось: a 120×80 в (0,0), b 120×80 в (500,0), c 120×80 в (1000,400)');
  console.log('errors:', JSON.stringify(errors));
});

test('10.2 растянуть группу в тысячу раз и обратно', async ({ page }) => {
  await openBoard(page);
  const g = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    return b.group(['a', 'b']);
  }, [shape('a', 0, 0), shape('b', 500, 0)]);
  console.log('исходно:', JSON.stringify(await geom(page, ['a', 'b'])));
  await page.evaluate((id) => window.__board.getState().resizeNode(id, { x: 0, y: 0, width: 620_000, height: 80_000 } as never), g!);
  console.log('×1000  :', JSON.stringify(await geom(page, ['a', 'b'])));
  await page.evaluate((id) => window.__board.getState().resizeNode(id, { x: 0, y: 0, width: 620, height: 80 } as never), g!);
  console.log('обратно:', JSON.stringify(await geom(page, ['a', 'b'])));
});

test('10.3 растянуть группу, у которой рамка нулевой высоты', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  // два узла на одной горизонтали высотой ровно 0 не бывает — делаем через плоскую линию: узел высотой 8 и второй с той же y
  const g = await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    return b.group(['a', 'b']);
  }, [shape('a', 0, 0, { height: 8 }), shape('b', 200, 0, { height: 8 })]);
  await page.evaluate((id) => {
    const st = window.__board.getState();
    st.resizeNode(id, { x: 0, y: 0, width: 320, height: 0 } as never);
    st.resizeNode(id, { x: 0, y: 0, width: 320, height: 500 } as never);
  }, g!);
  console.log('после нулевой высоты и растяжения:', JSON.stringify(await geom(page, ['a', 'b', g!])));
  console.log('errors:', JSON.stringify(errors));
});
