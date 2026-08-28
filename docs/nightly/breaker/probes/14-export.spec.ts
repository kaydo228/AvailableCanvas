import { test } from '@playwright/test';
import { openBoard, shape, watchErrors } from './helpers';

test.setTimeout(180_000);

const render = (page: import('@playwright/test').Page, scope: 'board' | 'selection', scale: 1 | 2) =>
  page.evaluate(async ([s, k]) => {
    const mod = await import('/src/features/export/model/exportPng.ts');
    try {
      const png = await mod.renderPng({ scope: s as 'board', scale: k as 1 });
      return { ok: true, width: png.width, height: png.height, bytes: png.dataUrl.length };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [scope, scale] as const);

test('14.1 экспорт PNG доски, на которой только группа-призрак', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    b.group(['a', 'b']);
  }, [shape('a', 0, 0), shape('b', 6000, 4000)]);
  await page.evaluate(() => window.__board.getState().removeNodes(['a', 'b']));
  await page.waitForTimeout(500);
  console.log('в документе:', JSON.stringify(await page.evaluate(() => Object.keys(window.__board.getState().document!.nodes))));
  console.log('PNG всей доски:', JSON.stringify(await render(page, 'board', 1)));

  // добавим один маленький узел рядом
  await page.evaluate((n) => window.__board.getState().addNode(n as never), shape('z', 0, 0));
  await page.waitForTimeout(300);
  console.log('PNG с одним узлом рядом с призраком:', JSON.stringify(await render(page, 'board', 1)));
  console.log('ожидалось: картинка вокруг узла 120×80, а не вокруг пустоты 6000×4000');
  console.log('errors:', JSON.stringify(errors.slice(0, 3)));
});

test('14.2 экспорт PNG пустой доски и доски из одного вырожденного коннектора', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  console.log('пустая доска:', JSON.stringify(await render(page, 'board', 1)));
  await page.evaluate(() => {
    window.__board.getState().addNode({
      id: 'c', type: 'connector',
      from: { point: { x: 10, y: 10 } }, to: { point: { x: 10, y: 10 } },
      routing: 'straight', stroke: '#000', strokeWidth: 2,
      startCap: 'none', endCap: 'arrow', locked: false, opacity: 1,
    } as never);
  });
  await page.waitForTimeout(400);
  console.log('коннектор нулевой длины:', JSON.stringify(await render(page, 'board', 1)));
  console.log('errors:', JSON.stringify(errors.slice(0, 3)));
});

test('14.3 экспорт PNG узла размером 1e6 и 2×', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate(() => {
    window.__board.getState().addNode({
      id: 'big', type: 'shape', shape: 'rect', x: 0, y: 0,
      width: 1_000_000, height: 1_000_000, rotation: 0, opacity: 1, locked: false,
      fill: '#fff', stroke: '#000', strokeWidth: 1,
    } as never);
  });
  await page.waitForTimeout(400);
  console.log('огромный узел 1×:', JSON.stringify(await render(page, 'board', 1)));
  console.log('огромный узел 2×:', JSON.stringify(await render(page, 'board', 2)));
  console.log('errors:', JSON.stringify(errors.slice(0, 3)));
});

test('14.4 экспорт JSON → импорт: круг с группой, коннектором и повёрнутым узлом', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
    b.connect({ nodeId: 'a', anchor: 'auto' }, { nodeId: 'b', anchor: 'auto' });
    b.rotateNode('a', 33);
    b.group(['a', 'b']);
  }, [shape('a', 0, 0), shape('b', 400, 200)]);
  await page.waitForTimeout(600);

  const file = await page.evaluate(async () => {
    const mod = await import('/src/features/export/model/transfer.ts');
    return JSON.stringify(await mod.buildBoardFile('Круг'));
  });

  await page.goto('/');
  await page.setInputFiles('input[type=file]', {
    name: 'круг.prostor.json',
    mimeType: 'application/json',
    buffer: Buffer.from(file, 'utf8'),
  });
  await page.waitForTimeout(2500);
  console.log('тост:', JSON.stringify(await page.locator('[data-sonner-toast]').allInnerTexts()));
  const after = await page.evaluate(() => {
    const d = window.__board.getState().document!;
    return Object.values(d.nodes).map((n) => [n.id, n.type]);
  });
  console.log('после импорта:', JSON.stringify(after));
  console.log('errors:', JSON.stringify(errors.slice(0, 3)));
});
