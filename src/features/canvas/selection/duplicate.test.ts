/**
 * Дублирование выделенного.
 *
 * Проверяется то, из-за чего копия оказывается бесполезной: копия легла
 * ровно на оригинал и её не видно, копия группы ссылается на оригинальных
 * детей, копия линии осталась привязанной к исходным фигурам. Всё это
 * выглядит как «дублирование не сработало», а причина каждый раз разная.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { connector, doc, shape } from '@/shared/model/fixtures';
import { validateDocument } from '@/shared/model/invariants';
import { useBoardStore } from '@/shared/store/board';
import type { BoardDocument, ConnectorNode, GroupNode, Id } from '@/shared/types/document';

const board = () => useBoardStore.getState();
const document = () => board().document as BoardDocument;
const nodeAt = (id: Id) => document().nodes[id];

/** Смещение копии — шаг сетки (DUPLICATE_OFFSET в сторе). */
const OFFSET = 24;

beforeEach(() => {
  useBoardStore.setState({
    document: doc([shape('a', 0, 0), shape('b', 200, 0), shape('c', 1000, 1000)]),
    selection: [],
  });
});

describe('duplicateNodes', () => {
  it('делает копию с новым id, не трогая оригинал', () => {
    const [copyId] = board().duplicateNodes(['a']);

    expect(copyId).toBeDefined();
    expect(copyId).not.toBe('a');
    expect(nodeAt('a')).toMatchObject({ x: 0, y: 0 });
    expect(nodeAt(copyId as Id)).toMatchObject({ type: 'shape', shape: 'rect', width: 100 });
  });

  it('смещает копию, иначе она невидима под оригиналом', () => {
    const [copyId] = board().duplicateNodes(['a']);

    expect(nodeAt(copyId as Id)).toMatchObject({ x: OFFSET, y: OFFSET });
  });

  it('копия попадает и в nodes, и в order — инвариант 1', () => {
    const [copyId] = board().duplicateNodes(['a']);

    expect(nodeAt(copyId as Id)).toBeDefined();
    expect(document().order).toContain(copyId);
    // В конец order: копия ложится поверх оригинала.
    expect(document().order.at(-1)).toBe(copyId);
    expect(validateDocument(document())).toEqual([]);
  });

  it('выделение переезжает на копии', () => {
    const created = board().duplicateNodes(['a', 'b']);

    expect(created).toHaveLength(2);
    expect(board().selection).toEqual(created);
  });

  it('дублировать нечего — пустой результат, документ не меняется', () => {
    const before = document().order.length;

    expect(board().duplicateNodes([])).toEqual([]);
    expect(board().duplicateNodes(['нет такого'])).toEqual([]);
    expect(document().order).toHaveLength(before);
  });

  it('вложенные поля копируются, а не разделяются с оригиналом', () => {
    board().updateNode('a', {
      label: { value: 'раз', fontSize: 14, color: '#000', align: 'left' },
    });
    const [copyId] = board().duplicateNodes(['a']);

    board().updateNode(copyId as Id, {
      label: { value: 'два', fontSize: 14, color: '#000', align: 'left' },
    });

    expect(nodeAt('a')).toMatchObject({ label: { value: 'раз' } });
  });
});

describe('duplicateNodes — группы', () => {
  it('копия группы уносит содержимое и перевязывает связи на копии', () => {
    const groupId = board().group(['a', 'b']) as Id;
    const created = board().duplicateNodes([groupId]);

    const groupCopyId = created[0] as Id;
    const groupCopy = nodeAt(groupCopyId) as GroupNode;

    expect(groupCopy.type).toBe('group');
    expect(groupCopy.children).toHaveLength(2);
    // Ни одной ссылки на оригинал: дети копии — это копии детей.
    expect(groupCopy.children).not.toContain('a');
    expect(groupCopy.children).not.toContain('b');
    expect(groupCopy.children.every((id) => created.includes(id))).toBe(true);

    for (const childId of groupCopy.children) {
      expect(nodeAt(childId)).toMatchObject({ groupId: groupCopyId });
    }
    // Оригинальная группа не приобрела чужих детей.
    expect((nodeAt(groupId) as GroupNode).children).toEqual(['a', 'b']);
  });

  it('рамка копии группы смещена вслед за содержимым', () => {
    const groupId = board().group(['a', 'b']) as Id;
    const [groupCopyId] = board().duplicateNodes([groupId]);

    expect(nodeAt(groupCopyId as Id)).toMatchObject({
      x: OFFSET,
      y: OFFSET,
      width: 300,
      height: 60,
    });
  });

  it('копия участника группы выходит из группы, а не подселяется в неё', () => {
    const groupId = board().group(['a', 'b']) as Id;

    // Дублируется только ребёнок: группа в набор не попала.
    const [copyId] = board().duplicateNodes(['a']);

    // Иначе связь была бы односторонней: у копии groupId есть,
    // а в children оригинальной группы её нет.
    expect(nodeAt(copyId as Id)).not.toHaveProperty('groupId');
    expect((nodeAt(groupId) as GroupNode).children).toEqual(['a', 'b']);
  });

  it('документ после дублирования группы остаётся валидным', () => {
    const groupId = board().group(['a', 'b']) as Id;
    board().duplicateNodes([groupId]);

    expect(validateDocument(document())).toEqual([]);
  });
});

describe('duplicateNodes — коннекторы', () => {
  beforeEach(() => {
    useBoardStore.setState({
      document: doc([shape('a', 0, 0), shape('b', 200, 0), connector('l', 'a', 'b')]),
      selection: [],
    });
  });

  it('скопированы обе фигуры — концы копии смотрят на копии', () => {
    const created = board().duplicateNodes(['a', 'b', 'l']);
    const copyOf = (id: Id) => created[['a', 'b', 'l'].indexOf(id)] as Id;

    const line = nodeAt(copyOf('l')) as ConnectorNode;

    expect(line.from).toEqual({ nodeId: copyOf('a'), anchor: 'auto' });
    expect(line.to).toEqual({ nodeId: copyOf('b'), anchor: 'auto' });
    expect(validateDocument(document())).toEqual([]);
  });

  it('скопирован один конец — второй отвязывается в точку со смещением', () => {
    // Копия, оставшаяся привязанной к оригиналу, легла бы на исходную линию
    // и таскала бы за собой чужую фигуру.
    const created = board().duplicateNodes(['a', 'l']);
    const [copyA, copyL] = created as [Id, Id];

    const line = nodeAt(copyL) as ConnectorNode;

    expect(line.from).toEqual({ nodeId: copyA, anchor: 'auto' });
    expect(line.to.nodeId).toBeUndefined();
    // b: 200..300 по x, 0..60 по y; конец «to» был на её левой стороне.
    expect(line.to.point).toEqual({ x: 200 + OFFSET, y: 30 + OFFSET });
    expect(validateDocument(document())).toEqual([]);
  });

  it('свободный конец едет вместе с копией', () => {
    board().reattachEndpoint('l', 'to', { point: { x: 500, y: 500 } });

    const [copyL] = board().duplicateNodes(['l']);
    const line = nodeAt(copyL as Id) as ConnectorNode;

    expect(line.to.point).toEqual({ x: 500 + OFFSET, y: 500 + OFFSET });
  });

  it('копии линии не приписывается groupId — инвариант 2', () => {
    board().group(['a', 'b']);
    board().duplicateNodes(['a', 'b', 'l']);

    expect(validateDocument(document())).toEqual([]);
    for (const node of Object.values(document().nodes)) {
      if (node.type === 'connector') expect(node).not.toHaveProperty('groupId');
    }
  });
});

describe('duplicateNodes — замок', () => {
  it('заблокированный узел дублируется, замок уезжает в копию', () => {
    board().updateNode('a', { locked: true });

    const [copyId] = board().duplicateNodes(['a']);

    expect(nodeAt(copyId as Id)).toMatchObject({ locked: true, x: OFFSET });
  });
});
