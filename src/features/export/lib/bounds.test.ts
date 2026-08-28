import { expect, test } from 'vitest';

import { connector, doc, shape } from '@/shared/model/fixtures';
import type { ConnectorNode } from '@/shared/types/document';
import { boundsOf } from './bounds';

test('рамка охватывает все узлы, а не видимую область', () => {
  const document = doc([shape('a', 0, 0), shape('b', 900, 500)]);

  // Камера смотрит совсем в другое место — на габариты это влиять не должно.
  document.viewport = { x: -4000, y: -4000, zoom: 3 };

  expect(boundsOf(document, document.order, 0)).toEqual({
    x: 0,
    y: 0,
    width: 1000, // 900 + ширина фигуры 100
    height: 560, // 500 + высота фигуры 60
  });
});

test('повёрнутый узел не вылезает за рамку', () => {
  const rotated = { ...shape('a', 0, 0), rotation: 90 };
  const document = doc([rotated]);

  const box = boundsOf(document, ['a'], 0);

  // Поворот на 90° вокруг левого верхнего угла: ширина и высота меняются местами,
  // узел уезжает влево. Синус 90° в double даёт хвост, отсюда closeTo.
  expect(box?.x).toBeCloseTo(-60);
  expect(box?.y).toBeCloseTo(0);
  expect(box?.width).toBeCloseTo(60);
  expect(box?.height).toBeCloseTo(100);
});

test('свободный конец коннектора учитывается, привязанный — нет', () => {
  const line: ConnectorNode = {
    ...connector('c', 'a', 'a'),
    from: { nodeId: 'a', anchor: 'auto' },
    to: { point: { x: 400, y: 300 } },
  };
  const document = doc([shape('a', 0, 0), line]);

  expect(boundsOf(document, document.order, 0)).toEqual({
    x: 0,
    y: 0,
    width: 400,
    height: 300,
  });
});

test('рамка учитывает изгиб кривого соединителя, а не только его концы', () => {
  const line: ConnectorNode = {
    ...connector('c', 'a', 'b'),
    routing: 'curve',
    from: { nodeId: 'a', anchor: 'top' },
    to: { nodeId: 'b', anchor: 'top' },
  };
  const document = doc([shape('a', 0, 0), shape('b', 300, 0), line]);
  expect(boundsOf(document, ['c'], 0)?.y).toBeLessThan(0);
});

test('пустое выделение — считать нечего', () => {
  expect(boundsOf(doc([shape('a')]), [])).toBeNull();
});
