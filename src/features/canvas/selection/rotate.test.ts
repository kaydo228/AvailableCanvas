/**
 * Поворот узла: приведение угла и поворот группы вместе с содержимым.
 *
 * Проверяется то, что ломается молча: угол, уехавший в модель как «370»
 * или как NaN, выглядит одинаково — узел просто не там, где ждали, а во
 * втором случае не рисуется вовсе. И поворот группы, оставивший состав
 * на месте, читается как «группы просто нет».
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { connector, doc, shape } from '@/shared/model/fixtures';
import { validateDocument } from '@/shared/model/invariants';
import { useBoardStore } from '@/shared/store/board';
import type { BoardDocument, BoxNode, GroupNode, Id } from '@/shared/types/document';
import { FULL_TURN, normalizeAngle, rotatePoint } from './rotate';

const board = () => useBoardStore.getState();
const nodeAt = (id: Id) => board().document?.nodes[id];
const boxAt = (id: Id) => nodeAt(id) as BoxNode;

/** Две фигуры рядом: a — 0..100, b — 200..300 по x, обе 0..60 по y. */
const twoShapes = (): BoardDocument => doc([shape('a', 0, 0), shape('b', 200, 0)]);

/** Углы сравниваются приблизительно: cos 90° в плавающей точке не ноль. */
const expectPoint = (node: BoxNode, x: number, y: number): void => {
  expect(node.x).toBeCloseTo(x, 6);
  expect(node.y).toBeCloseTo(y, 6);
};

beforeEach(() => {
  useBoardStore.setState({ document: twoShapes(), selection: [] });
});

describe('normalizeAngle', () => {
  it('370° и −10° — один и тот же поворот', () => {
    expect(normalizeAngle(370)).toBe(10);
    expect(normalizeAngle(-10)).toBe(350);
  });

  it('полный оборот — это ноль, а не 360', () => {
    expect(normalizeAngle(FULL_TURN)).toBe(0);
    expect(normalizeAngle(-FULL_TURN)).toBe(0);
    expect(normalizeAngle(3 * FULL_TURN + 45)).toBe(45);
  });

  it('минус-ноль приводится к нулю — иначе Object.is врёт при сравнении', () => {
    expect(Object.is(normalizeAngle(-0), 0)).toBe(true);
    expect(Object.is(normalizeAngle(-FULL_TURN), 0)).toBe(true);
  });

  it('нечисловой угол становится нулём, а не уезжает в модель', () => {
    expect(normalizeAngle(Number.NaN)).toBe(0);
    expect(normalizeAngle(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeAngle(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('rotatePoint', () => {
  it('вращает вокруг центра, а не вокруг начала координат', () => {
    const turned = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    expect(turned.x).toBeCloseTo(0, 6);
    expect(turned.y).toBeCloseTo(10, 6);
  });

  it('центр остаётся на месте', () => {
    const center = { x: 5, y: 7 };
    const turned = rotatePoint(center, center, 123);
    expect(turned.x).toBeCloseTo(5, 6);
    expect(turned.y).toBeCloseTo(7, 6);
  });
});

describe('rotateNode — одиночный узел', () => {
  it('ставит абсолютный угол, а не докручивает на дельту', () => {
    board().rotateNode('a', 30);
    board().rotateNode('a', 30);

    expect(boxAt('a').rotation).toBe(30);
  });

  it('угол приводится к [0, 360)', () => {
    board().rotateNode('a', 370);
    expect(boxAt('a').rotation).toBe(10);

    board().rotateNode('a', -10);
    expect(boxAt('a').rotation).toBe(350);
  });

  it('нечисловой угол не попадает в модель', () => {
    board().rotateNode('a', 45);
    board().rotateNode('a', Number.NaN);

    expect(boxAt('a').rotation).toBe(0);
    expect(Number.isFinite(boxAt('a').rotation)).toBe(true);

    board().rotateNode('a', Number.POSITIVE_INFINITY);
    expect(boxAt('a').rotation).toBe(0);
  });

  it('поворот не двигает узел с места', () => {
    board().rotateNode('b', 90);
    expectPoint(boxAt('b'), 200, 0);
  });

  it('несуществующий узел — не ошибка', () => {
    expect(() => board().rotateNode('нет', 90)).not.toThrow();
    expect(validateDocument(board().document as BoardDocument)).toEqual([]);
  });

  it('угол из патча инспектора нормализуется тоже', () => {
    // updateNode зовут панель свойств и инструменты — мимо rotateNode.
    board().updateNode('a', { rotation: 400 });
    expect(boxAt('a').rotation).toBe(40);

    board().updateNode('a', { rotation: Number.NaN });
    expect(boxAt('a').rotation).toBe(0);
  });
});

describe('rotateNode — коннектор', () => {
  beforeEach(() => {
    useBoardStore.setState({
      document: doc([shape('a', 0, 0), shape('b', 200, 0), connector('c', 'a', 'b')]),
    });
  });

  it('линию поворачивать нечем — вызов ничего не ломает', () => {
    expect(() => board().rotateNode('c', 90)).not.toThrow();

    const line = nodeAt('c');
    expect(line?.type).toBe('connector');
    // Поля rotation у коннектора нет, и заводить его нельзя: у линии
    // нет рамки, вращать вокруг чего — неизвестно.
    expect(line).not.toHaveProperty('rotation');
    expect(validateDocument(board().document as BoardDocument)).toEqual([]);
  });

  it('поворот фигуры не трогает привязанные концы', () => {
    board().rotateNode('a', 45);

    expect(nodeAt('c')).toMatchObject({ from: { nodeId: 'a' }, to: { nodeId: 'b' } });
    expect(validateDocument(board().document as BoardDocument)).toEqual([]);
  });
});

describe('rotateNode — группа', () => {
  let groupId: Id;

  beforeEach(() => {
    groupId = board().group(['a', 'b']) as Id;
  });

  it('крутит содержимое вокруг центра рамки, а не каждый узел вокруг себя', () => {
    // Рамка 0..300 × 0..60, центр (150, 30). Поворот на 90° ставит пару
    // вертикально: обе фигуры оказываются на одной вертикали x = 180.
    board().rotateNode(groupId, 90);

    expectPoint(boxAt('a'), 180, -120);
    expectPoint(boxAt('b'), 180, 80);
    expect(boxAt('a').rotation).toBe(90);
    expect(boxAt('b').rotation).toBe(90);
  });

  it('группа помнит свой угол, поэтому повтор ничего не докручивает', () => {
    board().rotateNode(groupId, 30);
    const after = { x: boxAt('a').x, y: boxAt('a').y };

    // Так это приходит от трансформера: один и тот же угол на каждом кадре.
    board().rotateNode(groupId, 30);
    board().rotateNode(groupId, 30);

    expect(boxAt(groupId).rotation).toBe(30);
    expect(boxAt('a').rotation).toBe(30);
    expectPoint(boxAt('a'), after.x, after.y);
  });

  it('возврат угла возвращает состав на место', () => {
    board().rotateNode(groupId, 90);
    board().rotateNode(groupId, 0);

    expectPoint(boxAt('a'), 0, 0);
    expectPoint(boxAt('b'), 200, 0);
    expect(boxAt('a').rotation).toBe(0);
  });

  it('рамка группы охватывает повёрнутое содержимое', () => {
    board().rotateNode(groupId, 90);

    // Пара 300×60 встала вертикально: рамка 60×300 вокруг того же центра.
    const group = boxAt(groupId);
    expect(group.x).toBeCloseTo(120, 6);
    expect(group.y).toBeCloseTo(-120, 6);
    expect(group.width).toBeCloseTo(60, 6);
    expect(group.height).toBeCloseTo(300, 6);
  });

  it('нечисловой угол группы не двигает состав', () => {
    board().rotateNode(groupId, Number.NaN);

    expect(boxAt(groupId).rotation).toBe(0);
    expectPoint(boxAt('a'), 0, 0);
    expectPoint(boxAt('b'), 200, 0);
  });

  it('поворот доходит до листьев вложенной группы', () => {
    useBoardStore.setState({ document: twoShapes(), selection: [] });
    const inner = board().group(['a', 'b']) as Id;
    board().addNode(shape('c', 1000, 1000));
    const outer = board().group([inner, 'c']) as Id;

    board().rotateNode(outer, 90);

    // Внутренняя группа тоже помнит поворот: иначе её собственный угол
    // отстанет от содержимого и следующий поворот уедет.
    expect(boxAt(inner).rotation).toBe(90);
    expect(boxAt('a').rotation).toBe(90);
    expect(boxAt('b').rotation).toBe(90);
    expect(boxAt('c').rotation).toBe(90);
    // Состав действительно уехал, а не только сменил угол.
    expect(boxAt('c').x).not.toBeCloseTo(1000, 6);
  });

  it('коннектор внутри выделения группы поворот переживает', () => {
    board().addNode(connector('c', 'a', 'b'));

    expect(() => board().rotateNode(groupId, 45)).not.toThrow();
    expect(nodeAt('c')).not.toHaveProperty('rotation');
    expect(validateDocument(board().document as BoardDocument)).toEqual([]);
  });

  it('документ после поворота остаётся валидным', () => {
    board().rotateNode(groupId, 137);

    const document = board().document as BoardDocument;
    expect(validateDocument(document)).toEqual([]);
    // Инвариант 1: поворот не заводит и не теряет узлов.
    expect(document.order).toEqual(expect.arrayContaining(['a', 'b', groupId]));
    expect((nodeAt(groupId) as GroupNode).children).toEqual(['a', 'b']);
  });
});
