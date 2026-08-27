import { expect, test } from '@playwright/test';

/**
 * NFR-01: 1000 объектов, панорамирование и зум не ниже 50 fps.
 *
 * Требование существует с первого дня и до 27 августа не проверялось
 * ни разу — при том что маршрут каждого коннектора пересчитывается
 * на каждом кадре перетаскивания. На доске из десятка линий это незаметно,
 * и именно поэтому никто не спохватился.
 *
 * Меряем два состава по 1000 узлов:
 *   1) тысяча фигур — базовая нагрузка на рендер;
 *   2) 700 фигур и 300 коннекторов — плюс пересчёт маршрутов на кадре.
 * Второй и есть настоящая проверка: если просядет, просядет именно он.
 *
 * Считаем не «среднее fps», а худший разрыв между кадрами. Среднее гладит
 * ровно то, что человек и замечает: один кадр на 200 мс посреди ровного
 * движения виден, а в среднем не виден.
 */

type Measurement = {
  nodeCount: number;
  frames: number;
  fps: number;
  worstFrameGap: number;
  p95FrameGap: number;
};

const openFreshProject = async (page: import('@playwright/test').Page, name: string) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill(name);
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  await expect(page.locator('canvas').first()).toBeVisible();
};

/**
 * Гоняет вьюпорт из браузера и меряет кадры.
 *
 * `connectorCount` штук линий привязываются к соседним фигурам якорем
 * `auto` и раскладкой `elbow` — самый дорогой из трёх маршрутов: сторона
 * выбирается по взаимному положению, то есть считается заново на каждый кадр.
 */
const measure = (
  page: import('@playwright/test').Page,
  shapeCount: number,
  connectorCount: number,
  mode: 'pan' | 'zoom',
): Promise<Measurement> =>
  page.evaluate(
    async ({ shapeCount, connectorCount, mode }) => {
      const store = window.__board.getState();

      const nodes: Record<string, unknown> = {};
      const order: string[] = [];

      for (let i = 0; i < shapeCount; i++) {
        const id = `n${i}`;
        order.push(id);
        nodes[id] = {
          id,
          type: 'shape',
          shape: 'rect',
          x: (i % 40) * 220,
          y: Math.floor(i / 40) * 160,
          width: 120,
          height: 80,
          rotation: 0,
          opacity: 1,
          locked: false,
          fill: '#dbeafe',
          stroke: '#1d4ed8',
          strokeWidth: 2,
          label: { text: `Узел ${i}`, size: 14, color: '#0f172a' },
        };
      }

      for (let i = 0; i < connectorCount; i++) {
        const id = `c${i}`;
        order.push(id);
        nodes[id] = {
          id,
          type: 'connector',
          from: { nodeId: `n${i}`, anchor: 'auto' },
          to: { nodeId: `n${(i + 1) % shapeCount}`, anchor: 'auto' },
          routing: 'elbow',
          stroke: '#1d4ed8',
          strokeWidth: 2,
          startCap: 'none',
          endCap: 'arrow',
          locked: false,
          opacity: 1,
        };
      }

      store.loadDocument({ ...window.__board.getState().document, nodes, order });

      // Даём осесть открытию документа: первый рендер тысячи узлов
      // к движению отношения не имеет и мерить его нечестно.
      await new Promise((r) => setTimeout(r, 1200));

      const gaps: number[] = [];
      let previous = performance.now();
      const started = previous;
      let frames = 0;

      await new Promise<void>((done) => {
        const tick = () => {
          const now = performance.now();
          gaps.push(now - previous);
          previous = now;
          frames++;

          // Движение на каждом кадре — как при живом перетаскивании
          // или прокрутке колесом с зажатым Cmd.
          if (mode === 'pan') {
            window.__board.getState().panBy(-14, -9);
          } else {
            const zoom = window.__board.getState().document?.viewport.zoom ?? 1;
            // Пила между 0.4 и 2.5, чтобы не упереться в границы инварианта 5
            // и не мерить работу clampZoom вместо рендера.
            const factor = zoom > 2.5 ? 0.97 : zoom < 0.4 ? 1.03 : frames % 120 < 60 ? 1.02 : 0.98;
            window.__board.getState().zoomAt({ x: 640, y: 360 }, factor);
          }

          if (now - started < 2500) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });

      // Первый кадр меряет паузу до запуска, а не рендер.
      const clean = gaps.slice(1).sort((a, b) => a - b);
      const p95 = clean[Math.floor(clean.length * 0.95)] ?? 0;

      return {
        nodeCount: Object.keys(window.__board.getState().document.nodes).length,
        frames,
        fps: Math.round((frames / (previous - started)) * 1000),
        worstFrameGap: Math.round(clean[clean.length - 1] ?? 0),
        p95FrameGap: Math.round(p95),
      };
    },
    { shapeCount, connectorCount, mode },
  );

test('NFR-01 базовая линия: та же петля на почти пустой доске', async ({ page }) => {
  await openFreshProject(page, 'Базовая линия');
  const result = await measure(page, 10, 0, 'pan');
  console.log('NFR-01 baseline:', JSON.stringify(result));

  // Смысл этого сценария — не проверить приложение, а измерить сам стенд.
  // Без него числа ниже нечитаемы: если headless-браузер и на десяти узлах
  // роняет кадры, то «33 мс на тысяче» говорит о стенде, а не о доске.
  expect(result.frames, 'петля вообще крутилась').toBeGreaterThan(60);
});

test('NFR-01: панорамирование доски из 1000 фигур', async ({ page }) => {
  await openFreshProject(page, 'Тысяча фигур, панорама');
  const result = await measure(page, 1000, 0, 'pan');
  console.log('NFR-01 pan/shapes:', JSON.stringify(result));

  expect(result.nodeCount).toBe(1000);
  // Само требование NFR-01 — про частоту кадров, и оно выполняется.
  expect(result.fps, 'средний fps при панорамировании').toBeGreaterThanOrEqual(50);
  // А это — не цель, а зафиксированная сегодняшняя реальность. Цель 20 мс
  // (один пропущенный кадр при 60 Гц), факт — около 33 при базовой линии 17,
  // то есть примерно каждый десятый кадр теряется. Порог стоит выше факта,
  // чтобы ловить ухудшение, и ниже него нельзя опускать молча: разбор
  // и долг — в REPORT.md, «Замер NFR-01».
  expect(result.p95FrameGap, '95-й процентиль разрыва между кадрами').toBeLessThan(40);
  expect(result.worstFrameGap, 'худший кадр').toBeLessThan(70);
});

test('NFR-01: зум доски из 1000 фигур', async ({ page }) => {
  await openFreshProject(page, 'Тысяча фигур, зум');
  const result = await measure(page, 1000, 0, 'zoom');
  console.log('NFR-01 zoom/shapes:', JSON.stringify(result));

  expect(result.fps, 'средний fps при зуме').toBeGreaterThanOrEqual(50);
  expect(result.p95FrameGap, '95-й процентиль разрыва между кадрами').toBeLessThan(40);
  expect(result.worstFrameGap, 'худший кадр').toBeLessThan(70);
});

test('NFR-01: панорамирование 700 фигур и 300 коннекторов', async ({ page }) => {
  await openFreshProject(page, 'Фигуры и линии');
  const result = await measure(page, 700, 300, 'pan');
  console.log('NFR-01 pan/connectors:', JSON.stringify(result));

  expect(result.nodeCount).toBe(1000);
  expect(result.fps, 'средний fps с коннекторами').toBeGreaterThanOrEqual(50);
  expect(result.p95FrameGap, '95-й процентиль разрыва между кадрами').toBeLessThan(40);
  expect(result.worstFrameGap, 'худший кадр').toBeLessThan(70);
});
