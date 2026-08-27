import { describe, expect, it } from 'vitest';
import { connector, doc, shape } from '@/shared/model/fixtures';
import {
  checkConnectorsNotGrouped,
  checkEndpointExclusive,
  checkEndpointsExclusive,
  checkOrderMatchesNodes,
  checkZoomInRange,
  validateDocument,
} from '@/shared/model/invariants';
import { removeNode } from '@/shared/model/operations';

/**
 * Пять инвариантов из раздела 5 docs/SPEC.md.
 * На заглушках падают все пять — так и задумано.
 */

describe('инвариант 1 — order и nodes соответствуют один к одному', () => {
  it('на согласованном документе нарушений нет', () => {
    const d = doc([shape('a'), shape('b')]);
    expect(checkOrderMatchesNodes(d)).toEqual([]);
  });

  it('ловит id в order, которого нет в nodes', () => {
    const d = doc([shape('a')]);
    d.order.push('призрак');
    expect(checkOrderMatchesNodes(d)).toHaveLength(1);
  });

  it('ловит узел в nodes, которого нет в order', () => {
    const d = doc([shape('a')]);
    d.nodes.b = shape('b');
    expect(checkOrderMatchesNodes(d)).toHaveLength(1);
  });

  it('ловит дубль в order', () => {
    const d = doc([shape('a')]);
    d.order.push('a');
    expect(checkOrderMatchesNodes(d)).toHaveLength(1);
  });
});

describe('инвариант 2 — коннектор не участвует в группе', () => {
  it('фигуры в группе — нарушения нет', () => {
    const a = shape('a');
    a.groupId = 'g1';
    expect(checkConnectorsNotGrouped(doc([a]))).toEqual([]);
  });

  it('ловит groupId, приписанный коннектору', () => {
    const c = connector('c', 'a', 'b') as unknown as Record<string, unknown>;
    c.groupId = 'g1';
    const d = doc([shape('a'), shape('b'), c as never]);
    expect(checkConnectorsNotGrouped(d)).toHaveLength(1);
  });
});

describe('инвариант 3 — у Endpoint ровно один из nodeId и point', () => {
  it('только nodeId — валидно', () => {
    expect(checkEndpointExclusive({ nodeId: 'a', anchor: 'auto' })).toBe(true);
  });

  it('только point — валидно', () => {
    expect(checkEndpointExclusive({ point: { x: 10, y: 10 } })).toBe(true);
  });

  it('оба сразу — невалидно', () => {
    expect(checkEndpointExclusive({ nodeId: 'a', point: { x: 10, y: 10 } })).toBe(false);
  });

  it('ни одного — невалидно', () => {
    expect(checkEndpointExclusive({ anchor: 'auto' })).toBe(false);
  });
});

describe('инвариант 4 — удаление узла отвязывает ссылающиеся Endpoint', () => {
  it('коннектор остаётся, конец отвязывается в координаты', () => {
    const d = doc([shape('a', 0, 0), shape('b', 300, 0), connector('c', 'a', 'b')]);

    const next = removeNode(d, 'b');

    expect(next.nodes.b).toBeUndefined();
    expect(next.order).not.toContain('b');

    const c = next.nodes.c;
    expect(c).toBeDefined();
    expect(c?.type).toBe('connector');

    if (c?.type === 'connector') {
      expect(c.to.nodeId).toBeUndefined();
      expect(c.to.point).toBeDefined();
      // Точка должна остаться там, где линия заканчивалась, а не в нуле.
      expect(c.to.point?.x).toBeGreaterThan(0);
      // Второй конец не тронут.
      expect(c.from.nodeId).toBe('a');
    }
  });

  it('удаление узла с пятью привязанными линиями не роняет документ', () => {
    const nodes = [
      shape('hub', 200, 200),
      shape('a'),
      shape('b'),
      shape('c'),
      shape('d'),
      shape('e'),
    ];
    const links = ['a', 'b', 'c', 'd', 'e'].map((id, i) => connector(`c${i}`, 'hub', id));
    const d = doc([...nodes, ...links]);

    const next = removeNode(d, 'hub');

    expect(Object.keys(next.nodes)).toHaveLength(10);
    for (const link of links) {
      const c = next.nodes[link.id];
      if (c?.type === 'connector') {
        expect(c.from.nodeId).toBeUndefined();
        expect(c.from.point).toBeDefined();
      }
    }
  });
});

describe('инвариант 5 — zoom в диапазоне [0.1, 4]', () => {
  it('единица — нарушения нет', () => {
    expect(checkZoomInRange(doc([]))).toEqual([]);
  });

  it('ловит зум ниже нижней границы', () => {
    const d = doc([]);
    d.viewport.zoom = 0.05;
    expect(checkZoomInRange(d)).toHaveLength(1);
  });

  it('ловит зум выше верхней границы', () => {
    const d = doc([]);
    d.viewport.zoom = 8;
    expect(checkZoomInRange(d)).toHaveLength(1);
  });
});

describe('validateDocument — все инварианты разом', () => {
  it('здоровый документ не даёт ни одного нарушения', () => {
    const d = doc([shape('a'), shape('b'), connector('c', 'a', 'b')]);
    expect(validateDocument(d)).toEqual([]);
  });

  it('собирает нарушения разных правил вместе', () => {
    const d = doc([shape('a')]);
    d.order.push('призрак');
    d.viewport.zoom = 99;

    const violations = validateDocument(d);
    expect(violations.map((v) => v.rule).sort()).toEqual([1, 5]);
  });

  it('находит концы линии, заданные не ровно одним способом', () => {
    const d = doc([shape('a'), connector('c', 'a', 'a')]);
    const c = d.nodes.c;
    if (c?.type === 'connector') {
      c.from = { nodeId: 'a', point: { x: 1, y: 1 } };
      c.to = {};
    }

    const violations = checkEndpointsExclusive(d);
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.rule === 3)).toBe(true);
  });

  it('NaN в зуме ловится: обычное сравнение с границами его пропускает', () => {
    const d = doc([]);
    d.viewport.zoom = Number.NaN;
    expect(checkZoomInRange(d)).toHaveLength(1);
  });
});
