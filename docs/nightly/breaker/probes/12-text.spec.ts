import { test } from '@playwright/test';
import { doc, openBoard, violations, watchErrors } from './helpers';

test.setTimeout(180_000);

const ZWJ = '‍';
const FAMILY = `\u{1F468}${ZWJ}\u{1F469}${ZWJ}\u{1F467}${ZWJ}\u{1F466}`;
const FLAG = `\u{1F3F3}️${ZWJ}\u{1F308}`;
const WAVE = '\u{1F44B}\u{1F3FF}';
const COMBINING = `a${'́'.repeat(8)}`;
const RTL = `‮перевёрнутый‭ tail`;

test('12.1 очень длинный текст, эмодзи и переводы строк в стикере', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);

  const cases: [string, string][] = [
    ['100k символов', 'X'.repeat(100_000)],
    ['без пробелов 5k', 'W'.repeat(5000)],
    ['эмодзи с модификаторами', `${FAMILY}${FLAG}${WAVE}`.repeat(200)],
    ['5000 переводов строки', '\n'.repeat(5000)],
    ['комбинирующие', COMBINING.repeat(500)],
    ['RTL и управляющие', RTL],
    ['суррогатная половинка', `хвост\uD83D`],
  ];

  for (const [name, value] of cases) {
    const ms = await page.evaluate(
      async ([v]) => {
        const b = window.__board.getState();
        for (const id of Object.keys(b.document!.nodes)) window.__board.getState().removeNodes([id]);
        const t = performance.now();
        window.__board.getState().addNode({
          id: 'st', type: 'sticky', x: 100, y: 100, width: 200, height: 200,
          rotation: 0, opacity: 1, locked: false, fill: '#ffe066',
          text: { value: v as string, fontSize: 16, color: '#111111', align: 'left' },
        } as never);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return performance.now() - t;
      },
      [value],
    );
    console.log(`стикер «${name}»: ${Math.round(ms)} мс, ошибок ${errors.length}`);
  }
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors.slice(0, 5)));
});

test('12.2 длинная подпись коннектора и подпись фигуры', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  const ms = await page.evaluate(async () => {
    window.__board.getState().addNode({
      id: 'c', type: 'connector',
      from: { point: { x: 100, y: 100 } }, to: { point: { x: 500, y: 400 } },
      routing: 'curve', stroke: '#000', strokeWidth: 2,
      startCap: 'none', endCap: 'arrow', locked: false, opacity: 1,
      label: { value: 'подпись '.repeat(3000), fontSize: 16, color: '#111', align: 'center' },
    } as never);
    const t = performance.now();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - t;
  });
  console.log('подпись коннектора, кадр:', Math.round(ms), 'мс');

  await page.evaluate(() => {
    window.__board.getState().addNode({
      id: 's', type: 'shape', shape: 'rect', x: 600, y: 100, width: 120, height: 80,
      rotation: 0, opacity: 1, locked: false, fill: '#fff', stroke: '#000', strokeWidth: 2,
      label: { value: 'F'.repeat(20000), fontSize: 14, color: '#000', align: 'center' },
    } as never);
  });
  await page.waitForTimeout(1500);
  console.log('errors:', JSON.stringify(errors.slice(0, 5)), 'всего', errors.length);
  console.log('violations:', JSON.stringify(await violations(page)));
});

test('12.3 ввод текста через оверлей, узел исчезает во время ввода', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate(() => {
    window.__board.getState().addNode({
      id: 't', type: 'text', x: 200, y: 200, width: 300, height: 100,
      rotation: 0, opacity: 1, locked: false, autoWidth: false,
      text: { value: '', fontSize: 20, color: '#111', align: 'left' },
    } as never);
    window.__board.getState().startEditing('t');
  });
  await page.waitForTimeout(400);
  const area = page.locator('textarea');
  console.log('оверлей есть:', await area.count());
  await area.fill(`первая\nвторая\n\u{1F600}${FAMILY}\tтаб`);
  await page.evaluate(() => window.__board.getState().removeNodes(['t']));
  await page.waitForTimeout(300);
  await page.mouse.click(900, 600);
  await page.waitForTimeout(500);
  const d = await doc(page);
  console.log('узлы после:', JSON.stringify(Object.keys(d!.nodes)));
  console.log('editingNodeId:', await page.evaluate(() => window.__board.getState().editingNodeId));
  console.log('оверлей остался:', await page.locator('textarea').count());
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('12.4 текст с autoWidth и очень длинной строкой', async ({ page }) => {
  const errors = watchErrors(page);
  await openBoard(page);
  await page.evaluate(() => {
    window.__board.getState().addNode({
      id: 't', type: 'text', x: 0, y: 0, width: 100, height: 40,
      rotation: 0, opacity: 1, locked: false, autoWidth: true,
      text: { value: 'Z'.repeat(50_000), fontSize: 24, color: '#111', align: 'left' },
    } as never);
  });
  await page.waitForTimeout(2000);
  const d = await doc(page);
  const t = d!.nodes.t as never as Record<string, number>;
  console.log('узел:', JSON.stringify({ x: t.x, y: t.y, w: t.width, h: t.height }));
  console.log('errors:', JSON.stringify(errors.slice(0, 5)), 'всего', errors.length);
});
