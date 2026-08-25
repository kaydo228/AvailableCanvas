import { describe, expect, it } from 'vitest';

import type { Size } from '@/features/canvas/engine/contract';
import {
  computeGridDensity,
  computeGridLayout,
  DEFAULT_GRID_STEP,
  MAX_GRID_POINTS,
  MAX_SCREEN_GAP,
  MAX_STEP_SCALE,
  MIN_SCREEN_GAP,
  minVisibleZoom,
} from '@/features/canvas/engine/grid';
import { visibleWorldRect } from '@/features/canvas/engine/viewport';
import type { Viewport } from '@/shared/types/document';
import { ZOOM_MAX, ZOOM_MIN } from '@/shared/types/document';

/** Погрешность double на этих величинах ~1e-12, берём с запасом. */
const EPS = 1e-9;

/** Зум, ниже которого сетки нет: 12 / (24 * 4) = 0.125. */
const HIDE_BELOW = minVisibleZoom(DEFAULT_GRID_STEP);

/**
 * Зумы по всему разрешённому диапазону: границы, круглые значения,
 * окрестности переключения плотности и просто «некрасивые» числа между ними.
 */
const zooms: number[] = [
  ...[
    ZOOM_MIN,
    0.101,
    0.124,
    HIDE_BELOW,
    0.126,
    0.2,
    0.25,
    0.3,
    1 / 3,
    0.499,
    0.5,
    0.501,
    0.75,
    1,
    1.5,
    1.999,
    2,
    2.001,
    2.5,
    3,
    3.7,
    ZOOM_MAX,
  ],
  // Равномерный проход.
  ...Array.from({ length: 60 }, (_, i) => ZOOM_MIN + ((ZOOM_MAX - ZOOM_MIN) * i) / 59),
  // Логарифмический проход — на мелком конце шаг мельче.
  ...Array.from({ length: 40 }, (_, i) => ZOOM_MIN * (ZOOM_MAX / ZOOM_MIN) ** (i / 39)),
];

/** Зумы, при которых сетка обязана быть видимой. */
const visibleZooms = zooms.filter((zoom) => zoom >= HIDE_BELOW);

const canvases: Size[] = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
  { width: 8000, height: 6000 },
  { width: 320, height: 2000 },
];

/** Смещения вида, в том числе заведомо нецелые. */
const origins: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 137, y: -240 },
  { x: -333.37, y: 777.13 },
  { x: 0.5, y: -0.5 },
  { x: -99999.75, y: 12345.625 },
];

const screenGap = (worldStep: number, zoom: number): number => worldStep * zoom;

/** Кратно ли значение шагу с точностью до погрешности double. */
const isMultipleOf = (value: number, step: number): boolean =>
  Math.abs(value / step - Math.round(value / step)) < EPS;

/** Отношение — степень двойки, т.е. логарифм по основанию 2 целый. */
const isPowerOfTwoRatio = (value: number, base: number): boolean => {
  const power = Math.log2(value / base);
  return Math.abs(power - Math.round(power)) < EPS;
};

describe('computeGridDensity', () => {
  it('при zoom = 1 отдаёт ровно базовый шаг', () => {
    for (const base of [DEFAULT_GRID_STEP, 12, 16, 32, 48]) {
      const density = computeGridDensity(1, base);
      expect(density.visible).toBe(true);
      expect(density.worldStep).toBe(base);
    }
  });

  it('на мелком зуме сетку прячет, а не рисует миллион точек', () => {
    for (const zoom of [ZOOM_MIN, 0.11, 0.124, 0.05, 0.01, 0.001]) {
      expect(computeGridDensity(zoom, DEFAULT_GRID_STEP).visible).toBe(false);
    }
  });

  it('порог видимости ровно на границе, а не размазан', () => {
    expect(computeGridDensity(HIDE_BELOW, DEFAULT_GRID_STEP).visible).toBe(true);
    expect(computeGridDensity(HIDE_BELOW * 0.999, DEFAULT_GRID_STEP).visible).toBe(false);
    // ZOOM_MIN лежит ниже порога — на самом дальнем конце сетки нет.
    expect(ZOOM_MIN).toBeLessThan(HIDE_BELOW);
  });

  it('держит экранное расстояние между точками в коридоре 12–48 px', () => {
    for (const zoom of visibleZooms) {
      const density = computeGridDensity(zoom, DEFAULT_GRID_STEP);
      expect(density.visible).toBe(true);

      const gap = screenGap(density.worldStep, zoom);
      expect(gap).toBeGreaterThanOrEqual(MIN_SCREEN_GAP - EPS);
      expect(gap).toBeLessThanOrEqual(MAX_SCREEN_GAP + EPS);
    }
  });

  it('коридор держится и для нестандартного базового шага', () => {
    for (const base of [8, 10, 16, 24, 40, 64]) {
      for (const zoom of zooms) {
        const density = computeGridDensity(zoom, base);
        if (!density.visible) continue;

        const gap = screenGap(density.worldStep, zoom);
        expect(gap).toBeGreaterThanOrEqual(MIN_SCREEN_GAP - EPS);
        expect(gap).toBeLessThanOrEqual(MAX_SCREEN_GAP + EPS);
      }
    }
  });

  it('меняет шаг кратно двойке — точки прореживаются, а не переезжают', () => {
    for (const zoom of visibleZooms) {
      const { worldStep } = computeGridDensity(zoom, DEFAULT_GRID_STEP);
      expect(isPowerOfTwoRatio(worldStep, DEFAULT_GRID_STEP)).toBe(true);
      expect(worldStep).toBeLessThanOrEqual(DEFAULT_GRID_STEP * MAX_STEP_SCALE + EPS);
    }
  });

  it('идёт по лестнице 24 → 48 → 96 вниз и 24 → 12 вверх', () => {
    expect(computeGridDensity(0.5, 24).worldStep).toBe(24); // зазор ровно 12
    expect(computeGridDensity(0.4, 24).worldStep).toBe(48);
    expect(computeGridDensity(0.2, 24).worldStep).toBe(96);
    expect(computeGridDensity(0.13, 24).worldStep).toBe(96);
    expect(computeGridDensity(2, 24).worldStep).toBe(24); // зазор ровно 48
    expect(computeGridDensity(2.5, 24).worldStep).toBe(12);
    expect(computeGridDensity(ZOOM_MAX, 24).worldStep).toBe(12);
  });

  it('с ростом зума шаг только уменьшается', () => {
    const ascending = [...visibleZooms].sort((a, b) => a - b);
    let previous = Number.POSITIVE_INFINITY;

    for (const zoom of ascending) {
      const { worldStep } = computeGridDensity(zoom, DEFAULT_GRID_STEP);
      expect(worldStep).toBeLessThanOrEqual(previous + EPS);
      previous = worldStep;
    }
  });

  it('мусор на входе — это «не рисуем», а не исключение', () => {
    for (const zoom of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(computeGridDensity(zoom, DEFAULT_GRID_STEP).visible).toBe(false);
    }
    // Переполнение `step * zoom` не должно родить нулевой шаг.
    const overflow = computeGridDensity(1e300, 1e300);
    expect(overflow.visible).toBe(false);
    expect(overflow.worldStep).toBeGreaterThan(0);
    for (const base of [0, -24, Number.NaN]) {
      const density = computeGridDensity(1, base);
      expect(density.worldStep).toBe(DEFAULT_GRID_STEP);
    }
  });
});

describe('computeGridLayout', () => {
  it('никогда не превышает предохранитель по числу точек', () => {
    for (const canvas of canvases) {
      for (const zoom of zooms) {
        for (const origin of origins) {
          const viewport: Viewport = { ...origin, zoom };
          const layout = computeGridLayout(viewport, canvas);

          expect(layout.count).toBeLessThanOrEqual(MAX_GRID_POINTS);
          expect(layout.count).toBe(layout.columns.length * layout.rows.length);
        }
      }
    }
  });

  it('на экранных размерах предохранитель молчит — коридор в силе', () => {
    const canvas: Size = { width: 1920, height: 1080 };

    for (const zoom of visibleZooms) {
      const viewport: Viewport = { x: -333.37, y: 777.13, zoom };
      const layout = computeGridLayout(viewport, canvas);
      const density = computeGridDensity(zoom, DEFAULT_GRID_STEP);

      expect(layout.visible).toBe(true);
      expect(layout.worldStep).toBe(density.worldStep);

      const gap = screenGap(layout.worldStep, zoom);
      expect(gap).toBeGreaterThanOrEqual(MIN_SCREEN_GAP - EPS);
      expect(gap).toBeLessThanOrEqual(MAX_SCREEN_GAP + EPS);
    }
  });

  it('на огромном канвасе огрубляет шаг вместо срыва кадра', () => {
    const canvas: Size = { width: 8000, height: 6000 };
    const viewport: Viewport = { x: 0, y: 0, zoom: 0.5 };

    const layout = computeGridLayout(viewport, canvas);
    const density = computeGridDensity(viewport.zoom, DEFAULT_GRID_STEP);

    expect(layout.visible).toBe(true);
    expect(layout.worldStep).toBeGreaterThan(density.worldStep);
    expect(isPowerOfTwoRatio(layout.worldStep, density.worldStep)).toBe(true);
    expect(layout.count).toBeLessThanOrEqual(MAX_GRID_POINTS);
  });

  it('точки выровнены по мировой сетке при любом смещении вида', () => {
    for (const canvas of canvases) {
      for (const zoom of visibleZooms) {
        for (const origin of origins) {
          const layout = computeGridLayout({ ...origin, zoom }, canvas);
          if (!layout.visible) continue;

          // Собираем нарушителей и сверяем одним ожиданием: на десятках тысяч
          // точек вызов expect на каждую стоит дороже самой проверки.
          const offGrid = [...layout.columns, ...layout.rows].filter(
            (value) => !isMultipleOf(value, layout.worldStep),
          );
          expect(offGrid).toEqual([]);
        }
      }
    }
  });

  it('сдвиг вида на нецелое число не сбивает сетку с мировой решётки', () => {
    const canvas: Size = { width: 1440, height: 900 };
    const base: Viewport = { x: 0, y: 0, zoom: 1 };
    const shifted: Viewport = { x: -17.37, y: 42.125, zoom: 1 };

    const first = computeGridLayout(base, canvas);
    const second = computeGridLayout(shifted, canvas);

    expect(second.worldStep).toBe(first.worldStep);

    // Позиции остались кратны шагу, а не «поехали» вслед за краем экрана:
    // сдвиг между соседними раскладками — целое число шагов.
    const firstColumn = first.columns[0];
    const secondColumn = second.columns[0];
    expect(firstColumn).toBeDefined();
    expect(secondColumn).toBeDefined();
    expect(isMultipleOf(secondColumn! - firstColumn!, first.worldStep)).toBe(true);
  });

  it('накрывает всю видимую область, без прорех по краям', () => {
    for (const canvas of canvases) {
      for (const zoom of visibleZooms) {
        for (const origin of origins) {
          const viewport: Viewport = { ...origin, zoom };
          const layout = computeGridLayout(viewport, canvas);
          if (!layout.visible) continue;

          const rect = visibleWorldRect(viewport, canvas);
          const firstColumn = layout.columns[0];
          const lastColumn = layout.columns[layout.columns.length - 1];
          const firstRow = layout.rows[0];
          const lastRow = layout.rows[layout.rows.length - 1];

          expect(firstColumn!).toBeLessThanOrEqual(rect.x + EPS);
          expect(lastColumn!).toBeGreaterThanOrEqual(rect.x + rect.width - EPS);
          expect(firstRow!).toBeLessThanOrEqual(rect.y + EPS);
          expect(lastRow!).toBeGreaterThanOrEqual(rect.y + rect.height - EPS);
        }
      }
    }
  });

  it('на мелком зуме раскладка пустая — рисовать нечего', () => {
    for (const zoom of [ZOOM_MIN, 0.11, 0.02]) {
      const layout = computeGridLayout({ x: 0, y: 0, zoom }, { width: 1920, height: 1080 });

      expect(layout.visible).toBe(false);
      expect(layout.count).toBe(0);
      expect(layout.columns).toHaveLength(0);
      expect(layout.rows).toHaveLength(0);
    }
  });

  it('вырожденный или испорченный вход не рисует ничего', () => {
    const viewport: Viewport = { x: 0, y: 0, zoom: 1 };

    for (const canvas of [
      { width: 0, height: 1080 },
      { width: 1920, height: 0 },
      { width: -100, height: -100 },
      { width: Number.NaN, height: 1080 },
      { width: Number.POSITIVE_INFINITY, height: 1080 },
    ]) {
      expect(computeGridLayout(viewport, canvas).visible).toBe(false);
    }

    const canvas: Size = { width: 1920, height: 1080 };
    expect(computeGridLayout({ x: Number.NaN, y: 0, zoom: 1 }, canvas).visible).toBe(false);
    expect(computeGridLayout({ x: 0, y: 0, zoom: Number.NaN }, canvas).visible).toBe(false);
  });

  it('уважает переданный базовый шаг', () => {
    const canvas: Size = { width: 1920, height: 1080 };
    const viewport: Viewport = { x: 0, y: 0, zoom: 1 };

    expect(computeGridLayout(viewport, canvas, 16).worldStep).toBe(16);
    expect(computeGridLayout(viewport, canvas, 40).worldStep).toBe(40);
  });
});
