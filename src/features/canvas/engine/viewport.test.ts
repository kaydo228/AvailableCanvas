import { describe, expect, it } from 'vitest';

import type {
  Rect,
  ScreenPoint,
  Size,
  WorldPoint,
} from '@/features/canvas/engine/contract';
import {
  clampZoom,
  fitToBox,
  panBy,
  toScreen,
  toWorld,
  visibleWorldRect,
  zoomAt,
} from '@/features/canvas/engine/viewport';
import type { Viewport } from '@/shared/types/document';
import { ZOOM_MAX, ZOOM_MIN } from '@/shared/types/document';

/** Точность сравнения: погрешность double на этих величинах ~1e-12. */
const PRECISION = 6;
const EPS = 1e-9;

const viewports: Viewport[] = [
  { x: 0, y: 0, zoom: 1 },
  { x: 120, y: -40, zoom: 1 },
  { x: -333.5, y: 777.25, zoom: ZOOM_MIN },
  { x: 15, y: 15, zoom: 0.37 },
  { x: -1200, y: 640, zoom: 2.5 },
  { x: 0.5, y: -0.5, zoom: ZOOM_MAX },
];

const probes: ScreenPoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: -1 },
  { x: 640, y: 480 },
  { x: -1234.5, y: 9876.25 },
  { x: 0.125, y: 0.375 },
];

const expectPointClose = (actual: WorldPoint, expected: WorldPoint): void => {
  expect(actual.x).toBeCloseTo(expected.x, PRECISION);
  expect(actual.y).toBeCloseTo(expected.y, PRECISION);
};

/** Лежит ли `inner` целиком внутри `outer` — с проверкой каждой стороны. */
const expectContains = (outer: Rect, inner: Rect): void => {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - EPS);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - EPS);
  expect(inner.x + inner.width).toBeLessThanOrEqual(
    outer.x + outer.width + EPS,
  );
  expect(inner.y + inner.height).toBeLessThanOrEqual(
    outer.y + outer.height + EPS,
  );
};

describe('toWorld / toScreen', () => {
  it('переводит экран в мир по формуле (screen - {x,y}) / zoom', () => {
    const viewport: Viewport = { x: 100, y: 50, zoom: 2 };
    expect(toWorld({ x: 300, y: 250 }, viewport)).toEqual({ x: 100, y: 100 });
  });

  it('переводит мир в экран по формуле world * zoom + {x,y}', () => {
    const viewport: Viewport = { x: 100, y: 50, zoom: 2 };
    expect(toScreen({ x: 100, y: 100 }, viewport)).toEqual({ x: 300, y: 250 });
  });

  it('при zoom=1 и нулевом смещении координаты совпадают', () => {
    const viewport: Viewport = { x: 0, y: 0, zoom: 1 };
    expect(toWorld({ x: 42, y: -7 }, viewport)).toEqual({ x: 42, y: -7 });
    expect(toScreen({ x: 42, y: -7 }, viewport)).toEqual({ x: 42, y: -7 });
  });

  it.each(viewports)(
    'round-trip экран → мир → экран при zoom $zoom, x $x, y $y',
    (viewport) => {
      for (const point of probes) {
        expectPointClose(toScreen(toWorld(point, viewport), viewport), point);
      }
    },
  );

  it.each(viewports)(
    'round-trip мир → экран → мир при zoom $zoom, x $x, y $y',
    (viewport) => {
      for (const point of probes) {
        expectPointClose(toWorld(toScreen(point, viewport), viewport), point);
      }
    },
  );

  it('не мутирует аргументы', () => {
    const viewport: Viewport = { x: 10, y: 20, zoom: 2 };
    const point: ScreenPoint = { x: 5, y: 6 };
    toWorld(point, viewport);
    toScreen(point, viewport);
    expect(viewport).toEqual({ x: 10, y: 20, zoom: 2 });
    expect(point).toEqual({ x: 5, y: 6 });
  });
});

describe('clampZoom', () => {
  it.each([0.1, 0.25, 0.5, 1, 2, 3.99, 4])(
    'значение %s внутри диапазона не меняется',
    (zoom) => {
      expect(clampZoom(zoom)).toBe(zoom);
    },
  );

  it('возвращает границы как есть', () => {
    expect(clampZoom(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(clampZoom(ZOOM_MAX)).toBe(ZOOM_MAX);
  });

  it.each([0.09999, 0.05, 0, -1, -1e6])(
    'значение %s ниже минимума зажимается в ZOOM_MIN',
    (zoom) => {
      expect(clampZoom(zoom)).toBe(ZOOM_MIN);
    },
  );

  it.each([4.00001, 5, 100, 1e6])(
    'значение %s выше максимума зажимается в ZOOM_MAX',
    (zoom) => {
      expect(clampZoom(zoom)).toBe(ZOOM_MAX);
    },
  );

  it('обрабатывает бесконечности и NaN, не выпуская не-число наружу', () => {
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(ZOOM_MAX);
    expect(clampZoom(Number.NEGATIVE_INFINITY)).toBe(ZOOM_MIN);
    expect(clampZoom(Number.NaN)).toBe(ZOOM_MIN);
  });
});

interface ZoomCase {
  name: string;
  viewport: Viewport;
  cursor: ScreenPoint;
  factor: number;
  expectedZoom: number;
}

const zoomCases: ZoomCase[] = [
  {
    name: 'приблизить в центре канваса',
    viewport: { x: 0, y: 0, zoom: 1 },
    cursor: { x: 400, y: 300 },
    factor: 1.1,
    expectedZoom: 1.1,
  },
  {
    name: 'приблизить в самом углу (0,0)',
    viewport: { x: 120, y: -40, zoom: 1 },
    cursor: { x: 0, y: 0 },
    factor: 1.25,
    expectedZoom: 1.25,
  },
  {
    name: 'отдалить при zoom=2',
    viewport: { x: -300, y: 210, zoom: 2 },
    cursor: { x: 960, y: 540 },
    factor: 0.9,
    expectedZoom: 1.8,
  },
  {
    name: 'дробный зум и дробный курсор',
    viewport: { x: 37.5, y: -12.25, zoom: 0.75 },
    cursor: { x: 123.5, y: 456.75 },
    factor: 1.05,
    expectedZoom: 0.7875,
  },
  {
    name: 'сильное приближение с мелкого зума',
    viewport: { x: -1000, y: -1000, zoom: 0.2 },
    cursor: { x: 1919, y: 1079 },
    factor: 3,
    expectedZoom: 0.6000000000000001,
  },
  {
    name: 'сильное отдаление с крупного зума',
    viewport: { x: 800, y: 600, zoom: 3 },
    cursor: { x: 5, y: 995 },
    factor: 0.25,
    expectedZoom: 0.75,
  },
  {
    name: 'зум упирается в верхнюю границу',
    viewport: { x: 100, y: 100, zoom: 3 },
    cursor: { x: 640, y: 400 },
    factor: 2,
    expectedZoom: ZOOM_MAX,
  },
  {
    name: 'зум упирается в нижнюю границу',
    viewport: { x: -50, y: 80, zoom: 0.15 },
    cursor: { x: 200, y: 700 },
    factor: 0.5,
    expectedZoom: ZOOM_MIN,
  },
  {
    name: 'множитель 1 ничего не меняет',
    viewport: { x: 64, y: -128, zoom: 1.5 },
    cursor: { x: 333, y: 222 },
    factor: 1,
    expectedZoom: 1.5,
  },
];

describe('zoomAt', () => {
  it.each(zoomCases)(
    'мировая точка под курсором неподвижна: $name',
    ({ viewport, cursor, factor }) => {
      const before = toWorld(cursor, viewport);
      const next = zoomAt(viewport, cursor, factor);
      const after = toWorld(cursor, next);

      expectPointClose(after, before);
      // И обратно: та же мировая точка проецируется ровно в курсор.
      expectPointClose(toScreen(before, next), cursor);
    },
  );

  it.each(zoomCases)('зум зажат в диапазоне: $name', ({
    viewport,
    cursor,
    factor,
    expectedZoom,
  }) => {
    const next = zoomAt(viewport, cursor, factor);
    expect(next.zoom).toBeCloseTo(expectedZoom, PRECISION);
    expect(next.zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(next.zoom).toBeLessThanOrEqual(ZOOM_MAX);
  });

  it('точка под курсором неподвижна на матрице курсоров и множителей', () => {
    const cursors: ScreenPoint[] = [
      { x: 0, y: 0 },
      { x: 800, y: 0 },
      { x: 0, y: 600 },
      { x: 400, y: 300 },
      { x: 799.5, y: 599.25 },
    ];
    const factors = [0.5, 0.9, 1.1, 1.2, 2];

    for (const viewport of viewports) {
      for (const cursor of cursors) {
        for (const factor of factors) {
          const before = toWorld(cursor, viewport);
          const after = toWorld(cursor, zoomAt(viewport, cursor, factor));
          expectPointClose(after, before);
        }
      }
    }
  });

  it('на границе ZOOM_MAX приближение не двигает вид', () => {
    const viewport: Viewport = { x: 222, y: -333, zoom: ZOOM_MAX };
    for (const factor of [1.0001, 1.1, 2, 100]) {
      expect(zoomAt(viewport, { x: 400, y: 300 }, factor)).toEqual(viewport);
    }
  });

  it('на границе ZOOM_MIN отдаление не двигает вид', () => {
    const viewport: Viewport = { x: -17.5, y: 940, zoom: ZOOM_MIN };
    for (const factor of [0.9999, 0.9, 0.5, 0.01]) {
      expect(zoomAt(viewport, { x: 123, y: 456 }, factor)).toEqual(viewport);
    }
  });

  it('повторный зум в упор не накапливает дрейф', () => {
    const start: Viewport = { x: 640.25, y: -480.75, zoom: ZOOM_MAX };
    let current = start;
    for (let i = 0; i < 50; i += 1) {
      current = zoomAt(current, { x: 1234.5, y: 678.25 }, 1.1);
    }
    expect(current).toEqual(start);
  });

  it('у границы смещение считается от фактического зума, а не от запрошенного', () => {
    const viewport: Viewport = { x: 100, y: 100, zoom: 3 };
    const cursor: ScreenPoint = { x: 640, y: 400 };
    const world = toWorld(cursor, viewport);

    const next = zoomAt(viewport, cursor, 2); // запрошено 6, применится 4

    expect(next.zoom).toBe(ZOOM_MAX);
    expect(next.x).toBeCloseTo(cursor.x - world.x * ZOOM_MAX, PRECISION);
    expect(next.y).toBeCloseTo(cursor.y - world.y * ZOOM_MAX, PRECISION);
    // Наивная реализация посчитала бы смещение от запрошенных 6 — это другой вид.
    expect(next.x).not.toBeCloseTo(cursor.x - world.x * 6, PRECISION);
  });

  it('нефинитный или неположительный множитель оставляет вид прежним', () => {
    const viewport: Viewport = { x: 12, y: 34, zoom: 1.5 };
    for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(zoomAt(viewport, { x: 10, y: 10 }, factor)).toEqual(viewport);
    }
  });

  it('возвращает новый объект и не мутирует вход', () => {
    const viewport: Viewport = { x: 5, y: 6, zoom: 2 };
    const next = zoomAt(viewport, { x: 100, y: 100 }, 1.5);
    expect(next).not.toBe(viewport);
    expect(viewport).toEqual({ x: 5, y: 6, zoom: 2 });

    const clamped = zoomAt({ x: 5, y: 6, zoom: ZOOM_MAX }, { x: 1, y: 1 }, 2);
    expect(clamped).not.toBe(viewport);
  });
});

describe('panBy', () => {
  it('сдвигает вид на экранную дельту, зум не трогает', () => {
    expect(panBy({ x: 100, y: 50, zoom: 2 }, 30, -70)).toEqual({
      x: 130,
      y: -20,
      zoom: 2,
    });
  });

  it('нулевая дельта оставляет вид прежним', () => {
    const viewport: Viewport = { x: -3.5, y: 8.25, zoom: 0.4 };
    expect(panBy(viewport, 0, 0)).toEqual(viewport);
  });

  it('мировая точка под фиксированным пикселем едет на dx/zoom', () => {
    const viewport: Viewport = { x: -120, y: 340, zoom: 2.5 };
    const pixel: ScreenPoint = { x: 400, y: 300 };
    const dx = 60;
    const dy = -25;

    const before = toWorld(pixel, viewport);
    const after = toWorld(pixel, panBy(viewport, dx, dy));

    expect(after.x).toBeCloseTo(before.x - dx / viewport.zoom, PRECISION);
    expect(after.y).toBeCloseTo(before.y - dy / viewport.zoom, PRECISION);
  });

  it('панорамирование обратимо', () => {
    const viewport: Viewport = { x: 11, y: 22, zoom: 1.75 };
    expect(panBy(panBy(viewport, 250, -400), -250, 400)).toEqual(viewport);
  });

  it('возвращает новый объект и не мутирует вход', () => {
    const viewport: Viewport = { x: 1, y: 2, zoom: 1 };
    const next = panBy(viewport, 10, 10);
    expect(next).not.toBe(viewport);
    expect(viewport).toEqual({ x: 1, y: 2, zoom: 1 });
  });
});

interface FitCase {
  name: string;
  box: Rect;
  canvas: Size;
  padding: number;
}

const fitCases: FitCase[] = [
  {
    name: 'бокс в начале координат, широкий канвас',
    box: { x: 0, y: 0, width: 400, height: 300 },
    canvas: { width: 1200, height: 800 },
    padding: 40,
  },
  {
    name: 'бокс в отрицательных координатах',
    box: { x: -500, y: -200, width: 400, height: 300 },
    canvas: { width: 1200, height: 800 },
    padding: 40,
  },
  {
    name: 'широкий бокс, узкий канвас',
    box: { x: 1000, y: 2000, width: 1600, height: 400 },
    canvas: { width: 800, height: 600 },
    padding: 40,
  },
  {
    name: 'высокий бокс',
    box: { x: -50, y: -900, width: 120, height: 1800 },
    canvas: { width: 1024, height: 768 },
    padding: 24,
  },
  {
    name: 'крошечный бокс — зум упрётся в ZOOM_MAX',
    box: { x: -10, y: -10, width: 20, height: 20 },
    canvas: { width: 640, height: 480 },
    padding: 40,
  },
  {
    name: 'нулевой отступ',
    box: { x: 0, y: 0, width: 400, height: 300 },
    canvas: { width: 1200, height: 800 },
    padding: 0,
  },
];

describe('fitToBox', () => {
  it.each(fitCases)(
    'бокс целиком внутри видимой области: $name',
    ({ box, canvas, padding }) => {
      const viewport = fitToBox(box, canvas, padding);
      expectContains(visibleWorldRect(viewport, canvas), box);
    },
  );

  it.each(fitCases)('зум остаётся в диапазоне: $name', ({
    box,
    canvas,
    padding,
  }) => {
    const { zoom } = fitToBox(box, canvas, padding);
    expect(zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(zoom).toBeLessThanOrEqual(ZOOM_MAX);
  });

  it.each(fitCases)('бокс отцентрован в канвасе: $name', ({
    box,
    canvas,
    padding,
  }) => {
    const viewport = fitToBox(box, canvas, padding);
    const visible = visibleWorldRect(viewport, canvas);

    expect(visible.x + visible.width / 2).toBeCloseTo(
      box.x + box.width / 2,
      PRECISION,
    );
    expect(visible.y + visible.height / 2).toBeCloseTo(
      box.y + box.height / 2,
      PRECISION,
    );
  });

  it('оставляет ровно padding пикселей по ограничивающей стороне', () => {
    const box: Rect = { x: 0, y: 0, width: 400, height: 300 };
    const canvas: Size = { width: 1200, height: 800 };
    const padding = 40;

    const viewport = fitToBox(box, canvas, padding);
    // По высоте: (800 - 80) / 300 = 2.4 — эта сторона и ограничивает.
    expect(viewport.zoom).toBeCloseTo(2.4, PRECISION);

    const topLeft = toScreen({ x: box.x, y: box.y }, viewport);
    const bottomRight = toScreen(
      { x: box.x + box.width, y: box.y + box.height },
      viewport,
    );

    expect(topLeft.y).toBeCloseTo(padding, PRECISION);
    expect(canvas.height - bottomRight.y).toBeCloseTo(padding, PRECISION);
    // По ширине зазор больше — бокс уже канваса.
    expect(topLeft.x).toBeGreaterThan(padding);
  });

  it('по умолчанию отступ равен 40', () => {
    const box: Rect = { x: 12, y: -34, width: 500, height: 260 };
    const canvas: Size = { width: 900, height: 700 };
    expect(fitToBox(box, canvas)).toEqual(fitToBox(box, canvas, 40));
  });

  it('крошечный бокс не приближается сильнее ZOOM_MAX', () => {
    const viewport = fitToBox(
      { x: 100, y: 100, width: 1, height: 1 },
      { width: 1200, height: 800 },
    );
    expect(viewport.zoom).toBe(ZOOM_MAX);
  });

  it('вырожденный бокс-точка ставится в центр канваса при ZOOM_MAX', () => {
    const canvas: Size = { width: 800, height: 600 };
    const viewport = fitToBox({ x: 250, y: -75, width: 0, height: 0 }, canvas);

    expect(viewport.zoom).toBe(ZOOM_MAX);
    expectPointClose(toScreen({ x: 250, y: -75 }, viewport), {
      x: canvas.width / 2,
      y: canvas.height / 2,
    });
  });

  it('огромный бокс не отдаляется сильнее ZOOM_MIN (и тогда не влезает)', () => {
    const box: Rect = { x: 0, y: 0, width: 50000, height: 40000 };
    const canvas: Size = { width: 1200, height: 800 };
    const viewport = fitToBox(box, canvas);

    expect(viewport.zoom).toBe(ZOOM_MIN);
    expect(visibleWorldRect(viewport, canvas).width).toBeLessThan(box.width);
  });

  it('нормализует бокс с отрицательными размерами', () => {
    const canvas: Size = { width: 1000, height: 700 };
    const dragged: Rect = { x: 400, y: 300, width: -400, height: -300 };
    const normal: Rect = { x: 0, y: 0, width: 400, height: 300 };
    expect(fitToBox(dragged, canvas)).toEqual(fitToBox(normal, canvas));
  });

  it('канвас меньше двойного отступа не ломает вид', () => {
    const viewport = fitToBox(
      { x: 0, y: 0, width: 400, height: 300 },
      { width: 50, height: 50 },
      40,
    );
    expect(Number.isFinite(viewport.x)).toBe(true);
    expect(Number.isFinite(viewport.y)).toBe(true);
    expect(viewport.zoom).toBe(ZOOM_MIN);
  });
});

describe('visibleWorldRect', () => {
  it('при zoom=1 и нулевом смещении совпадает с канвасом', () => {
    expect(
      visibleWorldRect({ x: 0, y: 0, zoom: 1 }, { width: 800, height: 600 }),
    ).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('при zoom=2 показывает вдвое меньше мира', () => {
    expect(
      visibleWorldRect({ x: 0, y: 0, zoom: 2 }, { width: 800, height: 600 }),
    ).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  it('учитывает смещение вида', () => {
    expect(
      visibleWorldRect(
        { x: -200, y: 100, zoom: 0.5 },
        { width: 1000, height: 600 },
      ),
    ).toEqual({ x: 400, y: -200, width: 2000, height: 1200 });
  });

  it.each(viewports)(
    'углы прямоугольника проецируются в углы канваса при zoom $zoom',
    (viewport) => {
      const canvas: Size = { width: 1280, height: 720 };
      const rect = visibleWorldRect(viewport, canvas);

      expect(rect.width).toBeCloseTo(canvas.width / viewport.zoom, PRECISION);
      expect(rect.height).toBeCloseTo(canvas.height / viewport.zoom, PRECISION);

      expectPointClose(toScreen({ x: rect.x, y: rect.y }, viewport), {
        x: 0,
        y: 0,
      });
      expectPointClose(
        toScreen(
          { x: rect.x + rect.width, y: rect.y + rect.height },
          viewport,
        ),
        { x: canvas.width, y: canvas.height },
      );
    },
  );

  it('панорамирование двигает видимый мир в обратную сторону', () => {
    const viewport: Viewport = { x: 0, y: 0, zoom: 2 };
    const canvas: Size = { width: 800, height: 600 };
    const before = visibleWorldRect(viewport, canvas);
    const after = visibleWorldRect(panBy(viewport, 100, 50), canvas);

    expect(after.x).toBeCloseTo(before.x - 100 / viewport.zoom, PRECISION);
    expect(after.y).toBeCloseTo(before.y - 50 / viewport.zoom, PRECISION);
    expect(after.width).toBeCloseTo(before.width, PRECISION);
  });

  it('зум к курсору не выпускает курсор из видимой области', () => {
    const canvas: Size = { width: 900, height: 700 };
    const viewport: Viewport = { x: 40, y: -60, zoom: 1.2 };
    const cursor: ScreenPoint = { x: 300, y: 500 };
    const world = toWorld(cursor, viewport);

    const next = zoomAt(viewport, cursor, 1.5);
    const rect = visibleWorldRect(next, canvas);

    expect(world.x).toBeGreaterThanOrEqual(rect.x - EPS);
    expect(world.x).toBeLessThanOrEqual(rect.x + rect.width + EPS);
    expect(world.y).toBeGreaterThanOrEqual(rect.y - EPS);
    expect(world.y).toBeLessThanOrEqual(rect.y + rect.height + EPS);
  });
});
