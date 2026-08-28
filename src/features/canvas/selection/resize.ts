/**
 * Правило изменения размера.
 *
 * У картинки ресайз по умолчанию ПРОПОРЦИОНАЛЬНЫЙ, а Shift освобождает
 * пропорции. В Figma наоборот; здесь так решено сознательно — картинку
 * почти всегда тянут, чтобы она осталась картинкой, а не превратилась
 * в растянутую кашу, и держать ради этого Shift неудобно.
 *
 * У остальных типов узлов правило обычное: свободно, Shift сохраняет.
 */

import type { Rect } from '@/features/canvas/engine/contract';
import { MIN_NODE_SIDE, type Node } from '@/shared/types/document';

export { MIN_NODE_SIDE } from '@/shared/types/document';

export function keepsAspect(node: Node, shiftKey: boolean): boolean {
  // Картинка: пропорции по умолчанию, Shift отпускает.
  if (node.type === 'image') return !shiftKey;
  // Стикер всегда квадратный, прямоугольный выглядит как ошибка.
  if (node.type === 'sticky') return true;
  // Остальное: свободно, Shift прижимает к пропорциям.
  return shiftKey;
}

/**
 * Подгоняет рамку под заданные пропорции, не выходя за предложенный размер.
 * Берётся меньший из двух масштабов, поэтому фигура остаётся внутри того,
 * что пользователь натянул мышью.
 */
export function applyAspect(box: Rect, aspect: number): Rect {
  if (aspect <= 0 || box.width <= 0 || box.height <= 0) return box;

  const byWidth = box.width / aspect;
  const height = Math.min(box.height, byWidth);
  const width = height * aspect;

  return { x: box.x, y: box.y, width, height };
}

export function clampSize(box: Rect): Rect {
  return {
    x: box.x,
    y: box.y,
    width: Math.max(MIN_NODE_SIDE, box.width),
    height: Math.max(MIN_NODE_SIDE, box.height),
  };
}
