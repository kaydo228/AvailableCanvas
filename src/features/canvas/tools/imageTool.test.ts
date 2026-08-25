import { describe, expect, it } from 'vitest';

import {
  aspectOf,
  createImageNode,
  fitIntoSide,
  MAX_INSERT_SIDE,
} from '@/features/canvas/tools/imageTool';
import { doc } from '@/shared/model/fixtures';

const stored = (naturalWidth: number, naturalHeight: number) => ({
  blobId: 'blob-1',
  naturalWidth,
  naturalHeight,
});

describe('fitIntoSide — вписывание с сохранением пропорций', () => {
  it('горизонтальная фотография вписывается по ширине', () => {
    const size = fitIntoSide({ width: 4000, height: 3000 });

    expect(size.width).toBe(MAX_INSERT_SIDE);
    expect(size.height).toBe(450);
  });

  it('вертикальная — по высоте', () => {
    const size = fitIntoSide({ width: 3000, height: 4000 });

    expect(size.height).toBe(MAX_INSERT_SIDE);
    expect(size.width).toBe(450);
  });

  it('пропорции сохраняются при любом входе', () => {
    for (const [w, h] of [
      [4000, 3000],
      [1000, 250],
      [800, 800],
      [123, 4567],
    ]) {
      const size = fitIntoSide({ width: w as number, height: h as number });
      expect(size.width / size.height).toBeCloseTo((w as number) / (h as number), 6);
    }
  });

  it('больший бок никогда не превышает предел', () => {
    for (const [w, h] of [
      [8000, 100],
      [100, 8000],
      [601, 601],
      [5, 5],
    ]) {
      const size = fitIntoSide({ width: w as number, height: h as number });
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(MAX_INSERT_SIDE);
    }
  });

  it('маленькая картинка НЕ растягивается — иначе станет мыльной', () => {
    const size = fitIntoSide({ width: 120, height: 80 });

    expect(size.width).toBe(120);
    expect(size.height).toBe(80);
  });

  it('ровно на пределе остаётся как есть', () => {
    const size = fitIntoSide({ width: MAX_INSERT_SIDE, height: 300 });
    expect(size.width).toBe(MAX_INSERT_SIDE);
  });

  it('вырожденный размер не роняет расчёт', () => {
    for (const bad of [
      { width: 0, height: 0 },
      { width: -10, height: 5 },
    ]) {
      const size = fitIntoSide(bad);
      expect(Number.isFinite(size.width)).toBe(true);
      expect(size.width).toBeGreaterThan(0);
    }
  });
});

describe('createImageNode', () => {
  it('центрируется по указанной точке', () => {
    const node = createImageNode(stored(4000, 3000), { x: 100, y: 100 });

    expect(node.x).toBe(100 - MAX_INSERT_SIDE / 2);
    expect(node.y).toBe(100 - 450 / 2);
  });

  it('в документе лежит идентификатор блоба, а не файл', () => {
    const node = createImageNode(stored(800, 600), { x: 0, y: 0 });

    expect(node.blobId).toBe('blob-1');
    expect(JSON.stringify(node)).not.toContain('data:');
    expect(JSON.stringify(node)).not.toContain('blob:');
  });

  it('натуральный размер сохраняется отдельно от размера на доске', () => {
    const node = createImageNode(stored(4000, 3000), { x: 0, y: 0 });

    expect(node.naturalWidth).toBe(4000);
    expect(node.naturalHeight).toBe(3000);
    expect(node.width).toBe(MAX_INSERT_SIDE);
  });

  it('узел валиден и попадает в nodes и order', () => {
    const node = createImageNode(stored(800, 600), { x: 0, y: 0 });
    const d = doc([node]);

    expect(node.type).toBe('image');
    expect(node.id).toBeTruthy();
    expect(d.nodes[node.id]).toBeDefined();
    expect(d.order).toContain(node.id);
  });

  it('идентификаторы уникальны', () => {
    const ids = new Set(
      Array.from({ length: 30 }, () => createImageNode(stored(10, 10), { x: 0, y: 0 }).id),
    );
    expect(ids.size).toBe(30);
  });
});

describe('aspectOf', () => {
  it('считается по натуральному размеру, а не по текущему', () => {
    const node = createImageNode(stored(4000, 2000), { x: 0, y: 0 });
    node.width = 10;
    node.height = 900;

    expect(aspectOf(node)).toBe(2);
  });

  it('нулевая высота не даёт деления на ноль', () => {
    const node = createImageNode(stored(100, 100), { x: 0, y: 0 });
    node.naturalHeight = 0;

    expect(Number.isFinite(aspectOf(node))).toBe(true);
  });
});
