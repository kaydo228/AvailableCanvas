/**
 * Середина маршрута — куда садится подпись.
 *
 * Именно середина ФАКТИЧЕСКОГО маршрута, а не отрезка между концами:
 * у ломаной из пяти сегментов середина отрезка легко оказывается вне линии.
 */

import type { WorldPoint } from '@/features/canvas/engine/contract';

/** Отсчётов при дискретизации кривой. Выше не нужно: подпись не миллиметровка. */
const CURVE_SAMPLES = 24;

function pointsToPairs(points: number[]): WorldPoint[] {
  const pairs: WorldPoint[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    pairs.push({ x: points[i] as number, y: points[i + 1] as number });
  }
  return pairs;
}

/** Точка на кубической Безье при параметре t. */
function bezierAt(p: WorldPoint[], t: number): WorldPoint {
  const [p0, p1, p2, p3] = p;
  if (!p0 || !p1 || !p2 || !p3) return { x: 0, y: 0 };

  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;

  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Середина по длине дуги.
 *
 * Сегменты нулевой длины пропускаются — это и есть защита от деления
 * на ноль при интерполяции внутри сегмента.
 */
function midpointOfPolyline(pairs: WorldPoint[]): WorldPoint {
  if (pairs.length === 0) return { x: 0, y: 0 };
  if (pairs.length === 1) return pairs[0] as WorldPoint;

  const lengths: number[] = [];
  let total = 0;

  for (let i = 1; i < pairs.length; i += 1) {
    const a = pairs[i - 1] as WorldPoint;
    const b = pairs[i] as WorldPoint;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(length);
    total += length;
  }

  if (total === 0) return pairs[0] as WorldPoint;

  let walked = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    const length = lengths[i] as number;
    if (length === 0) continue;

    if (walked + length >= total / 2) {
      const a = pairs[i] as WorldPoint;
      const b = pairs[i + 1] as WorldPoint;
      const t = (total / 2 - walked) / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    walked += length;
  }

  return pairs[pairs.length - 1] as WorldPoint;
}

/**
 * Середина маршрута. Кривая сначала дискретизируется: середины по длине
 * дуги у кубической Безье в замкнутом виде не существует.
 */
export function routeMidpoint(points: number[], bezier: boolean): WorldPoint {
  const pairs = pointsToPairs(points);

  if (!bezier || pairs.length < 4) return midpointOfPolyline(pairs);

  const sampled: WorldPoint[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
    sampled.push(bezierAt(pairs, i / CURVE_SAMPLES));
  }
  return midpointOfPolyline(sampled);
}

/**
 * Направление последнего сегмента — куда смотрит наконечник на конце.
 * Берётся из САМОГО маршрута, а не из хорды между концами: у ломаной
 * и кривой линия входит в фигуру перпендикулярно стороне, и стрелка,
 * повёрнутая по хорде, смотрела бы вбок.
 */
export function endTangent(points: number[]): WorldPoint {
  const pairs = pointsToPairs(points);
  for (let i = pairs.length - 1; i > 0; i -= 1) {
    const a = pairs[i - 1] as WorldPoint;
    const b = pairs[i] as WorldPoint;
    if (a.x !== b.x || a.y !== b.y) return a;
  }
  return pairs[0] ?? { x: 0, y: 0 };
}

/** То же для начала линии. */
export function startTangent(points: number[]): WorldPoint {
  const pairs = pointsToPairs(points);
  for (let i = 0; i + 1 < pairs.length; i += 1) {
    const a = pairs[i] as WorldPoint;
    const b = pairs[i + 1] as WorldPoint;
    if (a.x !== b.x || a.y !== b.y) return b;
  }
  return pairs[0] ?? { x: 0, y: 0 };
}
