/**
 * Экспорт доски в PNG (FR-12): вся доска или только выделенное, 1× и 2×.
 *
 * Растеризует сам Konva — `toCanvas`/`toDataURL` перерисовывают сцену в новый
 * холст нужного размера, поэтому в картинку попадает и то, что сейчас за краем
 * экрана. Область считается по габаритам узлов (`lib/bounds`), а не по видимой
 * части: иначе экспорт зависел бы от того, куда пользователь отвёл камеру.
 *
 * Стор здесь трогается ради одного: снять выделение перед съёмкой. Рамки
 * выделения рисует зона A внутри того же слоя, и без этого они запекутся
 * в картинку синей обводкой вокруг каждого объекта.
 */

import Konva from 'konva';

import { useBoardStore } from '@/shared/store/board';
import { boundsOf } from '../lib/bounds';

export type PngScope = 'board' | 'selection';
export type PngScale = 1 | 2;

/**
 * Предел стороны холста в браузерах — дальше `toDataURL` молча отдаёт пустую
 * картинку, и это худший вид отказа: файл есть, а в нём ничего.
 */
const MAX_SIDE = 16_384;

/** Отказ с текстом для пользователя. */
export class ExportFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportFailed';
  }
}

/**
 * Дождаться, пока React отдаст изменение стора в Konva и сцена перерисуется.
 *
 * Таймер рядом с кадрами не для красоты: во вкладке в фоне `requestAnimationFrame`
 * не приходит вовсе, и без него экспорт из фоновой вкладки повис бы навсегда.
 */
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    setTimeout(resolve, 100);
  });

export const downloadUrl = (url: string, filename: string): void => {
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
};

/** Имя файла: русские буквы оставляем, ломающие файловую систему — нет. */
export const safeFilename = (name: string): string =>
  name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Доска';

export interface PngOptions {
  scope: PngScope;
  scale: PngScale;
  /** Имя проекта — уходит в имя файла. */
  name: string;
}

export interface Png {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Снимает PNG и отдаёт картинку данными. Отдельно от скачивания: так экспорт
 * можно проверить, не полагаясь на диалог сохранения файла.
 *
 * @throws ExportFailed — нечего экспортировать или область не влезает в холст.
 */
export const renderPng = async ({ scope, scale }: Omit<PngOptions, 'name'>): Promise<Png> => {
  const board = useBoardStore.getState();
  const document = board.document;
  if (!document) throw new ExportFailed('Доска ещё не открыта.');

  const ids = scope === 'selection' ? board.selection : document.order;
  if (scope === 'selection' && ids.length === 0) {
    throw new ExportFailed('Ничего не выделено — нечего сохранять.');
  }

  const box = boundsOf(document, ids);
  if (!box) throw new ExportFailed('На доске пусто — нечего сохранять.');

  const stage = Konva.stages[0];
  if (!stage) throw new ExportFailed('Холст ещё не готов, попробуйте ещё раз.');

  const width = Math.ceil(box.width * scale);
  const height = Math.ceil(box.height * scale);
  if (width > MAX_SIDE || height > MAX_SIDE) {
    throw new ExportFailed(
      `Область ${width}×${height} пикселей слишком велика для браузера ` +
        `(предел ${MAX_SIDE}). Возьмите множитель поменьше или экспортируйте выделенное.`,
    );
  }

  // Рамки выделения не должны попасть в картинку. Konva рисует то, что сейчас
  // в сцене, поэтому мало поменять стор — надо дождаться, пока React донесёт
  // это до сцены. Отсюда два кадра ожидания.
  const selection = board.selection;
  if (selection.length > 0) {
    board.clearSelection();
    await nextFrame();
  }

  const { viewport } = document;

  // Мир → координаты сцены: слой содержимого сдвинут и отмасштабирован
  // вьюпортом, а pixelRatio возвращает масштаб обратно, чтобы 1× означало
  // ровно один пиксель на единицу доски при любом текущем зуме.
  const region = {
    x: box.x * viewport.zoom + viewport.x,
    y: box.y * viewport.zoom + viewport.y,
    width: box.width * viewport.zoom,
    height: box.height * viewport.zoom,
    pixelRatio: scale / viewport.zoom,
  };

  // Сетка в экспорт не идёт: она рисуется в экранных координатах на видимую
  // область, и за её пределами её просто нет — в картинке получилась бы
  // полоса точек на четверть доски. Сетка первым слоем — это контракт GridLayer.
  const [grid] = stage.getLayers();

  let canvas: HTMLCanvasElement;
  try {
    grid?.hide();
    canvas = stage.toCanvas(region);
  } finally {
    grid?.show();
  }

  // Фон доски подкладываем сами: Konva отдаёт прозрачный PNG, а доска
  // с прозрачным фоном на тёмной теме просмотрщика превращается в чёрное
  // на чёрном.
  const output = window.document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext('2d');
  if (!context) throw new ExportFailed('Браузер не дал холст для отрисовки.');
  context.fillStyle = document.background.color;
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(canvas, 0, 0);

  if (selection.length > 0) useBoardStore.getState().select(selection);

  return { dataUrl: output.toDataURL('image/png'), width: output.width, height: output.height };
};

/** Снимает PNG и отдаёт браузеру на скачивание. */
export const exportPng = async ({ scope, scale, name }: PngOptions): Promise<void> => {
  const png = await renderPng({ scope, scale });
  const suffix = scope === 'selection' ? ' выделенное' : '';
  downloadUrl(png.dataUrl, `${safeFilename(name)}${suffix} ${scale}x.png`);
};
