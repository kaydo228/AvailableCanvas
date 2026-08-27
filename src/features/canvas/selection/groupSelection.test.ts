/**
 * Разворачивание выделения по группам и операции над составом.
 *
 * Проверяется то, что ломается молча: клик по участнику обязан выделять
 * группу целиком, а сдвиг группы — двигать её содержимое. И то и другое
 * выглядит как «группы просто нет», а причина неочевидна.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { connector, doc, shape } from '@/shared/model/fixtures';
import { validateDocument } from '@/shared/model/invariants';
import { groupBounds, topmostGroup, withGroupDescendants } from '@/shared/model/operations';
import { useBoardStore } from '@/shared/store/board';
import type { BoardDocument, GroupNode, Id } from '@/shared/types/document';
import { expandSelection, selectionForClick } from './groupSelection';

const board = () => useBoardStore.getState();

/** Документ из трёх фигур: a и b рядом, c далеко в стороне. */
const threeShapes = (): BoardDocument =>
  doc([shape('a', 0, 0), shape('b', 200, 0), shape('c', 1000, 1000)]);

beforeEach(() => {
  useBoardStore.setState({ document: threeShapes(), selection: [] });
});

const nodeAt = (id: Id) => board().document?.nodes[id];

describe('group', () => {
  it('собирает группу, ставит groupId и считает рамку по содержимому', () => {
    const groupId = board().group(['a', 'b']);
    expect(groupId).not.toBeNull();

    const group = nodeAt(groupId as Id) as GroupNode;
    expect(group.type).toBe('group');
    expect(group.children).toEqual(['a', 'b']);
    // a: 0..100, b: 200..300 по x; обе 0..60 по y.
    expect(group).toMatchObject({ x: 0, y: 0, width: 300, height: 60 });

    expect(nodeAt('a')).toMatchObject({ groupId });
    expect(nodeAt('b')).toMatchObject({ groupId });
    expect(nodeAt('c')).not.toHaveProperty('groupId');
  });

  it('узел попадает и в nodes, и в order — инвариант 1', () => {
    const groupId = board().group(['a', 'b']) as Id;
    const document = board().document as BoardDocument;

    expect(document.nodes[groupId]).toBeDefined();
    expect(document.order).toContain(groupId);
    expect(validateDocument(document)).toEqual([]);
  });

  it('коннектор в группу не берётся — инвариант 2', () => {
    useBoardStore.setState({
      document: doc([shape('a'), shape('b', 200, 0), connector('c', 'a', 'b')]),
    });

    const groupId = board().group(['a', 'b', 'c']) as Id;

    expect((nodeAt(groupId) as GroupNode).children).toEqual(['a', 'b']);
    expect(nodeAt('c')).not.toHaveProperty('groupId');
    expect(validateDocument(board().document as BoardDocument)).toEqual([]);
  });

  it('меньше двух участников группой не является', () => {
    expect(board().group(['a'])).toBeNull();
    expect(board().group([])).toBeNull();
  });

  it('группа внутри выделения входит целиком, а не разбирается', () => {
    const inner = board().group(['a', 'b']) as Id;
    const outer = board().group([inner, 'c']) as Id;

    expect((nodeAt(outer) as GroupNode).children).toEqual([inner, 'c']);
    // Внутренняя группа уцелела.
    expect((nodeAt(inner) as GroupNode).children).toEqual(['a', 'b']);
  });

  it('после сборки выделение то же, что даёт клик по участнику', () => {
    const groupId = board().group(['a', 'b']) as Id;
    const document = board().document as BoardDocument;

    // Группа плюс содержимое: одной группы мало, перетаскивание набора
    // ищет узлы в дереве Konva по id, а у рамки группы своего узла нет.
    expect(board().selection).toEqual([groupId, 'a', 'b']);
    expect(board().selection).toEqual(selectionForClick(document, 'a'));
  });
});

describe('ungroup', () => {
  it('распускает группу, узлы остаются на месте', () => {
    const groupId = board().group(['a', 'b']) as Id;
    const before = { ...(nodeAt('a') as { x: number; y: number }) };

    board().ungroup(groupId);

    expect(nodeAt(groupId)).toBeUndefined();
    expect(board().document?.order).not.toContain(groupId);
    expect(nodeAt('a')).not.toHaveProperty('groupId');
    expect(nodeAt('a')).toMatchObject({ x: before.x, y: before.y });
    expect(board().selection).toEqual(['a', 'b']);
  });

  it('содержимое вложенной группы переходит внешней, а не выпадает наружу', () => {
    const inner = board().group(['a', 'b']) as Id;
    const outer = board().group([inner, 'c']) as Id;

    board().ungroup(inner);

    expect(nodeAt('a')).toMatchObject({ groupId: outer });
    expect((nodeAt(outer) as GroupNode).children).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(validateDocument(board().document as BoardDocument)).toEqual([]);
  });
});

describe('moveNodes — то, ради чего всё затевалось', () => {
  it('сдвиг группы двигает её содержимое', () => {
    const groupId = board().group(['a', 'b']) as Id;

    board().moveNodes([groupId], 50, 20);

    expect(nodeAt('a')).toMatchObject({ x: 50, y: 20 });
    expect(nodeAt('b')).toMatchObject({ x: 250, y: 20 });
    expect(nodeAt(groupId)).toMatchObject({ x: 50, y: 20, width: 300, height: 60 });
  });

  it('группа и её ребёнок в одном выделении не двигают ребёнка дважды', () => {
    const groupId = board().group(['a', 'b']) as Id;

    // Так выглядит выделение после «Выделить всё».
    board().moveNodes([groupId, 'a', 'b'], 10, 0);

    expect(nodeAt('a')).toMatchObject({ x: 10 });
    expect(nodeAt('b')).toMatchObject({ x: 210 });
  });

  it('сдвиг одного участника пересчитывает рамку группы', () => {
    const groupId = board().group(['a', 'b']) as Id;

    board().moveNodes(['b'], 100, 0);

    // b уехал вправо — рамка расширилась вслед за ним.
    expect(nodeAt(groupId)).toMatchObject({ x: 0, width: 400 });
  });

  it('перетаскивание через updateNode тоже двигает рамку', () => {
    const groupId = board().group(['a', 'b']) as Id;

    board().updateNode('a', { x: -100 });

    expect(nodeAt(groupId)).toMatchObject({ x: -100, width: 400 });
  });
});

describe('removeNodes', () => {
  it('удаление группы уносит содержимое', () => {
    const groupId = board().group(['a', 'b']) as Id;

    board().removeNodes([groupId]);

    const document = board().document as BoardDocument;
    expect(Object.keys(document.nodes)).toEqual(['c']);
    expect(document.order).toEqual(['c']);
    expect(validateDocument(document)).toEqual([]);
  });

  it('удаление участника вычищает ссылку из группы', () => {
    const groupId = board().group(['a', 'b']) as Id;

    board().removeNodes(['b']);

    expect((nodeAt(groupId) as GroupNode).children).toEqual(['a']);
    expect(validateDocument(board().document as BoardDocument)).toEqual([]);
  });
});

describe('разворачивание выделения', () => {
  it('клик по участнику выделяет группу и всё её содержимое', () => {
    const groupId = board().group(['a', 'b']) as Id;
    const document = board().document as BoardDocument;

    expect(selectionForClick(document, 'a')).toEqual([groupId, 'a', 'b']);
  });

  it('клик по одиночному узлу выделяет только его', () => {
    const document = board().document as BoardDocument;
    expect(selectionForClick(document, 'c')).toEqual(['c']);
  });

  it('из вложенной группы выделяется верхняя', () => {
    const inner = board().group(['a', 'b']) as Id;
    const outer = board().group([inner, 'c']) as Id;
    const document = board().document as BoardDocument;

    expect(selectionForClick(document, 'a')[0]).toBe(outer);
  });

  it('рамка, задевшая участника, берёт группу целиком', () => {
    const groupId = board().group(['a', 'b']) as Id;
    const document = board().document as BoardDocument;

    expect(expandSelection(document, ['b'])).toEqual([groupId, 'a', 'b']);
  });
});

describe('устойчивость к битому документу', () => {
  it('группа, ссылающаяся сама на себя, не вешает обход', () => {
    const cycle: GroupNode = {
      id: 'g',
      type: 'group',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotation: 0,
      opacity: 1,
      locked: false,
      children: ['g'],
      groupId: 'g',
    };
    const document = doc([cycle]);

    expect(topmostGroup(document, 'g')).toBe('g');
    expect(withGroupDescendants(document, ['g'])).toEqual(['g']);
    expect(groupBounds(document, 'g')).toBeNull();
  });

  it('группа с несуществующими детьми не даёт рамку из бесконечностей', () => {
    const orphan: GroupNode = {
      id: 'g',
      type: 'group',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotation: 0,
      opacity: 1,
      locked: false,
      children: ['нет1', 'нет2'],
    };

    expect(groupBounds(doc([orphan]), 'g')).toBeNull();
  });
});
