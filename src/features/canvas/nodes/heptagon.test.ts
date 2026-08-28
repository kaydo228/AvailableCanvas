/**
 * Семиугольник — седьмая форма из FR-03.
 *
 * Ради него отрисовка многоугольников переехала на общий генератор
 * правильной фигуры, поэтому здесь же проверяется, что шестиугольник от
 * этого не сдвинулся ни на пиксель: у нечётного числа сторон нет ни одной
 * из симметрий, на которые опирались его собственные тесты, и подогнать
 * генератор «под семиугольник» было бы легко, не заметив шестого.
 */

import { describe, expect, test } from 'vitest';

import { shapeFromDrag } from '@/features/canvas/tools/shapeTool';
import { parseBoardFile } from '@/features/export/lib/fileFormat';
import { doc, shape } from '@/shared/model/fixtures';
import { validateDocument } from '@/shared/model/invariants';
import type { ShapeNode } from '@/shared/types/document';
import { polygonPoints } from './ShapeView';

const vertices = (points: number[]): Array<[number, number]> => {
  const result: Array<[number, number]> = [];
  for (let i = 0; i < points.length; i += 2) {
    result.push([points[i] as number, points[i + 1] as number]);
  }
  return result;
};

describe('геометрия семиугольника', () => {
  test('семь вершин', () => {
    expect(vertices(polygonPoints('heptagon', 100, 100))).toHaveLength(7);
  });

  test('заполняет рамку по обеим осям, а не болтается внутри неё', () => {
    // Ради этого генератор растягивает bounding box многоугольника на рамку.
    // При простом вписывании в эллипс семиугольник не достаёт до правого
    // края: вершины ровно на «три часа» у него нет.
    const points = vertices(polygonPoints('heptagon', 200, 140));
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);

    expect(Math.min(...xs)).toBeCloseTo(0, 5);
    expect(Math.max(...xs)).toBeCloseTo(200, 5);
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
    expect(Math.max(...ys)).toBeCloseTo(140, 5);
  });

  test('острый верх: ровно одна вершина на верхней кромке', () => {
    const points = vertices(polygonPoints('heptagon', 200, 140));

    expect(points.filter(([, y]) => y < 0.001)).toHaveLength(1);
  });

  test('симметричен по вертикальной оси', () => {
    const width = 210;
    const points = vertices(polygonPoints('heptagon', width, 140));

    for (const [x, y] of points) {
      const mirrored = points.some(
        ([mx, my]) => Math.abs(mx - (width - x)) < 0.001 && Math.abs(my - y) < 0.001,
      );
      expect(mirrored).toBe(true);
    }
  });

  test('масштабируется вместе с рамкой', () => {
    const small = polygonPoints('heptagon', 100, 70);
    const big = polygonPoints('heptagon', 200, 140);

    for (const [i, value] of small.entries()) {
      expect(big[i] as number).toBeCloseTo(value * 2, 4);
    }
  });

  test('вырожденная рамка не даёт NaN', () => {
    expect(polygonPoints('heptagon', 0, 0).every(Number.isFinite)).toBe(true);
  });
});

describe('шестиугольник не пострадал от общего генератора', () => {
  test('точки те же, что были заданы вручную', () => {
    expect(polygonPoints('hexagon', 200, 100)).toEqual([
      200, 50, 150, 100, 50, 100, 0, 50, 50, 0, 150, 0,
    ]);
  });

  test('треугольник и ромб по-прежнему заданы явно', () => {
    expect(vertices(polygonPoints('triangle', 100, 100))).toHaveLength(3);
    expect(vertices(polygonPoints('diamond', 100, 100))).toHaveLength(4);
  });
});

describe('круг экспорт → импорт', () => {
  const fileWith = (node: ShapeNode) => ({
    format: 'prostor-board',
    version: 1,
    name: 'С семиугольником',
    savedAt: 1_700_000_000_000,
    document: doc([node]),
    images: {},
  });

  test('файл с семиугольником открывается обратно', () => {
    const node: ShapeNode = { ...shape('h', 10, 20), shape: 'heptagon' };
    const file = parseBoardFile(JSON.stringify(fileWith(node)));

    expect(file.document.nodes.h).toMatchObject({ type: 'shape', shape: 'heptagon' });
  });
});

describe('инструмент', () => {
  test('протяжка справа налево и снизу вверх нормализуется', () => {
    const node = shapeFromDrag({ x: 420, y: 300 }, { x: 250, y: 190 }, 'heptagon', false, 1);

    expect(node).toMatchObject({ shape: 'heptagon', x: 250, y: 190, width: 170, height: 110 });
  });

  test('одиночный клик даёт размер по умолчанию и центрирует узел по точке', () => {
    const node = shapeFromDrag({ x: 300, y: 300 }, { x: 300, y: 300 }, 'heptagon', false, 1);

    expect(node).toMatchObject({ shape: 'heptagon', width: 160, height: 100, x: 220, y: 250 });
  });

  test('Shift при протяжке держит квадратную рамку', () => {
    const node = shapeFromDrag({ x: 100, y: 100 }, { x: 300, y: 250 }, 'heptagon', true, 1);

    expect(node?.width).toBe(node?.height);
  });
});

describe('инварианты модели', () => {
  test('семиугольник не даёт нарушений', () => {
    expect(validateDocument(doc([{ ...shape('h'), shape: 'heptagon' }]))).toEqual([]);
  });
});
