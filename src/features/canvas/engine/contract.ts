/**
 * Шов между тремя зонами движка. Пишется до работы, меняется только мной.
 *
 * Зона 1 — viewport.ts   : математика вида, чистые функции, без React.
 * Зона 2 — useCanvasGestures.ts : жесты, хук на пропсах и колбэках, без стора.
 * Зона 3 — Grid.tsx + grid.ts   : фоновая сетка, компонент на пропсах, без стора.
 *
 * Ни одна зона не импортирует другую, кроме zone 2 и 3 → viewport.ts (только чтение).
 * Стор прикручивается на сборке, в зонах его нет.
 */

import type { Viewport } from '@/shared/types/document';

/** Точка в экранных пикселях, начало — левый верхний угол канваса. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** Точка в мировых координатах доски. */
export interface WorldPoint {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Зона 1: viewport.ts ──────────────────────────────────────────────────
//
// Формула одна на весь движок, менять нельзя:
//     screen = world * zoom + {x, y}
//     world  = (screen - {x, y}) / zoom

export type ToWorld = (point: ScreenPoint, viewport: Viewport) => WorldPoint;
export type ToScreen = (point: WorldPoint, viewport: Viewport) => ScreenPoint;

/** Зажимает зум в [ZOOM_MIN, ZOOM_MAX] из shared/types/document. */
export type ClampZoom = (zoom: number) => number;

/**
 * Зум к точке экрана: мировая точка под курсором обязана остаться
 * под курсором после изменения зума. Это главное требование зоны.
 * `factor` — множитель (1.1 приблизить, 0.9 отдалить).
 */
export type ZoomAt = (
  viewport: Viewport,
  screenPoint: ScreenPoint,
  factor: number,
) => Viewport;

/** Сдвиг вида на дельту в экранных пикселях. */
export type PanBy = (viewport: Viewport, dx: number, dy: number) => Viewport;

/** Вид, при котором прямоугольник мира вписан в канвас с отступом. */
export type FitToBox = (
  box: Rect,
  canvas: Size,
  padding?: number,
) => Viewport;

/** Прямоугольник мира, видимый сейчас. Нужен сетке и отсечению. */
export type VisibleWorldRect = (viewport: Viewport, canvas: Size) => Rect;

// ─── Зона 2: useCanvasGestures.ts ─────────────────────────────────────────

export interface CanvasGesturesOptions {
  /** Текущий вид. Хук его не хранит, только читает. */
  viewport: Viewport;
  /** Размер канваса в экранных пикселях. */
  size: Size;
  /** Единственный выход наружу: новый вид. */
  onViewportChange: (viewport: Viewport) => void;
  /** Активен ли инструмент «рука» — тогда панорамирование без пробела. */
  handTool?: boolean;
  /** Выключить жесты на время редактирования текста. */
  disabled?: boolean;
}

export interface CanvasGesturesResult {
  /** Навесить на контейнер канваса. */
  bind: () => Record<string, unknown>;
  /** Зажат ли пробел или средняя кнопка — для курсора `grabbing`. */
  isPanning: boolean;
  /** Курсор, который контейнер должен показывать прямо сейчас. */
  cursor: 'default' | 'grab' | 'grabbing';
}

// ─── Зона 3: Grid.tsx ─────────────────────────────────────────────────────

export interface GridProps {
  viewport: Viewport;
  size: Size;
  /** Шаг сетки в мировых единицах. По умолчанию 24. */
  step?: number;
  color?: string;
}

/**
 * Плотность сетки: сколько мировых единиц между точками при текущем зуме,
 * и рисовать ли её вообще. На мелком зуме сетка скрывается — рисовать
 * миллион точек нельзя.
 */
export interface GridDensity {
  /** Шаг в мировых единицах после подстройки под зум. */
  worldStep: number;
  /** false — сетку не рисуем вовсе. */
  visible: boolean;
}

export type ComputeGridDensity = (zoom: number, baseStep: number) => GridDensity;
