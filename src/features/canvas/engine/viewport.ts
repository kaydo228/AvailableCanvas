/**
 * Зона 1 — математика вида.
 *
 * Чистые функции: без React, без Konva, без стора, без побочных эффектов.
 * Ни одна функция не мутирует аргументы — всегда возвращается новый объект.
 *
 * Формула одна на весь движок (см. contract.ts), менять нельзя:
 *     screen = world * zoom + {x, y}
 *     world  = (screen - {x, y}) / zoom
 */

import { ZOOM_MAX, ZOOM_MIN } from '@/shared/types/document';

import type {
  ClampZoom,
  FitToBox,
  PanBy,
  Rect,
  ToScreen,
  ToWorld,
  VisibleWorldRect,
  ZoomAt,
} from './contract';

/** Отступ по краям канваса при вписывании, в экранных пикселях. */
const DEFAULT_FIT_PADDING = 40;

/**
 * Приводит прямоугольник к виду с неотрицательными размерами.
 * Прямоугольник с отрицательной шириной/высотой приходит, например,
 * из рамки выделения, протянутой справа налево.
 */
const normalizeRect = (rect: Rect): Rect => ({
  x: rect.width < 0 ? rect.x + rect.width : rect.x,
  y: rect.height < 0 ? rect.y + rect.height : rect.y,
  width: Math.abs(rect.width),
  height: Math.abs(rect.height),
});

export const toWorld: ToWorld = (point, viewport) => ({
  x: (point.x - viewport.x) / viewport.zoom,
  y: (point.y - viewport.y) / viewport.zoom,
});

export const toScreen: ToScreen = (point, viewport) => ({
  x: point.x * viewport.zoom + viewport.x,
  y: point.y * viewport.zoom + viewport.y,
});

/**
 * Зажимает зум в [ZOOM_MIN, ZOOM_MAX] (инвариант 5).
 * NaN считаем «нет значения» и уводим в нижнюю границу, чтобы наружу
 * никогда не утекало не-число.
 */
export const clampZoom: ClampZoom = (zoom) => {
  if (Number.isNaN(zoom)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
};

/**
 * Зум к точке экрана.
 *
 * Мировая точка под курсором обязана остаться ровно под курсором:
 *     world = (screen - v) / z  =  (screen - v') / z'
 *     v' = screen - world * z'
 *
 * Смещение считается от ФАКТИЧЕСКИ применённого зума `z'` (после clampZoom),
 * а не от запрошенного — иначе на границах диапазона вид уползал бы,
 * хотя масштаб уже не меняется.
 */
export const zoomAt: ZoomAt = (viewport, screenPoint, factor) => {
  // Бессмысленный множитель не должен ломать вид.
  if (!Number.isFinite(factor) || factor <= 0) return { ...viewport };

  const zoom = clampZoom(viewport.zoom * factor);

  // Зум упёрся в границу: применять нечего, вид остаётся байт в байт прежним.
  if (zoom === viewport.zoom) return { ...viewport };

  const world = toWorld(screenPoint, viewport);

  return {
    x: screenPoint.x - world.x * zoom,
    y: screenPoint.y - world.y * zoom,
    zoom,
  };
};

/** Сдвиг вида на дельту в ЭКРАННЫХ пикселях: мир едет на dx/zoom. */
export const panBy: PanBy = (viewport, dx, dy) => ({
  x: viewport.x + dx,
  y: viewport.y + dy,
  zoom: viewport.zoom,
});

/**
 * Вписывает прямоугольник мира в канвас с отступом `padding` по каждой стороне.
 * Зум зажимается clampZoom — если бокс слишком велик даже для ZOOM_MIN,
 * он останется шире видимой области; это предел диапазона, а не ошибка.
 * Вырожденная сторона (нулевая) не ограничивает масштаб.
 */
export const fitToBox: FitToBox = (
  box,
  canvas,
  padding = DEFAULT_FIT_PADDING,
) => {
  const target = normalizeRect(box);

  const availableWidth = Math.max(0, canvas.width - padding * 2);
  const availableHeight = Math.max(0, canvas.height - padding * 2);

  const scaleX =
    target.width > 0 ? availableWidth / target.width : Number.POSITIVE_INFINITY;
  const scaleY =
    target.height > 0
      ? availableHeight / target.height
      : Number.POSITIVE_INFINITY;

  const zoom = clampZoom(Math.min(scaleX, scaleY));

  // Центр бокса совмещаем с центром канваса: screen = world * zoom + v.
  const centerX = target.x + target.width / 2;
  const centerY = target.y + target.height / 2;

  return {
    x: canvas.width / 2 - centerX * zoom,
    y: canvas.height / 2 - centerY * zoom,
    zoom,
  };
};

/** Прямоугольник мира, видимый сейчас: углы канваса, переведённые в мир. */
export const visibleWorldRect: VisibleWorldRect = (viewport, canvas) => {
  const topLeft = toWorld({ x: 0, y: 0 }, viewport);
  const bottomRight = toWorld({ x: canvas.width, y: canvas.height }, viewport);

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
};
