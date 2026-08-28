import { test } from '@playwright/test';
import { doc, shape, violations, watchErrors } from './helpers';

const base = (nodes: Record<string, unknown>, order: string[]) => ({
  format: 'prostor-board',
  version: 1,
  name: 'Импорт',
  savedAt: Date.now(),
  document: {
    projectId: 'p1',
    schemaVersion: 1,
    nodes,
    order,
    viewport: { x: 0, y: 0, zoom: 1 },
    background: { color: '#ffffff', grid: 'dots' },
  },
  images: {},
});

const importFile = async (page: import('@playwright/test').Page, name: string, body: string) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.setInputFiles('input[type=file]', {
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(body, 'utf8'),
  });
  await page.waitForTimeout(2500);
  const toasts = await page.locator('[data-sonner-toast]').allInnerTexts();
  console.log('URL:', new URL(page.url()).pathname);
  console.log('тост:', JSON.stringify(toasts));
};

test('07.1 чужая схема, обрезанный файл, не JSON', async ({ page }) => {
  const errors = watchErrors(page);
  const full = JSON.stringify(base({ a: shape('a', 0, 0) }, ['a']));
  await importFile(page, 'чужая.json', JSON.stringify({ nodes: [], version: 'excalidraw' }));
  await importFile(page, 'обрезан.json', full.slice(0, Math.floor(full.length * 0.6)));
  await importFile(page, 'пустой.json', '');
  await importFile(page, 'массив.json', '[1,2,3]');
  await importFile(page, 'будущая.json', JSON.stringify({ format: 'prostor-board', version: 2, name: 'x', document: { schemaVersion: 1 } }));
  console.log('errors:', JSON.stringify(errors));
});

test('07.2 дубли в order, висячие id, узел без order', async ({ page }) => {
  const errors = watchErrors(page);
  const body = JSON.stringify(
    base({ a: shape('a', 0, 0), b: shape('b', 200, 0) }, ['a', 'a', 'a', 'ghost', 'b']),
  );
  await importFile(page, 'дубли.json', body);
  const d = await doc(page);
  console.log('order:', JSON.stringify(d?.order));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('07.3 односторонняя связь с группой: groupId есть, в children нет', async ({ page }) => {
  const errors = watchErrors(page);
  const g = {
    id: 'g', type: 'group', x: 0, y: 0, width: 100, height: 100,
    rotation: 0, opacity: 1, locked: false, children: ['a'],
  };
  const body = JSON.stringify(
    base(
      {
        a: { ...shape('a', 0, 0), groupId: 'g' },
        b: { ...shape('b', 400, 0), groupId: 'g' }, // в children его нет
        g,
      },
      ['a', 'b', 'g'],
    ),
  );
  await importFile(page, 'односторонняя.json', body);
  console.log('violations после импорта:', JSON.stringify(await violations(page)));

  // что делает клик по такому узлу и перемещение группы
  const res = await page.evaluate(() => {
    const st = () => window.__board.getState();
    st().moveNodes(['g'], 100, 0);
    const d = st().document!;
    return {
      a: (d.nodes.a as never as Record<string, number>).x,
      b: (d.nodes.b as never as Record<string, number>).x,
      g: JSON.stringify(d.nodes.g),
    };
  });
  console.log('после moveNodes(["g"], 100, 0):', JSON.stringify(res));
  console.log('ожидалось: и a, и b уехали на 100');
  console.log('errors:', JSON.stringify(errors));
});

test('07.4 конец линии: и nodeId, и point; ни одного; ссылка на группу', async ({ page }) => {
  const errors = watchErrors(page);
  const conn = (id: string, from: unknown, to: unknown) => ({
    id, type: 'connector', from, to, routing: 'straight',
    stroke: '#000', strokeWidth: 2, startCap: 'none', endCap: 'arrow',
    locked: false, opacity: 1,
  });
  const body = JSON.stringify(
    base(
      {
        a: shape('a', 0, 0),
        c1: conn('c1', { nodeId: 'a', point: { x: 5, y: 5 } }, {}),
        c2: conn('c2', {}, {}),
        c3: conn('c3', { nodeId: 'нетТакого' }, { point: { x: 1, y: 1 } }),
      },
      ['a', 'c1', 'c2', 'c3'],
    ),
  );
  await importFile(page, 'концы.json', body);
  const d = await doc(page);
  for (const id of ['c1', 'c2', 'c3']) console.log(id, JSON.stringify(d?.nodes[id]));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('07.5 группа, ребёнок которой — коннектор, и группа внутри самой себя', async ({ page }) => {
  const errors = watchErrors(page);
  const body = JSON.stringify(
    base(
      {
        a: shape('a', 0, 0),
        c1: { id: 'c1', type: 'connector', from: { point: { x: 0, y: 0 } }, to: { point: { x: 10, y: 10 } }, routing: 'straight', stroke: '#000', strokeWidth: 2, startCap: 'none', endCap: 'arrow', locked: false, opacity: 1, groupId: 'g' },
        g: { id: 'g', type: 'group', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, locked: false, children: ['a', 'c1', 'g'] },
      },
      ['a', 'c1', 'g'],
    ),
  );
  await importFile(page, 'странная-группа.json', body);
  const d = await doc(page);
  console.log('g:', JSON.stringify(d?.nodes.g));
  console.log('c1:', JSON.stringify(d?.nodes.c1));
  console.log('violations:', JSON.stringify(await violations(page)));
  const after = await page.evaluate(() => {
    window.__board.getState().removeNodes(['g']);
    return Object.keys(window.__board.getState().document!.nodes);
  });
  console.log('после удаления группы осталось:', JSON.stringify(after));
  console.log('errors:', JSON.stringify(errors));
});
