import { describe, expect, it } from 'vitest';

import {
  bringForward,
  bringToFront,
  sendBackward,
  sendToBack,
} from '@/features/canvas/selection/layerOrder';

const order = ['a', 'b', 'c', 'd', 'e'];

describe('bringForward — на позицию вверх', () => {
  it('одиночный узел поднимается на одну позицию', () => {
    expect(bringForward(order, ['b'])).toEqual(['a', 'c', 'b', 'd', 'e']);
  });

  it('верхний узел остаётся на месте', () => {
    expect(bringForward(order, ['e'])).toEqual(order);
  });

  it('группа поднимается целиком, не перемешиваясь внутри себя', () => {
    expect(bringForward(order, ['b', 'c'])).toEqual(['a', 'd', 'b', 'c', 'e']);
  });

  it('группа, упёршаяся в потолок, не схлопывается', () => {
    // 'e' наверху и подняться не может; 'd' не должен его перепрыгнуть.
    expect(bringForward(order, ['d', 'e'])).toEqual(order);
  });

  it('несмежные узлы поднимаются каждый на свою позицию', () => {
    expect(bringForward(order, ['a', 'c'])).toEqual(['b', 'a', 'd', 'c', 'e']);
  });

  it('пустое выделение ничего не меняет', () => {
    expect(bringForward(order, [])).toEqual(order);
  });

  it('исходный массив не мутируется', () => {
    const source = [...order];
    bringForward(source, ['b']);
    expect(source).toEqual(order);
  });
});

describe('sendBackward — на позицию вниз', () => {
  it('одиночный узел опускается на одну позицию', () => {
    expect(sendBackward(order, ['c'])).toEqual(['a', 'c', 'b', 'd', 'e']);
  });

  it('нижний узел остаётся на месте', () => {
    expect(sendBackward(order, ['a'])).toEqual(order);
  });

  it('группа опускается целиком', () => {
    expect(sendBackward(order, ['c', 'd'])).toEqual(['a', 'c', 'd', 'b', 'e']);
  });

  it('группа, упёршаяся в пол, не схлопывается', () => {
    expect(sendBackward(order, ['a', 'b'])).toEqual(order);
  });
});

describe('bringToFront и sendToBack', () => {
  it('наверх, взаимный порядок сохраняется', () => {
    expect(bringToFront(order, ['b', 'd'])).toEqual(['a', 'c', 'e', 'b', 'd']);
  });

  it('вниз, взаимный порядок сохраняется', () => {
    expect(sendToBack(order, ['b', 'd'])).toEqual(['b', 'd', 'a', 'c', 'e']);
  });

  it('всё выделено — порядок не меняется', () => {
    expect(bringToFront(order, order)).toEqual(order);
    expect(sendToBack(order, order)).toEqual(order);
  });

  it('идентификаторы не теряются и не дублируются', () => {
    for (const fn of [bringForward, sendBackward, bringToFront, sendToBack]) {
      const result = fn(order, ['b', 'd']);
      expect([...result].sort()).toEqual([...order].sort());
      expect(new Set(result).size).toBe(order.length);
    }
  });

  it('неизвестный идентификатор в выделении не ломает порядок', () => {
    expect(bringToFront(order, ['призрак'])).toEqual(order);
  });
});
