/**
 * Общая геометрия инструментов создания. Одна на все типы узлов —
 * иначе каждый инструмент нормализует прямоугольник по-своему.
 */

import type { Rect, WorldPoint } from '@/features/canvas/engine/contract';

/**
 * Прямоугольник по двум точкам протяжки, всегда с положительными размерами.
 *
 * Протяжка справа налево и снизу вверх даёт отрицательные ширину и высоту.
 * Узел с отрицательным размером не отрисовывается и не ловится hit-тестом,
 * а выглядит это как «инструмент не работает».
 */
export function normalizeRect(a: WorldPoint, b: WorldPoint): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/**
 * Прямоугольник с зажатым Shift: сторона берётся по большей из двух,
 * знак сохраняется, чтобы фигура тянулась в ту же сторону, куда ведут мышь.
 */
export function squareRect(a: WorldPoint, b: WorldPoint): Rect {
  const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const signX = b.x >= a.x ? 1 : -1;
  const signY = b.y >= a.y ? 1 : -1;
  return normalizeRect(a, { x: a.x + side * signX, y: a.y + side * signY });
}

/** Рамка по умолчанию для одиночного клика: узел центрируется по точке. */
export function rectAround(point: WorldPoint, width: number, height: number): Rect {
  return {
    x: point.x - width / 2,
    y: point.y - height / 2,
    width,
    height,
  };
}

/** Меньше этого протяжка считается кликом, а не растягиванием. */
export const DRAG_THRESHOLD = 4;

export function isClick(a: WorldPoint, b: WorldPoint, zoom: number): boolean {
  const dx = (b.x - a.x) * zoom;
  const dy = (b.y - a.y) * zoom;
  return Math.hypot(dx, dy) < DRAG_THRESHOLD;
}
