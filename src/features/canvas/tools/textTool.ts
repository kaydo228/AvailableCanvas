/**
 * Инструмент «Текст» (FR-04).
 *
 * Чистые функции: без React, без Konva, без стора. Сюда приходят мировые
 * координаты и зум, отсюда уходит готовый узел — куда его положить, решает
 * слой, который зовёт эти функции.
 *
 * Геометрия общая на все инструменты, из ./geometry: свою нормализацию
 * прямоугольника здесь заводить нельзя, иначе типы узлов разъедутся
 * по поведению на первой же протяжке справа налево.
 */

import type { Rect, Size, WorldPoint } from '@/features/canvas/engine/contract';
import type { TextNode } from '@/shared/types/document';

import { isClick, normalizeRect, rectAround } from './geometry';

/** Кегль по умолчанию, в мировых единицах. */
export const DEFAULT_FONT_SIZE = 16;

/** Межстрочный по умолчанию. То же значение, что и в TextOverlay/TextView. */
export const DEFAULT_LINE_HEIGHT = 1.3;

/**
 * Не чистый чёрный: на белом фоне он выглядит грязно и «дешевит» текст.
 * Это запасной цвет для светлой темы — обычно цвет приходит параметром
 * из темы (`themeInk`), иначе на тёмной доске новый текст не видно.
 */
export const DEFAULT_TEXT_COLOR = '#111827';

/**
 * Рамка узла, созданного одиночным кликом.
 *
 * Высота — строка кегля по умолчанию плюс поля рендерера (`TEXT_PADDING`
 * по 8 с каждой стороны): по этой рамке `TextOverlay` считает размер
 * textarea, и заниженная высота даёт поле, в которое не влезает курсор.
 * Ширина при `autoWidth` — только начальная: узел растёт по содержимому.
 */
export const DEFAULT_TEXT_SIZE: Size = { width: 200, height: 40 };

/**
 * Нижняя граница рамки, вытянутой протяжкой. Блок шириной в пару пикселей
 * с переносом по словам ломает текст по букве на строку.
 */
export const MIN_TEXT_SIZE: Size = { width: 40, height: DEFAULT_TEXT_SIZE.height };

/** Поля `TextNode`, которые можно переопределить при создании. */
export type TextNodeOverrides = Partial<Omit<TextNode, 'id' | 'type'>>;

/**
 * Узел по готовой рамке. Рамка обязана быть уже нормализованной —
 * `Math.max` здесь предохранитель, а не замена normalizeRect.
 *
 * `overrides.text` заменяет стиль целиком, а не сливается по полям:
 * частичное слияние двух источников стиля читается хуже, чем один явный.
 */
export function createTextNode(
  rect: Rect,
  overrides: TextNodeOverrides = {},
  color: string = DEFAULT_TEXT_COLOR,
): TextNode {
  const base: TextNode = {
    id: crypto.randomUUID(),
    type: 'text',
    x: rect.x,
    y: rect.y,
    width: Math.max(0, rect.width),
    height: Math.max(0, rect.height),
    rotation: 0,
    opacity: 1,
    locked: false,
    // Клик — самый частый способ создания, поэтому значение по умолчанию
    // именно такое: точка вставки, растущая по мере ввода.
    autoWidth: true,
    text: {
      value: '',
      fontSize: DEFAULT_FONT_SIZE,
      color,
      align: 'left',
      lineHeight: DEFAULT_LINE_HEIGHT,
    },
  };

  return { ...base, ...overrides };
}

/**
 * Узел по жесту: от нажатия `start` до отпускания `current`.
 *
 * Разница между кликом и протяжкой у текста смысловая, а не только в размере
 * (FR-04):
 *
 * - **клик** — точка вставки. `autoWidth: true`, рамка по умолчанию
 *   центрируется по точке, ширина дальше следует за содержимым;
 * - **протяжка** — блок фиксированной ширины. `autoWidth: false`, ширина
 *   берётся из нормализованной рамки, дальше текст переносится по словам.
 *
 * Порог клика зависит от зума (см. isClick): на четырёхкратном приближении
 * тот же дрожащий сдвиг мыши — это всё ещё клик по экрану, но вчетверо
 * больший сдвиг в мире.
 */
export function textFromDrag(
  start: WorldPoint,
  current: WorldPoint,
  zoom: number,
  color: string = DEFAULT_TEXT_COLOR,
): TextNode {
  if (isClick(start, current, zoom)) {
    const rect = rectAround(start, DEFAULT_TEXT_SIZE.width, DEFAULT_TEXT_SIZE.height);
    return createTextNode(rect, { autoWidth: true }, color);
  }

  const rect = normalizeRect(start, current);

  return createTextNode(
    rect,
    {
      autoWidth: false,
      width: Math.max(rect.width, MIN_TEXT_SIZE.width),
      height: Math.max(rect.height, MIN_TEXT_SIZE.height),
    },
    color,
  );
}

/**
 * Надо ли удалить узел, когда ввод потерял фокус (FR-04).
 *
 * Пустой текстовый блок невидим: на доске от него остаётся ничто, а в
 * документе — узел, который переживает перезагрузку и попадает в экспорт.
 * Один промах мимо холста инструментом «Текст» — и такой узел уже есть.
 *
 * Пробелы и переводы строк считаются пустотой: набор пробелов на доске
 * выглядит ровно так же, как ничего.
 *
 * Предикат, а не действие: удаляет узел тот, у кого есть стор.
 */
export function shouldRemoveOnBlur(node: TextNode): boolean {
  return node.text.value.trim().length === 0;
}
