import { describe, expect, it } from 'vitest';
import { createConnector } from '@/features/canvas/connectors/connectorTool';
import {
  connectorEnds,
  isValidEndpoint,
  nodeEndpoint,
  pointEndpoint,
} from '@/features/canvas/connectors/geometry';
import { connectorPoints } from '@/features/canvas/connectors/routing';
import { doc, shape } from '@/shared/model/fixtures';
import { removeNode } from '@/shared/model/operations';
import type { BoardDocument, ConnectorNode } from '@/shared/types/document';

/**
 * Сценарий из ТЗ, инвариант 4: три фигуры, пять линий между ними,
 * удаляется средняя. Линии обязаны остаться, их концы — отвязаться
 * в последние вычисленные координаты, приложение — не упасть.
 */
/** Линия с заданным id: createConnector выдаёт случайный, а тестам нужны имена. */
function makeLink(id: string, from: ConnectorNode['from'], to: ConnectorNode['to']): ConnectorNode {
  return { ...createConnector(from, to), id };
}

function board(): BoardDocument {
  const left = shape('лево', 0, 0); // 100 x 60
  const mid = shape('центр', 300, 0);
  const right = shape('право', 600, 0);

  const links = [
    makeLink('l1', nodeEndpoint('лево'), nodeEndpoint('центр')),
    makeLink('l2', nodeEndpoint('центр'), nodeEndpoint('право')),
    makeLink('l3', nodeEndpoint('лево'), nodeEndpoint('право')),
    makeLink('l4', nodeEndpoint('центр'), nodeEndpoint('лево')),
    makeLink('l5', nodeEndpoint('право'), nodeEndpoint('центр')),
  ];

  return doc([left, mid, right, ...links]);
}

const connectorsOf = (d: BoardDocument): ConnectorNode[] =>
  Object.values(d.nodes).filter((n): n is ConnectorNode => n.type === 'connector');

describe('удаление узла с пятью привязанными линиями', () => {
  it('не бросает исключение', () => {
    expect(() => removeNode(board(), 'центр')).not.toThrow();
  });

  it('сам узел исчезает из nodes и из order', () => {
    const next = removeNode(board(), 'центр');
    expect(next.nodes['центр']).toBeUndefined();
    expect(next.order).not.toContain('центр');
  });

  it('все пять линий остаются', () => {
    const next = removeNode(board(), 'центр');
    expect(connectorsOf(next)).toHaveLength(5);
    for (const id of ['l1', 'l2', 'l3', 'l4', 'l5']) {
      expect(next.nodes[id]).toBeDefined();
    }
  });

  it('концы, смотревшие на удалённый узел, отвязаны в координаты', () => {
    const next = removeNode(board(), 'центр');

    const cases: Array<[string, 'from' | 'to']> = [
      ['l1', 'to'],
      ['l2', 'from'],
      ['l4', 'from'],
      ['l5', 'to'],
    ];

    for (const [id, which] of cases) {
      const link = next.nodes[id];
      if (link?.type !== 'connector') throw new Error(`нет линии ${id}`);

      expect(link[which].nodeId).toBeUndefined();
      expect(link[which].point).toBeDefined();
    }
  });

  it('отвязанная точка стоит там, где линия заканчивалась, а не в нуле', () => {
    const before = board();
    const original = before.nodes['l1'];
    if (original?.type !== 'connector') throw new Error('фикстура сломана');
    const endsBefore = connectorEnds(original, before);

    const next = removeNode(before, 'центр');
    const link = next.nodes['l1'];
    if (link?.type !== 'connector') throw new Error('нет линии l1');

    expect(link.to.point).toEqual(endsBefore?.to);
    // «Центр» стоит на x = 300, значит и точка не может оказаться в нуле.
    expect(link.to.point?.x).toBeGreaterThan(0);
  });

  it('второй конец каждой линии не тронут', () => {
    const next = removeNode(board(), 'центр');

    const untouched: Array<[string, 'from' | 'to', string]> = [
      ['l1', 'from', 'лево'],
      ['l2', 'to', 'право'],
      ['l4', 'to', 'лево'],
      ['l5', 'from', 'право'],
    ];

    for (const [id, which, nodeId] of untouched) {
      const link = next.nodes[id];
      if (link?.type !== 'connector') throw new Error(`нет линии ${id}`);
      expect(link[which].nodeId).toBe(nodeId);
    }
  });

  it('линия, не касавшаяся удалённого узла, вообще не изменилась', () => {
    const before = board();
    const next = removeNode(before, 'центр');
    expect(next.nodes['l3']).toEqual(before.nodes['l3']);
  });

  it('инвариант 3 держится на всех концах после удаления', () => {
    const next = removeNode(board(), 'центр');
    for (const link of connectorsOf(next)) {
      expect(isValidEndpoint(link.from)).toBe(true);
      expect(isValidEndpoint(link.to)).toBe(true);
    }
  });

  it('инвариант 1 держится: order и nodes по-прежнему один к одному', () => {
    const next = removeNode(board(), 'центр');
    expect(next.order).toHaveLength(Object.keys(next.nodes).length);
    for (const id of next.order) expect(next.nodes[id]).toBeDefined();
  });

  it('все линии по-прежнему вычислимы — рендер не получит null', () => {
    const next = removeNode(board(), 'центр');
    for (const link of connectorsOf(next)) {
      expect(connectorEnds(link, next)).not.toBeNull();
    }
  });

  it('удаление оставшихся фигур подряд тоже не роняет документ', () => {
    let d = board();
    for (const id of ['центр', 'лево', 'право']) {
      expect(() => {
        d = removeNode(d, id);
      }).not.toThrow();
    }

    expect(connectorsOf(d)).toHaveLength(5);
    for (const link of connectorsOf(d)) {
      // Обе стороны стали свободными точками — привязываться уже не к чему.
      expect(link.from.point).toBeDefined();
      expect(link.to.point).toBeDefined();
      expect(connectorEnds(link, d)).not.toBeNull();
    }
  });

  it('удаление узла, на который никто не ссылается, ничего не ломает', () => {
    const d = doc([shape('одинокий', 0, 0)]);
    const next = removeNode(d, 'одинокий');
    expect(next.order).toEqual([]);
    expect(Object.keys(next.nodes)).toEqual([]);
  });

  it('удаление несуществующего узла возвращает документ как есть', () => {
    const d = board();
    expect(removeNode(d, 'призрак')).toBe(d);
  });

  it('линия с уже свободным концом при удалении не портится', () => {
    const d = doc([
      shape('a', 0, 0),
      makeLink('l', nodeEndpoint('a'), pointEndpoint({ x: 500, y: 500 })),
    ]);

    const next = removeNode(d, 'a');
    const link = next.nodes['l'];
    if (link?.type !== 'connector') throw new Error('нет линии');

    expect(link.to.point).toEqual({ x: 500, y: 500 });
    expect(link.from.point).toBeDefined();
    expect(link.from.nodeId).toBeUndefined();
  });
});

describe('удаление при ломаной и кривой', () => {
  for (const routing of ['elbow', 'curve'] as const) {
    it(`режим ${routing}: линия остаётся вычислимой после удаления узла`, () => {
      const d = doc([
        shape('a', 0, 0),
        shape('b', 400, 200),
        { ...makeLink('l', nodeEndpoint('a'), nodeEndpoint('b')), routing },
      ]);

      const next = removeNode(d, 'b');
      const link = next.nodes['l'];
      if (link?.type !== 'connector') throw new Error('нет линии');

      expect(link.to.point).toBeDefined();
      const points = connectorPoints(link, next);
      expect(points).not.toBeNull();
      expect((points as number[]).every(Number.isFinite)).toBe(true);
    });
  }

  it('удаление обеих фигур при ломаной не роняет маршрут', () => {
    let d = doc([
      shape('a', 0, 0),
      shape('b', 400, 0),
      { ...makeLink('l', nodeEndpoint('a'), nodeEndpoint('b')), routing: 'elbow' as const },
    ]);
    d = removeNode(d, 'a');
    d = removeNode(d, 'b');

    const link = d.nodes['l'];
    if (link?.type !== 'connector') throw new Error('нет линии');
    expect(connectorPoints(link, d)).not.toBeNull();
  });
});

describe('регрессия ломателя: второй конец не разрешается', () => {
  it('отвязка происходит, даже если другой конец висит на несуществующем узле', () => {
    // Раньше connectorEnds возвращал null, и спред отменял отвязку ОБОИХ
    // концов: узел оставался висячей ссылкой навсегда и уезжал в IndexedDB.
    const d = doc([shape('a', 0, 0), makeLink('l', nodeEndpoint('a'), nodeEndpoint('призрак'))]);

    const next = removeNode(d, 'a');
    const link = next.nodes['l'];
    if (link?.type !== 'connector') throw new Error('нет линии');

    expect(link.from.nodeId).toBeUndefined();
    expect(link.from.point).toBeDefined();
    expect(Number.isFinite(link.from.point?.x)).toBe(true);
  });

  it('висячих ссылок на удалённый узел не остаётся ни в одной линии', () => {
    const d = doc([
      shape('a', 0, 0),
      shape('b', 300, 0),
      makeLink('l1', nodeEndpoint('a'), nodeEndpoint('нет-такого')),
      makeLink('l2', nodeEndpoint('a'), nodeEndpoint('b')),
    ]);

    const next = removeNode(d, 'a');

    for (const id of ['l1', 'l2']) {
      const link = next.nodes[id];
      if (link?.type !== 'connector') throw new Error(`нет линии ${id}`);
      expect(link.from.nodeId).not.toBe('a');
      expect(link.to.nodeId).not.toBe('a');
    }
  });
});

describe('регрессии финальной проверки', () => {
  it('чужой anchor: точка отрисовки и точка отвязки совпадают', () => {
    // Раньше routing откатывался на автоподбор стороны, а geometry — на центр
    // рамки: линия рисовалась из якоря, а при удалении конец прыгал в центр.
    const link = {
      ...makeLink('l', { nodeId: 'a', anchor: 'centre' as never }, nodeEndpoint('b')),
    };
    const d = doc([shape('a', 0, 0), shape('b', 400, 0), link]);

    const drawn = connectorPoints(link, d) as number[];
    const next = removeNode(d, 'a');
    const detached = next.nodes['l'];
    if (detached?.type !== 'connector') throw new Error('нет линии');

    expect(detached.from.point?.x).toBeCloseTo(drawn[0] as number, 6);
    expect(detached.from.point?.y).toBeCloseTo(drawn[1] as number, 6);
  });

  it('нефинитные координаты не попадают в модель при отвязке', () => {
    const broken = shape('a', 0, 0);
    broken.x = Number.NaN;
    const d = doc([
      broken,
      shape('b', 400, 0),
      makeLink('l', nodeEndpoint('a'), nodeEndpoint('b')),
    ]);

    const next = removeNode(d, 'a');
    const link = next.nodes['l'];
    if (link?.type !== 'connector') throw new Error('нет линии');

    expect(Number.isFinite(link.from.point?.x)).toBe(true);
    expect(Number.isFinite(link.from.point?.y)).toBe(true);
  });

  it('узел с id __proto__ удаляется, а не пропадает молча', () => {
    const d = doc([shape('__proto__', 0, 0), shape('b', 400, 0)]);
    const next = removeNode(d, 'b');

    // Уцелевший узел обязан остаться и в nodes, и в order.
    expect(next.order).toContain('__proto__');
    expect(next.nodes['__proto__']).toBeDefined();
    expect(next.order).toHaveLength(Object.keys(next.nodes).length);
  });

  it('мусорная запись в order вычищается', () => {
    const d = doc([shape('a', 0, 0)]);
    d.order.push('призрак');

    const next = removeNode(d, 'призрак');
    expect(next.order).not.toContain('призрак');
    expect(next.order).toHaveLength(Object.keys(next.nodes).length);
  });
});
