import { describe, expect, it } from 'vitest';

import {
  ANCHOR_SNAP_SCREEN,
  anchorPoint,
  autoAnchor,
  centerOf,
  connectorEnds,
  endpointAt,
  isValidEndpoint,
  nearestAnchor,
  nodeAtPoint,
  nodeEndpoint,
  pointEndpoint,
  resolveEndpoint,
} from '@/features/canvas/connectors/geometry';
import { connector, doc, shape } from '@/shared/model/fixtures';
import type { BoxNode } from '@/shared/types/document';

/** shape() из фикстур: 100 x 60. */
const box = (id: string, x = 0, y = 0): BoxNode => shape(id, x, y);

describe('инвариант 3 — у Endpoint ровно один из nodeId и point', () => {
  it('конструктор свободного конца даёт только point', () => {
    const endpoint = pointEndpoint({ x: 10, y: 20 });
    expect(endpoint.point).toEqual({ x: 10, y: 20 });
    expect(endpoint.nodeId).toBeUndefined();
    expect(isValidEndpoint(endpoint)).toBe(true);
  });

  it('конструктор привязанного конца даёт только nodeId', () => {
    const endpoint = nodeEndpoint('a', 'top');
    expect(endpoint.nodeId).toBe('a');
    expect(endpoint.point).toBeUndefined();
    expect(isValidEndpoint(endpoint)).toBe(true);
  });

  it('оба поля разом невалидны', () => {
    expect(isValidEndpoint({ nodeId: 'a', point: { x: 0, y: 0 } })).toBe(false);
  });

  it('ни одного поля невалидно', () => {
    expect(isValidEndpoint({})).toBe(false);
    expect(isValidEndpoint({ anchor: 'auto' })).toBe(false);
  });

  it('endpointAt всегда возвращает валидный конец', () => {
    const d = doc([box('a', 0, 0)]);
    for (const p of [
      { x: 50, y: 0 },
      { x: 50, y: 30 },
      { x: 500, y: 500 },
      { x: 0, y: 0 },
    ]) {
      expect(isValidEndpoint(endpointAt(d, p, 1))).toBe(true);
    }
  });
});

describe('anchorPoint — середины сторон', () => {
  const node = box('a', 100, 200);

  it('верх', () => expect(anchorPoint(node, 'top')).toEqual({ x: 150, y: 200 }));
  it('низ', () => expect(anchorPoint(node, 'bottom')).toEqual({ x: 150, y: 260 }));
  it('лево', () => expect(anchorPoint(node, 'left')).toEqual({ x: 100, y: 230 }));
  it('право', () => expect(anchorPoint(node, 'right')).toEqual({ x: 200, y: 230 }));

  it('центр между левым и правым якорем', () => {
    const c = centerOf(node);
    expect(c.x).toBe((anchorPoint(node, 'left').x + anchorPoint(node, 'right').x) / 2);
  });
});

describe('autoAnchor — сторона выбирается сама', () => {
  const node = box('a', 0, 0); // 100 x 60, центр (50, 30)

  it('цель справа — правая сторона', () => {
    expect(autoAnchor(node, { x: 500, y: 30 })).toBe('right');
  });

  it('цель слева — левая', () => {
    expect(autoAnchor(node, { x: -500, y: 30 })).toBe('left');
  });

  it('цель сверху — верхняя', () => {
    expect(autoAnchor(node, { x: 50, y: -500 })).toBe('top');
  });

  it('цель снизу — нижняя', () => {
    expect(autoAnchor(node, { x: 50, y: 500 })).toBe('bottom');
  });

  it('сравниваются доли от полуразмеров, а не абсолютные смещения', () => {
    // Широкая низкая фигура: цель смещена по x сильнее, чем по y,
    // но относительно своих полуразмеров — заметно выше.
    const wide: BoxNode = { ...box('w', 0, 0), width: 400, height: 20 };
    // центр (200, 10); dx = 60, dy = -40
    // по абсолютной величине победил бы x, по долям — y: 60/200 < 40/10
    expect(autoAnchor(wide, { x: 260, y: -30 })).toBe('top');
  });
});

describe('nodeAtPoint', () => {
  it('находит фигуру под точкой', () => {
    const d = doc([box('a', 0, 0)]);
    expect(nodeAtPoint(d, { x: 50, y: 30 })?.id).toBe('a');
  });

  it('вне фигуры — ничего', () => {
    const d = doc([box('a', 0, 0)]);
    expect(nodeAtPoint(d, { x: 500, y: 500 })).toBeNull();
  });

  it('при наложении берётся верхняя по порядку отрисовки', () => {
    const d = doc([box('низ', 0, 0), box('верх', 0, 0)]);
    expect(nodeAtPoint(d, { x: 50, y: 30 })?.id).toBe('верх');
  });

  it('коннектор целью не считается: у него нет рамки', () => {
    const d = doc([box('a'), box('b'), connector('c', 'a', 'b')]);
    expect(nodeAtPoint(d, { x: 50, y: 30 })?.type).not.toBe('connector');
  });
});

describe('endpointAt — куда привяжется конец', () => {
  const d = doc([box('a', 0, 0)]); // 100 x 60

  it('рядом с якорем — эта сторона', () => {
    expect(endpointAt(d, { x: 50, y: 2 }, 1)).toEqual({ nodeId: 'a', anchor: 'top' });
  });

  it('внутри фигуры, но мимо якорей — auto', () => {
    expect(endpointAt(d, { x: 50, y: 30 }, 1)).toEqual({ nodeId: 'a', anchor: 'auto' });
  });

  it('мимо фигуры — свободная точка', () => {
    expect(endpointAt(d, { x: 400, y: 400 }, 1)).toEqual({ point: { x: 400, y: 400 } });
  });

  it('радиус прилипания задан в экранных пикселях', () => {
    // На зуме 0.5 тот же экранный радиус покрывает вдвое больше мира.
    const far = { x: 50, y: ANCHOR_SNAP_SCREEN + 4 };
    expect(endpointAt(d, far, 1).anchor).toBe('auto');
    expect(endpointAt(d, far, 0.5).anchor).toBe('top');
  });
});

describe('resolveEndpoint и connectorEnds', () => {
  it('свободный конец отдаёт свою точку', () => {
    const d = doc([]);
    expect(resolveEndpoint(pointEndpoint({ x: 7, y: 9 }), d, { x: 0, y: 0 })).toEqual({
      x: 7,
      y: 9,
    });
  });

  it('привязанный конец с явной стороной отдаёт её якорь', () => {
    const d = doc([box('a', 0, 0)]);
    expect(resolveEndpoint(nodeEndpoint('a', 'right'), d, { x: 0, y: 0 })).toEqual({
      x: 100,
      y: 30,
    });
  });

  it('обе стороны auto разрешаются друг относительно друга', () => {
    const left = box('l', 0, 0);
    const right = box('r', 400, 0);
    const d = doc([left, right, connector('c', 'l', 'r')]);
    const c = d.nodes['c'];
    if (c?.type !== 'connector') throw new Error('фикстура сломана');

    const ends = connectorEnds(c, d);
    expect(ends).not.toBeNull();
    // Линия выходит из правого бока левой фигуры в левый бок правой.
    expect(ends?.from).toEqual({ x: 100, y: 30 });
    expect(ends?.to).toEqual({ x: 400, y: 30 });
  });

  it('конец на исчезнувшем узле даёт null, а не исключение', () => {
    const d = doc([box('a', 0, 0), box('b', 300, 0), connector('c', 'a', 'b')]);
    delete d.nodes['b'];
    const c = d.nodes['c'];
    if (c?.type !== 'connector') throw new Error('фикстура сломана');

    expect(connectorEnds(c, d)).toBeNull();
  });
});

describe('nearestAnchor', () => {
  const node = box('a', 0, 0);

  it('находит ближайшую сторону и расстояние', () => {
    const { anchor, distance } = nearestAnchor(node, { x: 50, y: -5 });
    expect(anchor).toBe('top');
    expect(distance).toBeCloseTo(5, 6);
  });

  it('из центра расстояние до всех сторон не бесконечно', () => {
    const { distance } = nearestAnchor(node, centerOf(node));
    expect(Number.isFinite(distance)).toBe(true);
  });
});
