/**
 * Кейсы взяты один в один из аудита оболочки
 * (docs/nightly/shell/01-план-починки.md, итерация И3): каждый из них
 * проходил импорт молча и уезжал в IndexedDB.
 */

import { describe, expect, it } from 'vitest';

import { connector, doc, shape } from '@/shared/model/fixtures';
import type { BoardDocument, ConnectorNode, GroupNode } from '@/shared/types/document';
import { repairDocument } from './repair';

/** Собрать документ и тут же испортить его как приехавший из файла. */
const broken = (patch: (d: BoardDocument) => void): BoardDocument => {
  const document = doc([shape('a', 10, 20)]);
  patch(document);
  return document;
};

describe('инвариант 5 — zoom в [0.1, 4]', () => {
  it.each([
    [0, 0.1],
    [-3, 0.1],
    [1e12, 4],
    [0.05, 0.1],
    [Number.NaN, 1],
  ])('zoom %p зажимается в %p', (given, expected) => {
    const { document, repairs } = repairDocument(
      broken((d) => {
        d.viewport.zoom = given;
      }),
    );

    expect(document.viewport.zoom).toBe(expected);
    expect(repairs).toHaveLength(1);
    expect(repairs[0]?.rule).toBe(5);
  });

  it('здоровый zoom не трогается и починок не порождает', () => {
    const { document, repairs } = repairDocument(doc([shape('a')]));

    expect(document.viewport.zoom).toBe(1);
    expect(repairs).toEqual([]);
  });

  it('нечисловое положение вида обнуляется', () => {
    const { document } = repairDocument(
      broken((d) => {
        d.viewport.x = Number.POSITIVE_INFINITY;
      }),
    );

    expect(document.viewport.x).toBe(0);
  });
});

describe('инвариант 1 — order и nodes один к одному', () => {
  it('дубль в order убирается, остаётся первое вхождение', () => {
    const { document, repairs } = repairDocument(
      broken((d) => {
        d.order = ['a', 'a', 'a'];
      }),
    );

    expect(document.order).toEqual(['a']);
    expect(repairs).toHaveLength(2);
  });

  it('id в order без узла выбрасывается', () => {
    const { document, repairs } = repairDocument(
      broken((d) => {
        d.order = ['a', '__proto__', 'нет-такого'];
      }),
    );

    expect(document.order).toEqual(['a']);
    expect(repairs.every((r) => r.rule === 1)).toBe(true);
  });

  it('узел без записи в order дописывается наверх', () => {
    const { document, repairs } = repairDocument(
      broken((d) => {
        d.nodes.b = shape('b', 50, 50);
      }),
    );

    expect(document.order).toEqual(['a', 'b']);
    expect(repairs).toHaveLength(1);
  });

  it('ключ в nodes сильнее node.id: адресуют по ключу', () => {
    const { document, repairs } = repairDocument(
      broken((d) => {
        d.nodes = { ключ: shape('другой-id') };
        d.order = ['ключ'];
      }),
    );

    expect(document.nodes.ключ?.id).toBe('ключ');
    expect(document.order).toEqual(['ключ']);
    expect(repairs[0]?.rule).toBe(1);
  });
});

describe('инвариант 3 — у Endpoint ровно один из nodeId и point', () => {
  const withConnector = (from: unknown, to: unknown): BoardDocument => {
    const document = doc([shape('a', 0, 0), connector('c', 'a', 'a')]);
    const c = document.nodes.c as ConnectorNode;
    c.from = from as ConnectorNode['from'];
    c.to = to as ConnectorNode['to'];
    return document;
  };

  it('оба поля разом — остаётся nodeId', () => {
    const { document, repairs } = repairDocument(
      withConnector({ nodeId: 'a', point: { x: 5, y: 5 } }, { point: { x: 1, y: 1 } }),
    );

    const c = document.nodes.c as ConnectorNode;
    expect(c.from).toEqual({ nodeId: 'a', anchor: 'auto' });
    expect(repairs.some((r) => r.rule === 3)).toBe(true);
  });

  it('нулевой соединитель после починки не остаётся невидимым в документе', () => {
    const { document } = repairDocument(withConnector({}, { point: { x: 300, y: 400 } }));

    expect(document.nodes.c).toBeUndefined();
  });

  it('nodeId в несуществующий узел — конец отвязывается в центр партнёра', () => {
    const { document, repairs } = repairDocument(
      withConnector({ nodeId: 'НЕТ-ТАКОГО' }, { nodeId: 'a', anchor: 'auto' }),
    );

    const c = document.nodes.c as ConnectorNode;
    // Фигура 'a' стоит в 0,0 и имеет размер 100×60 — центр 50,30.
    expect(c.from).toEqual({ point: { x: 50, y: 30 } });
    expect(repairs.some((r) => r.rule === 3)).toBe(true);
  });

  it('здоровые концы не трогаются', () => {
    const { repairs } = repairDocument(doc([shape('a'), connector('c', 'a', 'a')]));

    expect(repairs).toEqual([]);
  });
});

describe('инвариант 2 — коннектор не участвует в группе', () => {
  it('groupId у коннектора убирается', () => {
    const document = doc([shape('a'), connector('c', 'a', 'a')]);
    (document.nodes.c as ConnectorNode & { groupId?: string }).groupId = 'g';

    const { document: fixed, repairs } = repairDocument(document);

    expect('groupId' in (fixed.nodes.c as object)).toBe(false);
    expect(repairs.some((r) => r.rule === 2)).toBe(true);
  });
});

describe('числа узлов', () => {
  it('opacity 42 зажимается в 1 — иначе Konva роняет отрисовку', () => {
    const { document, repairs } = repairDocument(
      broken((d) => {
        (d.nodes.a as { opacity: number }).opacity = 42;
      }),
    );

    expect(document.nodes.a?.opacity).toBe(1);
    expect(repairs).toHaveLength(1);
  });

  it('отрицательный размер поднимается до общего минимума, а не берётся по модулю', () => {
    const { document } = repairDocument(
      broken((d) => {
        Object.assign(d.nodes.a as object, { width: -500, height: -500 });
      }),
    );

    expect(document.nodes.a).toMatchObject({ width: 8, height: 8 });
  });

  it('NaN в координатах обнуляется', () => {
    const { document } = repairDocument(
      broken((d) => {
        Object.assign(d.nodes.a as object, { x: Number.NaN, rotation: Number.NaN });
      }),
    );

    expect(document.nodes.a).toMatchObject({ x: 0, rotation: 0 });
  });
});

describe('группы', () => {
  it('группа меньше двух участников распускается, а узел сохраняется', () => {
    const group: GroupNode = {
      id: 'g',
      type: 'group',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotation: 0,
      opacity: 1,
      locked: false,
      children: ['a', 'нет1', 'нет2'],
    };
    const { document, repairs } = repairDocument(doc([shape('a'), group]));

    expect(document.nodes.g).toBeUndefined();
    expect(document.nodes.a).toBeDefined();
    expect(repairs.length).toBeGreaterThan(0);
  });

  it('groupId имеет приоритет и восстанавливает children без коннектора', () => {
    const group: GroupNode = {
      id: 'g',
      type: 'group',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rotation: 0,
      opacity: 1,
      locked: false,
      children: ['a', 'c'],
    };
    const a = { ...shape('a'), groupId: 'g' };
    const b = { ...shape('b', 200, 0), groupId: 'g' };
    const { document } = repairDocument(doc([a, b, connector('c', 'a', 'b'), group]));
    expect((document.nodes.g as GroupNode).children).toEqual(['a', 'b']);
  });

  it('обрезает текст в импортированном документе с отчётом о починке', () => {
    const text = {
      ...shape('a'),
      label: { value: 'x'.repeat(10_001), fontSize: 14, color: '#000', align: 'left' as const },
    };
    const { document, repairs } = repairDocument(doc([text]));
    expect((document.nodes.a as typeof text).label?.value).toHaveLength(10_000);
    expect(repairs.some((repair) => repair.what.includes('сокращён'))).toBe(true);
  });
});

describe('общее', () => {
  it('исходный документ не мутируется', () => {
    const document = broken((d) => {
      d.viewport.zoom = 0;
      d.order = ['a', 'a'];
    });

    repairDocument(document);

    expect(document.viewport.zoom).toBe(0);
    expect(document.order).toEqual(['a', 'a']);
  });

  it('починка идемпотентна: второй проход ничего не находит', () => {
    const first = repairDocument(
      broken((d) => {
        d.viewport.zoom = 0;
        d.order = ['a', 'a', 'нет'];
        (d.nodes.a as { opacity: number }).opacity = 42;
      }),
    );

    expect(first.repairs.length).toBeGreaterThan(0);
    expect(repairDocument(first.document).repairs).toEqual([]);
  });

  it('здоровый документ проходит без единой починки', () => {
    const { repairs } = repairDocument(doc([shape('a'), shape('b', 10, 10)]));

    expect(repairs).toEqual([]);
  });
});
