import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD } from '@/features/canvas/tools/geometry';
import {
  createShapeNode,
  DEFAULT_SHAPE_SIZE,
  type ShapeKind,
  shapeFromDrag,
} from '@/features/canvas/tools/shapeTool';
import { doc } from '@/shared/model/fixtures';

/**
 * Инструмент «Фигура». Проверяем ровно то, на чём инструменты создания
 * ломаются чаще всего: знак размеров при обратной протяжке, Shift,
 * клик без протяжки — и что получившийся узел пригоден для документа.
 */

const ALL_SHAPES: ShapeKind[] = ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond'];

/** Заведомо больше порога клика при zoom = 1. */
const FAR = DRAG_THRESHOLD * 25;

describe('shapeFromDrag — направление протяжки', () => {
  it('слева направо и сверху вниз: рамка совпадает с жестом', () => {
    const node = shapeFromDrag({ x: 10, y: 20 }, { x: 210, y: 140 }, 'rect', false, 1);

    expect(node).toMatchObject({ x: 10, y: 20, width: 200, height: 120 });
  });

  it('справа налево размеры положительные, а угол уезжает влево', () => {
    const node = shapeFromDrag({ x: 210, y: 20 }, { x: 10, y: 140 }, 'rect', false, 1);

    expect(node.width).toBe(200);
    expect(node.height).toBe(120);
    expect(node.x).toBe(10);
    expect(node.y).toBe(20);
  });

  it('снизу вверх размеры положительные, а угол уезжает наверх', () => {
    const node = shapeFromDrag({ x: 10, y: 140 }, { x: 210, y: 20 }, 'rect', false, 1);

    expect(node.width).toBe(200);
    expect(node.height).toBe(120);
    expect(node.x).toBe(10);
    expect(node.y).toBe(20);
  });

  it('по диагонали в обратную сторону — обе стороны положительные', () => {
    const node = shapeFromDrag({ x: 300, y: 300 }, { x: 100, y: 100 }, 'ellipse', false, 1);

    expect(node.width).toBeGreaterThan(0);
    expect(node.height).toBeGreaterThan(0);
    expect(node).toMatchObject({ x: 100, y: 100, width: 200, height: 200 });
  });
});

describe('shapeFromDrag — Shift сохраняет пропорции', () => {
  it('квадрат по большей стороне', () => {
    const node = shapeFromDrag({ x: 0, y: 0 }, { x: 200, y: 60 }, 'rect', true, 1);

    expect(node.width).toBe(node.height);
    expect(node.width).toBe(200);
  });

  it('квадрат и при протяжке справа налево вверх', () => {
    const node = shapeFromDrag({ x: 200, y: 200 }, { x: 40, y: 150 }, 'rect', true, 1);

    expect(node.width).toBe(node.height);
    expect(node.width).toBe(160);
    // Тянули влево-вверх, значит рамка кончается в точке старта.
    expect(node.x).toBe(40);
    expect(node.y).toBe(40);
  });

  it('без Shift та же протяжка квадрата не даёт', () => {
    const node = shapeFromDrag({ x: 0, y: 0 }, { x: 200, y: 60 }, 'rect', false, 1);

    expect(node.width).not.toBe(node.height);
  });
});

describe('shapeFromDrag — клик без протяжки', () => {
  it('размер по умолчанию, центр в точке клика', () => {
    const node = shapeFromDrag({ x: 500, y: 400 }, { x: 500, y: 400 }, 'diamond', false, 1);

    expect(node.width).toBe(DEFAULT_SHAPE_SIZE.width);
    expect(node.height).toBe(DEFAULT_SHAPE_SIZE.height);
    expect(node.x + node.width / 2).toBe(500);
    expect(node.y + node.height / 2).toBe(400);
  });

  it('дрожание руки в пределах порога — всё ещё клик', () => {
    const node = shapeFromDrag({ x: 0, y: 0 }, { x: 2, y: 2 }, 'rect', false, 1);

    expect(node.width).toBe(DEFAULT_SHAPE_SIZE.width);
  });

  it('порог экранный: на мелком зуме то же мировое смещение уже клик', () => {
    const start = { x: 0, y: 0 };
    const current = { x: 20, y: 0 };

    expect(shapeFromDrag(start, current, 'rect', false, 1).width).toBe(20);
    expect(shapeFromDrag(start, current, 'rect', false, 0.1).width).toBe(DEFAULT_SHAPE_SIZE.width);
  });

  it('Shift при клике не мешает: размер всё равно по умолчанию', () => {
    const node = shapeFromDrag({ x: 10, y: 10 }, { x: 10, y: 10 }, 'rect', true, 1);

    expect(node.width).toBe(DEFAULT_SHAPE_SIZE.width);
    expect(node.height).toBe(DEFAULT_SHAPE_SIZE.height);
  });
});

describe('созданный узел — инварианты', () => {
  const cases: Array<[string, () => ReturnType<typeof createShapeNode>]> = [
    ['протяжка', () => shapeFromDrag({ x: 0, y: 0 }, { x: FAR, y: FAR }, 'rect', false, 1)],
    [
      'обратная протяжка',
      () => shapeFromDrag({ x: FAR, y: FAR }, { x: 0, y: 0 }, 'rect', false, 1),
    ],
    ['клик', () => shapeFromDrag({ x: 7, y: 7 }, { x: 7, y: 7 }, 'rect', false, 1)],
  ];

  for (const [name, make] of cases) {
    it(`${name}: id, type и неотрицательные размеры`, () => {
      const node = make();

      expect(node.id).toBeTruthy();
      expect(typeof node.id).toBe('string');
      expect(node.type).toBe('shape');
      expect(node.width).toBeGreaterThanOrEqual(0);
      expect(node.height).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.rotation).toBe(0);
      expect(node.opacity).toBe(1);
      expect(node.locked).toBe(false);
      expect(node.strokeWidth).toBeGreaterThan(0);
    });
  }

  it('id уникальны — два узла подряд не совпадают', () => {
    const a = createShapeNode({ x: 0, y: 0, width: 10, height: 10 }, 'rect');
    const b = createShapeNode({ x: 0, y: 0, width: 10, height: 10 }, 'rect');

    expect(a.id).not.toBe(b.id);
  });

  it('подпись не заводится сама: label отсутствует, а не равен undefined-объекту', () => {
    const node = createShapeNode({ x: 0, y: 0, width: 10, height: 10 }, 'rect');

    expect('label' in node).toBe(false);
  });

  it('узел ложится в документ и в nodes, и в order — инвариант 1', () => {
    const node = shapeFromDrag({ x: 0, y: 0 }, { x: FAR, y: FAR }, 'rect', false, 1);
    const d = doc([node]);

    expect(d.nodes[node.id]).toBe(node);
    expect(d.order).toContain(node.id);
    expect(d.order).toHaveLength(Object.keys(d.nodes).length);
  });
});

describe('все пять форм', () => {
  for (const shape of ALL_SHAPES) {
    it(`${shape} создаётся протяжкой и кликом`, () => {
      const dragged = shapeFromDrag({ x: 0, y: 0 }, { x: FAR, y: FAR }, shape, false, 1);
      const clicked = shapeFromDrag({ x: 0, y: 0 }, { x: 0, y: 0 }, shape, false, 1);

      expect(dragged.shape).toBe(shape);
      expect(clicked.shape).toBe(shape);
      expect(dragged.type).toBe('shape');
      expect(clicked.type).toBe('shape');
    });
  }

  it('перечислены все формы из типа ShapeNode', () => {
    expect(new Set(ALL_SHAPES).size).toBe(5);
  });
});

describe('createShapeNode — переопределения', () => {
  it('overrides перекрывают умолчания', () => {
    const node = createShapeNode({ x: 0, y: 0, width: 40, height: 40 }, 'roundRect', {
      fill: '#ffe08a',
      cornerRadius: 16,
      locked: true,
    });

    expect(node.fill).toBe('#ffe08a');
    expect(node.cornerRadius).toBe(16);
    expect(node.locked).toBe(true);
    // Не перечисленное остаётся умолчанием.
    expect(node.opacity).toBe(1);
    expect(node.strokeWidth).toBe(1);
  });

  it('рамка переносится в узел один в один', () => {
    const node = createShapeNode({ x: -30, y: 12.5, width: 200, height: 0 }, 'rect');

    expect(node).toMatchObject({ x: -30, y: 12.5, width: 200, height: 0 });
  });
});
