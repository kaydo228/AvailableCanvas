import { describe, expect, it } from 'vitest';
import { createConnector } from '@/features/canvas/connectors/connectorTool';
import { nodeEndpoint, pointEndpoint } from '@/features/canvas/connectors/geometry';
import { connectorPoints, controlArm, isBezier } from '@/features/canvas/connectors/routing';
import { doc, shape } from '@/shared/model/fixtures';
import type { Anchor, BoardDocument, ConnectorNode } from '@/shared/types/document';

/** shape(): 100 x 60. */
const at = (id: string, x: number, y: number) => shape(id, x, y);

function board(
  routing: ConnectorNode['routing'],
  a: { id: string; x: number; y: number; anchor: Anchor },
  b: { id: string; x: number; y: number; anchor: Anchor },
): { document: BoardDocument; link: ConnectorNode } {
  const link = createConnector(nodeEndpoint(a.id, a.anchor), nodeEndpoint(b.id, b.anchor), {
    routing,
  });
  const document = doc([at(a.id, a.x, a.y), at(b.id, b.x, b.y), link]);
  return { document, link };
}

const pairs = (points: number[]) => {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    out.push({ x: points[i] as number, y: points[i + 1] as number });
  }
  return out;
};

/** Все сегменты строго горизонтальны или вертикальны. */
function isOrthogonal(points: number[]): boolean {
  const p = pairs(points);
  for (let i = 1; i < p.length; i += 1) {
    const a = p[i - 1] as { x: number; y: number };
    const b = p[i] as { x: number; y: number };
    const horizontal = Math.abs(a.y - b.y) < 1e-9;
    const vertical = Math.abs(a.x - b.x) < 1e-9;
    if (!horizontal && !vertical) return false;
  }
  return true;
}

describe('ломаная — ортогональность', () => {
  const cases: Array<[string, Anchor, Anchor, [number, number], [number, number]]> = [
    ['лицом к лицу по горизонтали', 'right', 'left', [0, 0], [400, 0]],
    ['лицом к лицу по вертикали', 'bottom', 'top', [0, 0], [0, 400]],
    ['перпендикулярно', 'right', 'top', [0, 0], [400, 300]],
    ['перпендикулярно наоборот', 'bottom', 'left', [0, 0], [400, 300]],
    ['сонаправленные, разная высота', 'right', 'right', [0, 0], [400, 200]],
    ['сонаправленные, ОДИНАКОВАЯ высота', 'right', 'right', [0, 0], [400, 0]],
    ['спиной к спине', 'left', 'right', [0, 0], [400, 0]],
    ['сонаправленные вертикально', 'top', 'top', [0, 0], [400, 0]],
    ['фигуры перекрываются', 'right', 'left', [0, 0], [40, 20]],
    ['цель левее источника', 'right', 'left', [400, 0], [0, 0]],
  ];

  for (const [name, from, to, a, b] of cases) {
    it(`${name} — все сегменты строго H или V`, () => {
      const { document, link } = board(
        'elbow',
        { id: 'a', x: a[0], y: a[1], anchor: from },
        { id: 'b', x: b[0], y: b[1], anchor: to },
      );
      const points = connectorPoints(link, document);
      expect(points).not.toBeNull();
      expect(isOrthogonal(points as number[])).toBe(true);
    });
  }
});

describe('ломаная — выход из фигуры перпендикулярно стороне', () => {
  it('из правой стороны первый сегмент горизонтальный', () => {
    const { document, link } = board(
      'elbow',
      { id: 'a', x: 0, y: 0, anchor: 'right' },
      { id: 'b', x: 400, y: 200, anchor: 'left' },
    );
    const p = pairs(connectorPoints(link, document) as number[]);
    expect(p[0]?.y).toBeCloseTo(p[1]?.y as number, 9);
    expect(p[1]?.x).toBeGreaterThan(p[0]?.x as number);
  });

  it('из верхней стороны первый сегмент вертикальный и вверх', () => {
    const { document, link } = board(
      'elbow',
      { id: 'a', x: 0, y: 400, anchor: 'top' },
      { id: 'b', x: 0, y: 0, anchor: 'bottom' },
    );
    const p = pairs(connectorPoints(link, document) as number[]);
    expect(p[0]?.x).toBeCloseTo(p[1]?.x as number, 9);
    expect(p[1]?.y).toBeLessThan(p[0]?.y as number);
  });
});

describe('ломаная — сонаправленные при равной высоте не идут насквозь', () => {
  it('маршрут уходит поперёк за пределы обеих фигур', () => {
    const { document, link } = board(
      'elbow',
      { id: 'a', x: 0, y: 0, anchor: 'right' },
      { id: 'b', x: 400, y: 0, anchor: 'right' },
    );
    const p = pairs(connectorPoints(link, document) as number[]);

    // Фигуры занимают y от 0 до 60. Поперечный сегмент обязан выйти
    // за этот диапазон, иначе линия прошла бы сквозь дальнюю фигуру.
    const ys = p.map((point) => point.y);
    const outside = ys.some((y) => y < 0 || y > 60);
    expect(outside).toBe(true);
  });

  it('поперечный сегмент не вырожден', () => {
    const { document, link } = board(
      'elbow',
      { id: 'a', x: 0, y: 0, anchor: 'right' },
      { id: 'b', x: 400, y: 0, anchor: 'right' },
    );
    const p = pairs(connectorPoints(link, document) as number[]);
    const distinctY = new Set(p.map((point) => Math.round(point.y)));
    expect(distinctY.size).toBeGreaterThan(1);
  });
});

describe('кривая Безье', () => {
  it('маршрут состоит ровно из восьми чисел — Konva читает 2 + 6k', () => {
    const { document, link } = board(
      'curve',
      { id: 'a', x: 0, y: 0, anchor: 'right' },
      { id: 'b', x: 400, y: 200, anchor: 'left' },
    );
    const points = connectorPoints(link, document) as number[];
    expect(points).toHaveLength(8);
    expect((points.length - 2) % 6).toBe(0);
    expect(isBezier(link, points)).toBe(true);
  });

  it('контрольная точка отложена по нормали стороны', () => {
    const { document, link } = board(
      'curve',
      { id: 'a', x: 0, y: 0, anchor: 'right' },
      { id: 'b', x: 400, y: 200, anchor: 'left' },
    );
    const p = pairs(connectorPoints(link, document) as number[]);
    // Выход вправо: контрольная точка правее якоря и на той же высоте.
    expect(p[1]?.x).toBeGreaterThan(p[0]?.x as number);
    expect(p[1]?.y).toBeCloseTo(p[0]?.y as number, 9);
  });

  it('плечо зажато между 12 и 160', () => {
    expect(controlArm(0)).toBe(12);
    expect(controlArm(10)).toBe(12);
    expect(controlArm(100)).toBe(50);
    expect(controlArm(10000)).toBe(160);
  });
});

describe('вырожденные случаи', () => {
  it('совпавшие концы дают прямую из двух точек в любом режиме', () => {
    for (const routing of ['straight', 'elbow', 'curve'] as const) {
      const link = createConnector(
        pointEndpoint({ x: 10, y: 10 }),
        pointEndpoint({ x: 10, y: 10 }),
        { routing },
      );
      const document = doc([link]);
      const points = connectorPoints(link, document) as number[];
      expect(points).toHaveLength(4);
      // Кривая на двух точках не отрисуется, значит bezier обязан быть false.
      expect(isBezier(link, points)).toBe(false);
    }
  });

  it('свободные концы прокладываются во всех режимах', () => {
    for (const routing of ['straight', 'elbow', 'curve'] as const) {
      const link = createConnector(
        pointEndpoint({ x: 0, y: 0 }),
        pointEndpoint({ x: 300, y: 200 }),
        { routing },
      );
      const document = doc([link]);
      const points = connectorPoints(link, document);
      expect(points).not.toBeNull();
      expect((points as number[]).every(Number.isFinite)).toBe(true);
    }
  });

  it('ломаная между свободными концами тоже ортогональна', () => {
    const link = createConnector(pointEndpoint({ x: 0, y: 0 }), pointEndpoint({ x: 300, y: 200 }), {
      routing: 'elbow',
    });
    expect(isOrthogonal(connectorPoints(link, doc([link])) as number[])).toBe(true);
  });

  it('исчезнувший узел даёт null, а не исключение', () => {
    const { document, link } = board(
      'elbow',
      { id: 'a', x: 0, y: 0, anchor: 'right' },
      { id: 'b', x: 400, y: 0, anchor: 'left' },
    );
    delete document.nodes['b'];
    expect(connectorPoints(link, document)).toBeNull();
  });

  it('ни одно число в маршруте не NaN', () => {
    for (const routing of ['straight', 'elbow', 'curve'] as const) {
      for (const [ax, ay, bx, by] of [
        [0, 0, 0, 0],
        [0, 0, 1, 0],
        [0, 0, -400, -300],
        [1e6, 1e6, -1e6, -1e6],
      ]) {
        const { document, link } = board(
          routing,
          { id: 'a', x: ax as number, y: ay as number, anchor: 'auto' },
          { id: 'b', x: bx as number, y: by as number, anchor: 'auto' },
        );
        const points = connectorPoints(link, document) as number[];
        expect(points.every(Number.isFinite)).toBe(true);
      }
    }
  });
});

/**
 * Регрессии на находки ломателя (шаг 7 ночного прогона).
 * Каждый тест воспроизводит конкретную поломку из 08-аудит-ломатель.md.
 */
describe('регрессии ломателя', () => {
  it('малый зазор не даёт шипа наружу: маршрут остаётся в пределах фигур', () => {
    // Зазор 20 между смотрящими друг на друга сторонами. Раньше вылет
    // ужимался до 10 с каждой стороны, разность обращалась в ноль,
    // Math.sign(0) не совпадал с ±1 — и ветка «навстречу» не срабатывала.
    for (const gap of [2, 8, 20, 32, 33, 60]) {
      const { document, link } = board(
        'elbow',
        { id: 'a', x: 0, y: 0, anchor: 'right' },
        { id: 'b', x: 100 + gap, y: 0, anchor: 'left' },
      );
      const points = connectorPoints(link, document) as number[];
      const ys = points.filter((_, i) => i % 2 === 1);

      expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...ys)).toBeLessThanOrEqual(60);
      expect(isOrthogonal(points)).toBe(true);
    }
  });

  it('то же по вертикали', () => {
    for (const gap of [2, 20, 32, 33]) {
      const { document, link } = board(
        'elbow',
        { id: 'a', x: 0, y: 0, anchor: 'bottom' },
        { id: 'b', x: 0, y: 60 + gap, anchor: 'top' },
      );
      const points = connectorPoints(link, document) as number[];
      const xs = points.filter((_, i) => i % 2 === 0);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(100);
    }
  });

  it('маршрут не содержит дублей и коллинеарных точек', () => {
    for (const gap of [2, 20, 33, 200]) {
      const { document, link } = board(
        'elbow',
        { id: 'a', x: 0, y: 0, anchor: 'right' },
        { id: 'b', x: 100 + gap, y: 0, anchor: 'left' },
      );
      const p = pairs(connectorPoints(link, document) as number[]);

      for (let i = 1; i < p.length; i += 1) {
        const a = p[i - 1] as { x: number; y: number };
        const b = p[i] as { x: number; y: number };
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(1e-9);
      }
    }
  });

  it('anchor вне типа не роняет прокладку', () => {
    // Приходит из импортированного документа: типы там никто не проверял.
    for (const bad of ['centre', 'TOP', '', 0, null]) {
      const link = createConnector({ nodeId: 'a', anchor: bad as never }, nodeEndpoint('b'), {
        routing: 'elbow',
      });
      const document = doc([at('a', 0, 0), at('b', 400, 0), link]);

      expect(() => connectorPoints(link, document)).not.toThrow();
      const points = connectorPoints(link, document);
      expect(points === null || points.every(Number.isFinite)).toBe(true);
    }
  });

  it('нефинитные координаты узла дают null, а не NaN в модели', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const routing of ['straight', 'elbow', 'curve'] as const) {
        const link = createConnector(nodeEndpoint('a'), nodeEndpoint('b'), { routing });
        const broken = at('a', 0, 0);
        broken.x = bad;
        const document = doc([broken, at('b', 400, 0), link]);

        expect(connectorPoints(link, document)).toBeNull();
      }
    }
  });
});
