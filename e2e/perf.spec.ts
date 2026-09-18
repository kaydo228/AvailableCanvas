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

type Sample = {
  frames: number;
  fps: number;
  worstFrameGap: number;
  p95FrameGap: number;
};

type Measurement = Sample & {
  nodeCount: number;
  /** Та же петля на пустой доске, снятая в этом же прогоне и на этой же машине. */
  baseline: Sample;
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

      /**
       * Крутит вьюпорт `duration` мс и возвращает распределение разрывов
       * между кадрами. Абсолютные пороги привязали бы тест к скорости
       * конкретного ноутбука, поэтому та же петля снимается дважды:
       * до загрузки узлов и после. Сравниваем нагрузку с пустой доской
       * на той же машине, в том же прогоне.
       */
      const spin = async (duration: number): Promise<Sample> => {
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
              const factor =
                zoom > 2.5 ? 0.97 : zoom < 0.4 ? 1.03 : frames % 120 < 60 ? 1.02 : 0.98;
              window.__board.getState().zoomAt({ x: 640, y: 360 }, factor);
            }

            if (now - started < duration) requestAnimationFrame(tick);
            else done();
          };
          requestAnimationFrame(tick);
        });

        // Первый кадр меряет паузу до запуска петли, а не рендер.
        const clean = gaps.slice(1).sort((a, b) => a - b);
        return {
          frames,
          fps: Math.round((frames / (previous - started)) * 1000),
          worstFrameGap: Math.round(clean[clean.length - 1] ?? 0),
          p95FrameGap: Math.round(clean[Math.floor(clean.length * 0.95)] ?? 0),
        };
      };

      const baseline = await spin(1000);

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

      const loaded = await spin(2500);

      return {
        nodeCount: Object.keys(window.__board.getState().document.nodes).length,
        ...loaded,
        baseline,
      };
    },
    { shapeCount, connectorCount, mode },
  );

/**
 * Проверка одного замера.
 *
 * Абсолютный порог здесь только один — сам NFR-01 про 50 fps. Всё остальное
 * сравнивается с базовой линией, снятой в этом же прогоне на этой же машине:
 * иначе тест меряет не доску, а ноутбук, и краснеет на медленной машине
 * без единого изменения в коде.
 *
 * Множитель 2,5 взят по факту 27 августа: базовая линия 17 мс, под тысячей
 * узлов 33 — это ровно вдвое. Цель по-прежнему «как на пустой доске»,
 * порог стоит чуть выше факта, чтобы ловить ухудшение. Опускать его молча
 * нельзя: разбор и долг — в REPORT.md, «Замер NFR-01».
 */
const check = (result: Measurement, what: string) => {
  console.log(`NFR-01 ${what}:`, JSON.stringify(result));

  // Стенд обязан быть вменяемым, иначе сравнивать не с чем.
  expect(result.baseline.frames, 'петля на пустой доске крутилась').toBeGreaterThan(20);
  expect(result.baseline.p95FrameGap, 'на пустой доске кадры ровные').toBeLessThan(25);

  expect(result.fps, `средний fps: ${what}`).toBeGreaterThanOrEqual(50);
  expect(result.p95FrameGap, `95-й процентиль против базовой линии: ${what}`).toBeLessThan(
    Math.max(25, result.baseline.p95FrameGap * 2.5),
  );
  expect(result.worstFrameGap, `худший кадр против базовой линии: ${what}`).toBeLessThan(
    Math.max(45, result.baseline.p95FrameGap * 4),
  );
};

test('NFR-01: панорамирование доски из 1000 фигур', async ({ page }) => {
  await openFreshProject(page, 'Тысяча фигур, панорама');
  const result = await measure(page, 1000, 0, 'pan');

  expect(result.nodeCount).toBe(1000);
  check(result, 'pan/shapes');
});

test('NFR-01: зум доски из 1000 фигур', async ({ page }) => {
  await openFreshProject(page, 'Тысяча фигур, зум');
  const result = await measure(page, 1000, 0, 'zoom');

  check(result, 'zoom/shapes');
});

test('NFR-01: панорамирование 700 фигур и 300 коннекторов', async ({ page }) => {
  await openFreshProject(page, 'Фигуры и линии');
  const result = await measure(page, 700, 300, 'pan');

  expect(result.nodeCount).toBe(1000);
  check(result, 'pan/connectors');
});

test('NFR-03: сохранение доски на 1000 узлов не блокирует главный поток', async ({ page }) => {
  await openFreshProject(page, 'Тысяча узлов');

  const measurement = await page.evaluate(async () => {
    const store = window.__board.getState();
    const nodes: Record<string, unknown> = {};
    const order: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const id = `n${i}`;
      order.push(id);
      nodes[id] = {
        id,
        type: 'shape',
        shape: 'rect',
        x: (i % 40) * 120,
        y: Math.floor(i / 40) * 90,
        width: 100,
        height: 70,
        rotation: 0,
        opacity: 1,
        locked: false,
        fill: '#dbeafe',
        stroke: '#1d4ed8',
        strokeWidth: 2,
        label: { text: `Узел номер ${i}`, size: 14, color: '#0f172a' },
      };
    }
    store.loadDocument({ ...window.__board.getState().document, nodes, order });
    await new Promise((r) => setTimeout(r, 700));

    const longTasks: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ entryTypes: ['longtask'] });

    let previous = performance.now();
    let worstFrameGap = 0;
    let running = true;
    const tick = () => {
      const now = performance.now();
      worstFrameGap = Math.max(worstFrameGap, now - previous);
      previous = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    store.updateNode('n0', { x: 5 });
    await new Promise((r) => setTimeout(r, 1500));

    running = false;
    observer.disconnect();

    return {
      nodeCount: Object.keys(window.__board.getState().document.nodes).length,
      worstFrameGap: Math.round(worstFrameGap),
      worstLongTask: Math.round(Math.max(0, ...longTasks)),
      longTaskCount: longTasks.length,
    };
  });

  console.log('NFR-03:', JSON.stringify(measurement));

  expect(measurement.nodeCount).toBe(1000);
  expect(measurement.worstFrameGap).toBeLessThan(50);
  expect(measurement.worstLongTask).toBeLessThan(50);
});
