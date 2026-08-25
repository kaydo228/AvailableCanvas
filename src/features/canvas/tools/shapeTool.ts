/**
 * Инструмент «Фигура»: превращает жест пользователя в `ShapeNode`.
 *
 * Здесь только чистые функции, без React и без стора. Кто вызвал — тот и кладёт
 * результат в документ через `addNode` (который обязан записать узел И в `nodes`,
 * И в `order` — инвариант 1) и возвращает активный инструмент к «Выбору».
 *
 * Геометрия не своя: `normalizeRect`, `squareRect`, `rectAround` и `isClick`
 * живут в `tools/geometry.ts` и общие на все типы узлов. Второй экземпляр
 * нормализации прямоугольника — верный способ получить инструменты,
 * которые ведут себя по-разному при протяжке справа налево.
 */

import type { Rect, WorldPoint } from '@/features/canvas/engine/contract';
import { isClick, normalizeRect, rectAround, squareRect } from '@/features/canvas/tools/geometry';
import type { ShapeNode } from '@/shared/types/document';

/** Пять форм MVP из FR-03. Синоним, чтобы не писать `ShapeNode['shape']` везде. */
export type ShapeKind = ShapeNode['shape'];

/** Размер фигуры, созданной одиночным кликом. Узел центрируется по точке. */
export const DEFAULT_SHAPE_SIZE: { width: number; height: number } = {
  width: 160,
  height: 100,
};

/** Заливка по умолчанию: светлая, чтобы подпись внутри читалась тёмным. */
export const DEFAULT_SHAPE_FILL = '#ffffff';

/** Обводка по умолчанию: тёмная, в цвет текста интерфейса. */
export const DEFAULT_SHAPE_STROKE = '#111111';

export const DEFAULT_SHAPE_STROKE_WIDTH = 1;

/**
 * Чем можно переопределить умолчания при создании. `id` и `type` не трогаем:
 * id генерируется здесь, type у фигуры один.
 */
export type ShapeOverrides = Partial<Omit<ShapeNode, 'id' | 'type'>>;

/**
 * Узел-фигура по готовой рамке. Функция чистая во всём, кроме `randomUUID` —
 * без внешнего источника id пришлось бы тащить счётчик через все вызовы.
 *
 * `label` намеренно НЕ задаётся: в проекте включён exactOptionalPropertyTypes,
 * присвоить `undefined` необязательному полю нельзя, а пустая подпись
 * отличается от отсутствующей — рендерер по ней решает, рисовать ли Text.
 */
export function createShapeNode(
  rect: Rect,
  shape: ShapeKind,
  overrides: ShapeOverrides = {},
): ShapeNode {
  const base: ShapeNode = {
    id: crypto.randomUUID(),
    type: 'shape',
    shape,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotation: 0,
    opacity: 1,
    locked: false,
    fill: DEFAULT_SHAPE_FILL,
    stroke: DEFAULT_SHAPE_STROKE,
    strokeWidth: DEFAULT_SHAPE_STROKE_WIDTH,
  };

  // Object.assign, а не спред: при exactOptionalPropertyTypes спред Partial<T>
  // даёт `label?: TextStyle | undefined`, что уже не присваивается в ShapeNode.
  return Object.assign(base, overrides);
}

/**
 * Узел по жесту создания. Три ветки, и все три обязательны:
 *
 * 1. протяжка короче порога — это клик: рамка по умолчанию вокруг точки;
 * 2. протяжка с Shift — квадрат, сторона по большей из двух;
 * 3. обычная протяжка — нормализованная рамка, положительная в любую сторону.
 *
 * `zoom` нужен `isClick`: порог в 4 пикселя экранные, а не мировые, иначе
 * на зуме 10 % кликом считалась бы протяжка через пол-экрана.
 */
export function shapeFromDrag(
  start: WorldPoint,
  current: WorldPoint,
  shape: ShapeKind,
  shiftKey: boolean,
  zoom: number,
): ShapeNode {
  if (isClick(start, current, zoom)) {
    return createShapeNode(
      rectAround(start, DEFAULT_SHAPE_SIZE.width, DEFAULT_SHAPE_SIZE.height),
      shape,
    );
  }

  const rect = shiftKey ? squareRect(start, current) : normalizeRect(start, current);

  return createShapeNode(rect, shape);
}
