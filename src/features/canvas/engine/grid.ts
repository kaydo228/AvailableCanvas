/**
 * Зона 3 — математика фоновой сетки.
 *
 * Чистые функции: без React, без Konva, без стора, без побочных эффектов.
 * Единственная зависимость — зона 1 (`visibleWorldRect`): своей математики
 * вида здесь нет и быть не должно, формула перевода координат одна на движок.
 *
 * Две задачи файла:
 *   1) плотность — какой шаг сетки в мировых единицах брать при текущем зуме;
 *   2) раскладка — какие мировые координаты попадают в видимую область,
 *      с жёстким потолком на число точек за кадр.
 */

import type { Viewport } from '@/shared/types/document';

import type { ComputeGridDensity, Rect, Size } from './contract';
import { visibleWorldRect } from './viewport';

/** Базовый шаг сетки в мировых единицах: `GridProps.step` по умолчанию. */
export const DEFAULT_GRID_STEP = 24;

/**
 * Коридор расстояния между точками на ЭКРАНЕ, в пикселях.
 *
 * Ближе MIN — точки сливаются в рябь и жрут кадр впустую;
 * дальше MAX — сетка перестаёт читаться как сетка и не помогает выравнивать.
 * Ширина коридора ровно вчетверо (12 → 48), поэтому шаг подстраивается
 * степенями двойки и после подстройки всегда попадает внутрь.
 */
export const MIN_SCREEN_GAP = 12;
export const MAX_SCREEN_GAP = 48;

/**
 * Предел огрубления: во сколько раз шаг вообще разрешено увеличить
 * относительно базового, прежде чем сетку решено не рисовать.
 * Для базовых 24 это лестница 24 → 48 → 96, дальше — `visible: false`.
 *
 * Отсюда порог видимости: сетка прячется при зуме ниже
 * MIN_SCREEN_GAP / (baseStep * MAX_STEP_SCALE) = 12 / 96 = 0.125,
 * то есть на дальнем конце диапазона (ZOOM_MIN = 0.1) её уже нет —
 * «на мелком просто прячь, не рисуй миллион точек».
 */
export const MAX_STEP_SCALE = 4;

/**
 * Жёсткий предохранитель: столько точек за кадр — потолок при любом раскладе.
 * Считается ДО отрисовки; если раскладка даёт больше — шаг удваивается,
 * а если и это не спасает, сетка не рисуется вовсе.
 */
export const MAX_GRID_POINTS = 20000;

/** Сколько раз предохранителю разрешено удвоить шаг, прежде чем сдаться. */
const MAX_GUARD_DOUBLINGS = 8;

/** Цвет точек по умолчанию — значение `GridProps.color`. */
export const DEFAULT_GRID_COLOR = '#cbd2da';

/**
 * Во сколько раз подстроить базовый шаг, чтобы экранный зазор попал в коридор.
 *
 * Множитель всегда степень двойки — и это принципиально: при смене плотности
 * сетка не перестраивается на новые места, а прореживается и сгущается.
 * Точки крупного шага — строгое подмножество точек мелкого, поэтому переход
 * между уровнями не «дёргает» картинку.
 */
const stepScaleFor = (screenGap: number): number => {
  if (screenGap < MIN_SCREEN_GAP) {
    return 2 ** Math.ceil(Math.log2(MIN_SCREEN_GAP / screenGap));
  }
  if (screenGap > MAX_SCREEN_GAP) {
    return 2 ** -Math.ceil(Math.log2(screenGap / MAX_SCREEN_GAP));
  }
  // Зазор уже в коридоре — базовый шаг как есть. Отсюда же следует, что при
  // zoom = 1 (зазор 24 px) шаг равен базовому.
  return 1;
};

/**
 * Плотность сетки под текущий зум.
 *
 * Экранный зазор `worldStep * zoom` после подстройки лежит в
 * [MIN_SCREEN_GAP, MAX_SCREEN_GAP] при любом зуме, для которого `visible`.
 * Мусор на входе (NaN, ноль, минус) — не исключение, а `visible: false`.
 */
export const computeGridDensity: ComputeGridDensity = (zoom, baseStep) => {
  const step =
    Number.isFinite(baseStep) && baseStep > 0 ? baseStep : DEFAULT_GRID_STEP;

  if (!Number.isFinite(zoom) || zoom <= 0) {
    return { worldStep: step, visible: false };
  }

  const scale = stepScaleFor(step * zoom);

  // Абсурдный вход (переполнение `step * zoom`) даёт нулевой множитель.
  // Наружу нулевой шаг выпускать нельзя — на него потом делят.
  if (!(scale > 0)) {
    return { worldStep: step, visible: false };
  }

  if (scale > MAX_STEP_SCALE) {
    // Прореживать дальше некуда: шаг уже перестал быть ориентиром, а точек
    // всё равно много. Возвращаем самый крупный шаг, который мы готовы
    // рисовать, — но с `visible: false`, опираться на него не нужно.
    return { worldStep: step * MAX_STEP_SCALE, visible: false };
  }

  return { worldStep: step * scale, visible: true };
};

/**
 * Наименьший зум, при котором сетка ещё рисуется, для данного базового шага.
 * Для 24 это 0.125 — ниже (включая ZOOM_MIN = 0.1) сетки нет.
 */
export const minVisibleZoom = (baseStep: number = DEFAULT_GRID_STEP): number =>
  MIN_SCREEN_GAP / (baseStep * MAX_STEP_SCALE);

/**
 * Раскладка сетки для видимой области.
 *
 * Точки хранятся не списком пар, а двумя осями: колонки × строки. Это тот же
 * набор точек, но памяти на два порядка меньше (162 + 92 чисел вместо 14 904
 * пар), а компонент разворачивает их двойным циклом прямо в отрисовке.
 */
export interface GridLayout {
  /** false — рисовать нечего: мелкий зум, пустой канвас, предохранитель. */
  visible: boolean;
  /** Итоговый шаг в мировых единицах — уже с учётом зума и предохранителя. */
  worldStep: number;
  /** Мировые X колонок; каждая кратна `worldStep`. */
  columns: number[];
  /** Мировые Y строк; каждая кратна `worldStep`. */
  rows: number[];
  /** `columns.length * rows.length` — сколько точек рисуется за кадр. */
  count: number;
}

const hiddenLayout = (worldStep: number): GridLayout => ({
  visible: false,
  worldStep,
  columns: [],
  rows: [],
  count: 0,
});

interface AxisRange {
  /** Индекс первой линии сетки: её мировая координата — `firstIndex * step`. */
  firstIndex: number;
  count: number;
}

/**
 * Диапазон индексов линий сетки, покрывающий отрезок [min, min + size].
 *
 * Индексы, а не координаты: позиция считается как `index * step`, поэтому она
 * точно кратна шагу и не накапливает ошибку сложения. Именно это держит сетку
 * приклеенной к миру — при панорамировании на нецелое число точки не «плывут»,
 * а уезжают вместе с содержимым, потому что привязаны к мировой решётке,
 * а не к краю экрана.
 *
 * floor/ceil дают по одной линии за каждым краем — точка на самой границе
 * не должна пропадать из-за округления.
 */
const axisRange = (min: number, size: number, step: number): AxisRange => {
  const firstIndex = Math.floor(min / step);
  const lastIndex = Math.ceil((min + size) / step);
  return { firstIndex, count: lastIndex - firstIndex + 1 };
};

const axisValues = (range: AxisRange, step: number): number[] => {
  const values = new Array<number>(range.count);
  for (let i = 0; i < range.count; i += 1) {
    values[i] = (range.firstIndex + i) * step;
  }
  return values;
};

/**
 * Мировые координаты точек сетки, попадающих в видимую область.
 *
 * Видимый прямоугольник берётся из зоны 1 (`visibleWorldRect`).
 * Порядок решений: плотность по зуму → раскладка по видимой области →
 * предохранитель по числу точек. Предохранитель может огрубить шаг сверх
 * коридора (на очень больших канвасах) и в пределе спрятать сетку —
 * лучше редкая сетка, чем сорванный кадр.
 */
export const computeGridLayout = (
  viewport: Viewport,
  canvas: Size,
  baseStep: number = DEFAULT_GRID_STEP,
): GridLayout => {
  const density = computeGridDensity(viewport.zoom, baseStep);
  if (!density.visible) return hiddenLayout(density.worldStep);

  const sane =
    Number.isFinite(canvas.width) &&
    Number.isFinite(canvas.height) &&
    canvas.width > 0 &&
    canvas.height > 0 &&
    Number.isFinite(viewport.x) &&
    Number.isFinite(viewport.y);
  if (!sane) return hiddenLayout(density.worldStep);

  const rect: Rect = visibleWorldRect(viewport, canvas);

  let worldStep = density.worldStep;

  for (let attempt = 0; attempt <= MAX_GUARD_DOUBLINGS; attempt += 1) {
    const columns = axisRange(rect.x, rect.width, worldStep);
    const rows = axisRange(rect.y, rect.height, worldStep);
    const count = columns.count * rows.count;

    if (count <= MAX_GRID_POINTS) {
      return {
        visible: true,
        worldStep,
        columns: axisValues(columns, worldStep),
        rows: axisValues(rows, worldStep),
        count,
      };
    }

    worldStep *= 2;
  }

  return hiddenLayout(worldStep);
};
