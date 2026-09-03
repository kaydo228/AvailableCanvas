/**
 * Хранилище картинок в IndexedDB (FR-06).
 *
 * В документе лежит только `blobId` — сам файл сюда, `ImageNode.blobId` на него
 * ссылается. localStorage не годится: он строковый и с лимитом в пару мегабайт.
 *
 * Object URL'ы кэшируются: `URL.createObjectURL` на каждый рендер течёт, а на
 * доске с картинками рендеров много.
 */

import { nanoid } from 'nanoid';

import type { Id } from '@/shared/types/document';
import { withDB } from './db';

/** Лимит на файл, FR-06. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Разрешённые форматы, FR-06. */
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
  'image/webp',
] as const;

export interface StoredImage {
  blobId: Id;
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * Отказ с понятной причиной — чтобы вызывающий показал текст пользователю,
 * а не «что-то пошло не так». FR-06 требует внятной ошибки при превышении лимита.
 */
export class ImageRejected extends Error {
  constructor(
    readonly reason: 'type' | 'size' | 'decode',
    message: string,
  ) {
    super(message);
    this.name = 'ImageRejected';
  }
}

const isAllowedType = (type: string): boolean =>
  (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);

const humanMegabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

/** Натуральный размер. Нужен, чтобы вписать картинку с сохранением пропорций. */
const measure = (blob: Blob): Promise<{ naturalWidth: number; naturalHeight: number }> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      // У SVG без явных width/height размеры бывают нулевые — подставляем
      // разумный дефолт, иначе узел схлопнется в точку.
      resolve({
        naturalWidth: image.naturalWidth || 300,
        naturalHeight: image.naturalHeight || 300,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageRejected('decode', 'Файл не удалось прочитать как изображение.'));
    };
    image.src = url;
  });

/**
 * Кладёт картинку в хранилище.
 *
 * Проверки здесь, а не у вызывающего: это граница доверия, файл приходит
 * от пользователя через drop, paste или диалог выбора.
 *
 * @throws ImageRejected — неподдерживаемый формат, превышен лимит или файл не картинка.
 */
export const putImage = async (file: Blob): Promise<StoredImage> => {
  if (!isAllowedType(file.type)) {
    throw new ImageRejected(
      'type',
      `Формат ${file.type || 'неизвестный'} не поддерживается. Можно PNG, JPEG, GIF, SVG и WebP.`,
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageRejected(
      'size',
      `Файл ${humanMegabytes(file.size)}, а можно не больше ${humanMegabytes(MAX_IMAGE_BYTES)}.`,
    );
  }

  const size = await measure(file);
  const blobId = nanoid();
  await withDB((db) => db.put('blobs', { blobId, blob: file }));

  return { blobId, ...size };
};

/**
 * Откуда брать картинку, которой нет локально. Ставится слайсом облака;
 * без него хранилище работает ровно как раньше — только локально. Импорта
 * из `features/cloud` здесь нет и не будет: зона хранения не должна знать
 * про зону синхронизации, только наоборот.
 */
type RemoteBlobSource = (blobId: Id) => Promise<Blob | undefined>;
let remoteSource: RemoteBlobSource | null = null;

export const setRemoteBlobSource = (source: RemoteBlobSource | null): void => {
  remoteSource = source;
};

/** Прямая запись блоба с известным id — для скачанного с сервера. */
export const putBlobDirect = async (blobId: Id, blob: Blob): Promise<void> => {
  await withDB((db) => db.put('blobs', { blobId, blob }));
};

export const getBlob = async (blobId: Id): Promise<Blob | undefined> => {
  const local = (await withDB((db) => db.get('blobs', blobId)))?.blob;
  if (local) return local;
  return remoteSource ? remoteSource(blobId) : undefined;
};

const urlCache = new Map<Id, string>();

/**
 * Object URL картинки. Повторный вызов отдаёт тот же URL — не течёт
 * и не заставляет браузер перезагружать одну и ту же картинку.
 */
export const getBlobUrl = async (blobId: Id): Promise<string | undefined> => {
  const cached = urlCache.get(blobId);
  if (cached) return cached;

  const blob = await getBlob(blobId);
  if (!blob) return undefined;

  const url = URL.createObjectURL(blob);
  urlCache.set(blobId, url);
  return url;
};

const elementCache = new Map<Id, HTMLImageElement>();

/**
 * Готовый `<img>` для `Konva.Image` — ему нужен именно элемент, а не URL.
 * Элементы кэшируются, поэтому вызывать можно из рендера.
 */
export const getImageElement = async (blobId: Id): Promise<HTMLImageElement | undefined> => {
  const cached = elementCache.get(blobId);
  if (cached) return cached;

  const url = await getBlobUrl(blobId);
  if (!url) return undefined;

  const element = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ImageRejected('decode', 'Картинка не загрузилась.'));
    image.src = url;
  });

  elementCache.set(blobId, element);
  return element;
};

/**
 * blobId, на которые не ссылается ни один документ.
 *
 * Считается по документам, а не по узлам открытой доски: узел, удалённый
 * с холста, вернётся по Cmd+Z, и картинку под ним трогать нельзя — отмена
 * превратилась бы в дыру. Документ, которого больше нет, вернуть нечем,
 * поэтому его картинки освобождать безопасно.
 */
export const collectOrphanBlobs = async (): Promise<Id[]> =>
  withDB(async (db) => {
    const alive = new Set<Id>();
    for (const document of await db.getAll('documents')) {
      for (const node of Object.values(document.nodes)) {
        if (node.type === 'image') alive.add(node.blobId);
      }
    }
    return (await db.getAllKeys('blobs')).filter((blobId) => !alive.has(blobId));
  });

/**
 * Подметает осиротевшие картинки. Возвращает, сколько снесла.
 *
 * Зовётся при старте приложения: до появления этой уборки картинки удалённых
 * проектов оставались в базе навсегда, и у пользователя уже накопилось.
 */
export const sweepBlobs = async (): Promise<number> => {
  const orphans = await collectOrphanBlobs();
  await Promise.all(orphans.map((blobId) => deleteBlob(blobId)));
  return orphans.length;
};

/** Удаляет картинку и её кэши. Вызывать, когда на неё не ссылается ни один документ. */
export const deleteBlob = async (blobId: Id): Promise<void> => {
  const url = urlCache.get(blobId);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(blobId);
  elementCache.delete(blobId);

  await withDB((db) => db.delete('blobs', blobId));
};

/** Освобождает все object URL'ы. Звать при выходе с холста. */
export const releaseImageCache = (): void => {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
  elementCache.clear();
};
