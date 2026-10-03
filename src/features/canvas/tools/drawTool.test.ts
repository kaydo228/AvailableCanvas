import { describe, expect, it } from 'vitest';

import { arrowHeadPoints, DEFAULT_DRAW_DASH, drawFromPoints, isDrawTooShort } from './drawTool';

describe('drawFromPoints', () => {
  it('переводит мировую траекторию в локальные точки DrawNode', () => {
    const node = drawFromPoints([
      { x: 10, y: 20 },
      { x: 20, y: 25 },
      { x: 40, y: 30 },
    ]);

    expect(node).toMatchObject({
      type: 'draw',
      x: 10,
      y: 20,
      width: 30,
      height: 10,
      points: [0, 0, 10, 5, 30, 10],
      stroke: '#f8fafc',
      strokeWidth: 4,
    });

    expect(DEFAULT_DRAW_DASH).toEqual([12, 8]);
  });

  it('короткий случайный штрих не превращает в стрелку', () => {
    expect(
      isDrawTooShort(
        [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ],
        1,
      ),
    ).toBe(true);
  });
});

describe('arrowHeadPoints', () => {
  it('наконечник ориентирован по последнему отрезку, а не по всей траектории', () => {
    const points = arrowHeadPoints([0, 0, 20, 0, 20, 30], 2);

    expect(points).toHaveLength(6);
    expect(points[2]).toBe(20);
    expect(points[3]).toBe(30);
    expect(points[0]).toBeCloseTo(23.47, 1);
    expect(points[4]).toBeCloseTo(16.53, 1);
  });

  it('не меняет направление из-за дрожания у конца траектории', () => {
    const points = arrowHeadPoints([0, 0, 40, 0, 80, 0, 80, 2], 4);

    expect(points).toHaveLength(6);
    expect(points[2]).toBe(80);
    expect(points[3]).toBe(2);
    expect(points[0]).toBeLessThan(80);
    expect(points[4]).toBeLessThan(80);
  });
});
