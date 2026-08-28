/**
 * Действие `resizeNode` в сторе.
 *
 * Проверяется то, что ломается молча: рамка, вывернутая в NaN, уезжает
 * в IndexedDB и возвращается уже битой; растянутая группа без растянутого
 * содержимого выглядит как «группы просто нет»; коннектор рамки не имеет
 * вовсе, и попытка задать её ему — исключение посреди выделения.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { connector, doc, shape } from '@/shared/model/fixtures';
import { validateDocument } from '@/shared/model/invariants';
import { useBoardStore } from '@/shared/store/board';
import type { BoardDocument, GroupNode, Id } from '@/shared/types/document';
import { MIN_NODE_SIDE } from './resize';

const board = () => useBoardStore.getState();
const nodeAt = (id: Id) => board().document?.nodes[id];
const document = () => board().document as BoardDocument;

/** Три фигуры 100×60: a и b рядом, c далеко в стороне. */
const threeShapes = (): BoardDocument =>
  doc([shape('a', 0, 0), shape('b', 200, 0), shape('c', 1000, 1000)]);

beforeEach(() => {
  useBoardStore.setState({ document: threeShapes(), selection: [] });
});

describe('resizeNode', () => {
  it('пишет рамку в узел как есть', () => {
    board().resizeNode('a', { x: 10, y: 20, width: 300, height: 150 });

    expect(nodeAt('a')).toMatchObject({ x: 10, y: 20, width: 300, height: 150 });
    expect(validateDocument(document())).toEqual([]);
  });

  it('зажимает минимальный размер — меньше узел не поймать мышью', () => {
    board().resizeNode('a', { x: 0, y: 0, width: 1, height: 0 });

    expect(nodeAt('a')).toMatchObject({ width: MIN_NODE_SIDE, height: MIN_NODE_SIDE });
  });

  it('вывернутая наизнанку рамка сводится к минимальной, а не к отрицательной', () => {
    board().resizeNode('a', { x: 0, y: 0, width: -100, height: -60 });

    expect(nodeAt('a')).toMatchObject({ width: MIN_NODE_SIDE, height: MIN_NODE_SIDE });
  });

  it('NaN и Infinity в модель не попадают — поле остаётся прежним', () => {
    board().resizeNode('a', { x: Number.NaN, y: 0, width: 200, height: Number.POSITIVE_INFINITY });

    // x и height были 0 и 60 — их и оставили; остальное применилось.
    expect(nodeAt('a')).toMatchObject({ x: 0, y: 0, width: 200, height: 60 });
  });

  it('несуществующий узел — не исключение', () => {
    expect(() =>
      board().resizeNode('нет-такого', { x: 0, y: 0, width: 10, height: 10 }),
    ).not.toThrow();
  });

  it('рамка группы-родителя едет за участником', () => {
    const groupId = board().group(['a', 'b']) as Id;

    board().resizeNode('b', { x: 200, y: 0, width: 300, height: 60 });

    // b теперь 200..500 по x, значит и группа 0..500.
    expect(nodeAt(groupId)).toMatchObject({ x: 0, y: 0, width: 500, height: 60 });
  });
});

describe('resizeNode на группе', () => {
  it('масштабирует и переставляет содержимое пропорционально', () => {
    const groupId = board().group(['a', 'b']) as Id;
    // Рамка группы: 0..300 по x, 0..60 по y.

    board().resizeNode(groupId, { x: 0, y: 0, width: 600, height: 120 });

    // Двойной масштаб: размеры вдвое, и промежуток между a и b тоже вдвое —
    // иначе фигуры выросли бы, а состав разъехался относительно рамки.
    expect(nodeAt('a')).toMatchObject({ x: 0, y: 0, width: 200, height: 120 });
    expect(nodeAt('b')).toMatchObject({ x: 400, y: 0, width: 200, height: 120 });
    expect(nodeAt(groupId)).toMatchObject({ x: 0, y: 0, width: 600, height: 120 });
    expect(validateDocument(document())).toEqual([]);
  });

  it('переезд группы без изменения размера двигает содержимое', () => {
    const groupId = board().group(['a', 'b']) as Id;

    board().resizeNode(groupId, { x: 100, y: 50, width: 300, height: 60 });

    expect(nodeAt('a')).toMatchObject({ x: 100, y: 50, width: 100, height: 60 });
    expect(nodeAt('b')).toMatchObject({ x: 300, y: 50, width: 100, height: 60 });
  });

  it('вложенная группа масштабируется вместе со всем деревом', () => {
    const inner = board().group(['a', 'b']) as Id;
    const outer = board().group([inner, 'c']) as Id;
    // Внешняя рамка: 0..1100 по x, 0..1060 по y.
    expect(nodeAt(outer)).toMatchObject({ x: 0, y: 0, width: 1100, height: 1060 });

    board().resizeNode(outer, { x: 0, y: 0, width: 2200, height: 2120 });

    expect(nodeAt('a')).toMatchObject({ x: 0, y: 0, width: 200, height: 120 });
    expect(nodeAt('b')).toMatchObject({ x: 400, y: 0, width: 200, height: 120 });
    expect(nodeAt('c')).toMatchObject({ x: 2000, y: 2000, width: 200, height: 120 });
    // Рамка внутренней группы производная: её пересчитали по содержимому.
    expect(nodeAt(inner)).toMatchObject({ x: 0, y: 0, width: 600, height: 120 });
    expect(nodeAt(outer)).toMatchObject({ x: 0, y: 0, width: 2200, height: 2120 });
    expect(validateDocument(document())).toEqual([]);
  });

  it('содержимое не сжимается ниже минимальной стороны', () => {
    const groupId = board().group(['a', 'b']) as Id;

    board().resizeNode(groupId, { x: 0, y: 0, width: 3, height: 3 });

    const a = nodeAt('a') as { width: number; height: number };
    expect(a.width).toBeGreaterThanOrEqual(MIN_NODE_SIDE);
    expect(a.height).toBeGreaterThanOrEqual(MIN_NODE_SIDE);
  });

  it('сжатие до минимума и возврат сохраняют исходные пропорции', () => {
    const groupId = board().group(['a', 'b']) as Id;
    board().resizeNode(groupId, { x: 0, y: 0, width: 3, height: 3 });
    board().resizeNode(groupId, { x: 0, y: 0, width: 300, height: 60 });
    expect(nodeAt('a')).toMatchObject({ x: 0, y: 0, width: 100, height: 60 });
    expect(nodeAt('b')).toMatchObject({ x: 200, y: 0, width: 100, height: 60 });
  });

  it('повёрнутое содержимое масштабируется только пропорционально', () => {
    const groupId = board().group(['a', 'b']) as Id;
    board().rotateNode('a', 45);
    const before = nodeAt(groupId) as GroupNode;
    board().resizeNode(groupId, { x: before.x, y: before.y, width: 600, height: 60 });
    const after = nodeAt(groupId) as GroupNode;
    expect(after.width / after.height).toBeCloseTo(before.width / before.height);
  });
});

describe('публичные мутации', () => {
  it('updateNode не пропускает нечисловую и отрицательную геометрию', () => {
    board().updateNode('a', { x: Number.NaN, width: -1, height: Number.POSITIVE_INFINITY });
    expect(nodeAt('a')).toMatchObject({ x: 0, width: MIN_NODE_SIDE, height: 60 });
  });

  it('setViewport и panBy не пропускают нечисловые координаты и зум вне границ', () => {
    board().setViewport({ x: Number.NaN, y: Number.POSITIVE_INFINITY, zoom: 99 });
    board().panBy(Number.NaN, Number.NaN);
    expect(document().viewport).toEqual({ x: 0, y: 0, zoom: 4 });
  });

  it('удаление исходного узла убирает невидимый нулевой соединитель', () => {
    useBoardStore.setState({
      document: doc([shape('a', 0, 0), connector('loop', 'a', 'a')]),
      selection: [],
    });
    board().removeNodes(['a']);
    expect(nodeAt('loop')).toBeUndefined();
  });
});

describe('resizeNode и коннектор', () => {
  beforeEach(() => {
    useBoardStore.setState({
      document: doc([shape('a', 0, 0), shape('b', 200, 0), connector('line', 'a', 'b')]),
      selection: [],
    });
  });

  it('коннектору рамку не задать — тихий отказ, а не исключение', () => {
    expect(() => board().resizeNode('line', { x: 0, y: 0, width: 100, height: 100 })).not.toThrow();

    // Линия осталась линией: полей рамки у неё не появилось.
    expect(nodeAt('line')).not.toHaveProperty('width');
    expect(validateDocument(document())).toEqual([]);
  });

  it('растяжение фигуры не отвязывает висящую на ней линию', () => {
    board().resizeNode('a', { x: 0, y: 0, width: 400, height: 200 });

    // Инвариант 3: конец по-прежнему задан ровно одним способом — nodeId.
    expect(nodeAt('line')).toMatchObject({ from: { nodeId: 'a' }, to: { nodeId: 'b' } });
    expect(validateDocument(document())).toEqual([]);
  });

  it('коннектор внутри группы не мешает растянуть её содержимое', () => {
    const groupId = board().group(['a', 'b', 'line']) as Id;

    board().resizeNode(groupId, { x: 0, y: 0, width: 600, height: 120 });

    expect(nodeAt('a')).toMatchObject({ x: 0, y: 0, width: 200, height: 120 });
    expect(nodeAt('b')).toMatchObject({ x: 400, y: 0, width: 200, height: 120 });
    // Инвариант 2: коннектор в группу так и не попал.
    expect((nodeAt(groupId) as GroupNode).children).toEqual(['a', 'b']);
    expect(validateDocument(document())).toEqual([]);
  });
});
