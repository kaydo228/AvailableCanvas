import { describe, expect, it } from 'vitest';

import {
  endTangent,
  routeMidpoint,
  startTangent,
} from '@/features/canvas/connectors/labelPosition';

describe('routeMidpoint — полилиния', () => {
  it('на прямом отрезке — его середина', () => {
    expect(routeMidpoint([0, 0, 100, 0], false)).toEqual({ x: 50, y: 0 });
  });

  it('на ломаной из РАВНЫХ сегментов — на изломе', () => {
    // Два сегмента по 100: середина ровно в точке перегиба.
    const at = routeMidpoint([0, 0, 100, 0, 100, 100], false);
    expect(at.x).toBeCloseTo(100, 6);
    expect(at.y).toBeCloseTo(0, 6);
  });

  it('на ломаной из НЕРАВНЫХ сегментов — внутри длинного', () => {
    // Сегменты 20 и 180, всего 200, середина на 100 — внутри второго.
    const at = routeMidpoint([0, 0, 20, 0, 200, 0], false);
    expect(at.x).toBeCloseTo(100, 6);
  });

  it('середина маршрута НЕ равна середине отрезка между концами', () => {
    // П-образный маршрут: концы рядом, а сама линия уходит далеко.
    const points = [0, 0, 0, 200, 100, 200, 100, 0];
    const chord = { x: 50, y: 0 };
    const at = routeMidpoint(points, false);
    expect(at).not.toEqual(chord);
    expect(at.y).toBeCloseTo(200, 6);
  });

  it('сегменты нулевой длины не роняют расчёт', () => {
    const at = routeMidpoint([0, 0, 0, 0, 0, 0, 100, 0], false);
    expect(Number.isFinite(at.x)).toBe(true);
    expect(at.x).toBeCloseTo(50, 6);
  });

  it('маршрут нулевой длины возвращает свою точку', () => {
    expect(routeMidpoint([7, 9, 7, 9], false)).toEqual({ x: 7, y: 9 });
  });

  it('пустой маршрут не роняет расчёт', () => {
    expect(routeMidpoint([], false)).toEqual({ x: 0, y: 0 });
  });
});

describe('routeMidpoint — кривая', () => {
  it('на симметричной кривой середина по центру', () => {
    // Контрольные точки симметричны — середина по длине дуги на оси симметрии.
    const at = routeMidpoint([0, 0, 50, 100, 150, 100, 200, 0], true);
    expect(at.x).toBeCloseTo(100, 0);
    expect(at.y).toBeGreaterThan(0);
  });

  it('середина кривой лежит не на хорде', () => {
    const at = routeMidpoint([0, 0, 0, 200, 200, 200, 200, 0], true);
    expect(at.y).toBeGreaterThan(10);
  });

  it('вырожденная кривая не роняет расчёт', () => {
    const at = routeMidpoint([5, 5, 5, 5, 5, 5, 5, 5], true);
    expect(at).toEqual({ x: 5, y: 5 });
  });
});

describe('касательные — куда смотрят наконечники', () => {
  it('на прямой берутся сами концы', () => {
    expect(endTangent([0, 0, 100, 0])).toEqual({ x: 0, y: 0 });
    expect(startTangent([0, 0, 100, 0])).toEqual({ x: 100, y: 0 });
  });

  it('на ломаной берётся направление ПОСЛЕДНЕГО сегмента, а не хорды', () => {
    // Маршрут заканчивается вертикальным сегментом снизу вверх.
    const points = [0, 0, 200, 0, 200, 100];
    const before = endTangent(points);
    expect(before).toEqual({ x: 200, y: 0 });
  });

  it('повторяющиеся точки в конце пропускаются', () => {
    const before = endTangent([0, 0, 100, 0, 100, 0]);
    expect(before).toEqual({ x: 0, y: 0 });
  });

  it('маршрут из одной точки не роняет расчёт', () => {
    expect(endTangent([5, 5])).toEqual({ x: 5, y: 5 });
    expect(startTangent([5, 5])).toEqual({ x: 5, y: 5 });
  });
});
