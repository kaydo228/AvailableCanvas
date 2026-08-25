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

export const getBlob = async (blobId: Id): Promise<Blob | undefined> =>
  (await withDB((db) => db.get('blobs', blobId)))?.blob;

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

/** Удаляет картинку и её кэши. Вызывать, когда удалён последний ссылающийся узел. */
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
