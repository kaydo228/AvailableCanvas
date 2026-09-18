/** Свободная стрелка: траектория хранится локально, наконечник рисует вид. */

import type { WorldPoint } from '@/features/canvas/engine/contract';
import type { DrawNode } from '@/shared/types/document';

export const DEFAULT_DRAW_STROKE = '#f8fafc';
export const DEFAULT_DRAW_WIDTH = 2;

/** Меньше четырёх экранных пикселей — промах, а не стрелка. */
export const MIN_DRAW_LENGTH = 4;

const pathLength = (points: WorldPoint[]): number =>
  points.slice(1).reduce((total, point, index) => {
    const previous = points[index] as WorldPoint;
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);

export const isDrawTooShort = (points: WorldPoint[], zoom: number): boolean =>
  pathLength(points) * zoom < MIN_DRAW_LENGTH;

export const drawFromPoints = (points: WorldPoint[]): DrawNode | null => {
  if (points.length < 2) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return {
    id: crypto.randomUUID(),
    type: 'draw',
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
    rotation: 0,
    opacity: 1,
    locked: false,
    stroke: DEFAULT_DRAW_STROKE,
    strokeWidth: DEFAULT_DRAW_WIDTH,
    points: points.flatMap((point) => [point.x - x, point.y - y]),
  };
};

/** Контур наконечника по последнему ненулевому отрезку свободной стрелки. */
export const arrowHeadPoints = (points: number[], strokeWidth: number): number[] => {
  if (points.length < 4) return [];
  const endX = points[points.length - 2] as number;
  const endY = points[points.length - 1] as number;

  for (let index = points.length - 4; index >= 0; index -= 2) {
    const fromX = points[index] as number;
    const fromY = points[index + 1] as number;
    if (fromX === endX && fromY === endY) continue;

    const angle = Math.atan2(endY - fromY, endX - fromX);
    const spread = Math.PI / 7;
    const length = strokeWidth * 4;
    const wing = (sign: number): number[] => [
      endX - length * Math.cos(angle + sign * spread),
      endY - length * Math.sin(angle + sign * spread),
    ];
    return [...wing(1), endX, endY, ...wing(-1)];
  }

  return [];
};
