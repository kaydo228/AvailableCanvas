/**
 * Создание стикеров. Чистые функции, без React.
 */

import type { Rect, Size, WorldPoint } from '@/features/canvas/engine/contract';
import {
  DEFAULT_STICKY_COLOR,
  type StickyColor,
} from '@/features/canvas/nodes/stickyPalette';
import type { StickyNode } from '@/shared/types/document';

import { isClick, normalizeRect, rectAround } from './geometry';

/** Стикер всегда квадратный — см. stickyFromDrag. */
export const DEFAULT_STICKY_SIZE: Size = { width: 180, height: 180 };

/** Меньше этого стикер перестаёт быть читаемым. */
export const MIN_STICKY_SIDE = 48;

export const DEFAULT_STICKY_FONT_SIZE = 18;

export type StickyOverrides = Partial<Omit<StickyNode, 'id' | 'type'>>;

export function createStickyNode(
  rect: Rect,
  color: StickyColor = DEFAULT_STICKY_COLOR,
  overrides: StickyOverrides = {},
): StickyNode {
  const side = Math.max(MIN_STICKY_SIDE, rect.width, rect.height);

  const base: StickyNode = {
    id: crypto.randomUUID(),
    type: 'sticky',
    x: rect.x,
    y: rect.y,
    width: side,
    height: side,
    rotation: 0,
    opacity: 1,
    locked: false,
    fill: color.fill,
    text: {
      value: '',
      fontSize: DEFAULT_STICKY_FONT_SIZE,
      color: color.text,
      align: 'center',
    },
  };

  return Object.assign(base, overrides);
}

/**
 * Стикер по жесту.
 *
 * Клик — квадрат размера по умолчанию с центром в точке.
 * Протяжка — тоже квадрат: берётся большая сторона рамки. Прямоугольный
 * стикер выглядит как ошибка, поэтому Shift здесь ничего не меняет —
 * форма и так квадратная, и параметр принимается только ради единообразия
 * сигнатуры с остальными инструментами.
 */
export function stickyFromDrag(
  start: WorldPoint,
  current: WorldPoint,
  _shiftKey: boolean,
  zoom: number,
  color: StickyColor = DEFAULT_STICKY_COLOR,
): StickyNode {
  if (isClick(start, current, zoom)) {
    const rect = rectAround(
      start,
      DEFAULT_STICKY_SIZE.width,
      DEFAULT_STICKY_SIZE.height,
    );
    return createStickyNode(rect, color);
  }

  const rect = normalizeRect(start, current);
  const side = Math.max(MIN_STICKY_SIDE, rect.width, rect.height);

  return createStickyNode({ x: rect.x, y: rect.y, width: side, height: side }, color);
}
