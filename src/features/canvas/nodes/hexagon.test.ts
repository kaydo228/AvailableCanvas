/**
 * Шестиугольник — шестая форма из FR-03.
 *
 * Проверяется то, что ломается молча. Геометрия: кривой многоугольник видно
 * глазом, но не в тестах остального приложения. И круг «экспорт → импорт»:
 * список форм повторён в zod-схеме файла, и стоит забыть там одну строчку,
 * как доска с шестиугольником экспортируется, а обратно уже не открывается.
 */

import { describe, expect, test } from 'vitest';

import { shapeFromDrag } from '@/features/canvas/tools/shapeTool';
import { parseBoardFile } from '@/features/export/lib/fileFormat';
import { doc, shape } from '@/shared/model/fixtures';
import { validateDocument } from '@/shared/model/invariants';
import type { ShapeNode } from '@/shared/types/document';
import { polygonPoints } from './ShapeView';

/** Плоский список Konva `[x1,y1,x2,y2,…]` в пары — сравнивать по вершинам. */
const vertices = (points: number[]): Array<[number, number]> => {
  const result: Array<[number, number]> = [];
  for (let i = 0; i < points.length; i += 2) {
    result.push([points[i] as number, points[i + 1] as number]);
  }
  return result;
};

describe('геометрия шестиугольника', () => {
  test('шесть вершин, а не пять и не семь', () => {
    expect(vertices(polygonPoints('hexagon', 100, 100))).toHaveLength(6);
  });

  test('flat-top: две горизонтальные стороны — сверху и снизу', () => {
    const points = vertices(polygonPoints('hexagon', 200, 100));
    const top = points.filter(([, y]) => y === 0);
    const bottom = points.filter(([, y]) => y === 100);

    expect(top).toHaveLength(2);
    expect(bottom).toHaveLength(2);
    // Острые вершины — ровно по бокам, на половине высоты.
    expect(points.filter(([, y]) => y === 50)).toHaveLength(2);
  });

  test('вписан в рамку целиком и заполняет её по обеим осям', () => {
    const points = vertices(polygonPoints('hexagon', 200, 100));
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);

    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(200);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(100);
  });

  test('симметричен по вертикальной оси', () => {
    const width = 240;
    const points = vertices(polygonPoints('hexagon', width, 160));

    // Для каждой вершины есть зеркальная относительно середины ширины.
    for (const [x, y] of points) {
      expect(points).toContainEqual([width - x, y]);
    }
  });

  test('симметричен по горизонтальной оси', () => {
    const height = 160;
    const points = vertices(polygonPoints('hexagon', 240, height));

    for (const [x, y] of points) {
      expect(points).toContainEqual([x, height - y]);
    }
  });

  test('масштабируется вместе с рамкой, а не держит свои пропорции', () => {
    const small = polygonPoints('hexagon', 100, 50);
    const big = polygonPoints('hexagon', 200, 100);

    expect(big).toEqual(small.map((value) => value * 2));
  });

  test('вырожденная рамка не даёт NaN', () => {
    expect(polygonPoints('hexagon', 0, 0).every(Number.isFinite)).toBe(true);
  });

  test('остальные формы не задеты', () => {
    expect(vertices(polygonPoints('triangle', 100, 100))).toHaveLength(3);
    expect(vertices(polygonPoints('diamond', 100, 100))).toHaveLength(4);
  });
});

describe('круг экспорт → импорт', () => {
  const hexagonNode = (): ShapeNode => ({ ...shape('h', 10, 20), shape: 'hexagon' });

  const fileWith = (node: ShapeNode) => ({
    format: 'prostor-board',
    version: 1,
    name: 'С шестиугольником',
    savedAt: 1_700_000_000_000,
    document: doc([node]),
    images: {},
  });

  test('файл с шестиугольником открывается обратно', () => {
    const file = parseBoardFile(JSON.stringify(fileWith(hexagonNode())));

    expect(file.document.nodes.h).toMatchObject({ type: 'shape', shape: 'hexagon' });
  });

  test('форма, которой нет в модели, по-прежнему отвергается', () => {
    const bogus = { ...hexagonNode(), shape: 'октагон' } as unknown as ShapeNode;

    expect(() => parseBoardFile(JSON.stringify(fileWith(bogus)))).toThrow(
      /document\.nodes\.h\.shape/,
    );
  });
});

describe('инструмент', () => {
  // Три ловушки из скилла canvas-node-type: их не видно, пока не проверишь
  // числами, а выглядят они как «инструмент просто кривой».
  test('протяжка справа налево и снизу вверх нормализуется', () => {
    const node = shapeFromDrag({ x: 420, y: 300 }, { x: 250, y: 190 }, 'hexagon', false, 1);

    expect(node).toMatchObject({ shape: 'hexagon', x: 250, y: 190, width: 170, height: 110 });
  });

  test('одиночный клик даёт размер по умолчанию и центрирует узел по точке', () => {
    const node = shapeFromDrag({ x: 300, y: 300 }, { x: 300, y: 300 }, 'hexagon', false, 1);

    expect(node).toMatchObject({ shape: 'hexagon', width: 160, height: 100, x: 220, y: 250 });
  });

  test('Shift при протяжке держит квадратную рамку', () => {
    const node = shapeFromDrag({ x: 100, y: 100 }, { x: 300, y: 250 }, 'hexagon', true, 1);

    expect(node?.width).toBe(node?.height);
  });
});

describe('инварианты модели', () => {
  test('шестиугольник не даёт нарушений', () => {
    const document = doc([{ ...shape('h'), shape: 'hexagon' }]);

    expect(validateDocument(document)).toEqual([]);
  });
});
