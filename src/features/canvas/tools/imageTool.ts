/**
 * Создание узла-картинки (FR-06). Чистые функции, без React и без IndexedDB:
 * файл в хранилище кладёт putImage из features/persistence, здесь только
 * геометрия и сборка узла.
 */

import type { Size, WorldPoint } from '@/features/canvas/engine/contract';
import type { StoredImage } from '@/features/persistence';
import type { ImageNode } from '@/shared/types/document';

/**
 * Больший бок вставляемой картинки в мировых единицах.
 *
 * Без ограничения фотография с телефона приходит шириной 4000 и накрывает
 * всю доску: пользователь видит серое поле и не понимает, что произошло.
 */
export const MAX_INSERT_SIDE = 600;

/**
 * Размер под вставку: пропорции сохраняются, больший бок не превышает `maxSide`.
 * Картинка меньше предела не растягивается — увеличивать её незачем,
 * она станет мыльной.
 */
export function fitIntoSide(natural: Size, maxSide: number = MAX_INSERT_SIDE): Size {
  const { width, height } = natural;
  if (width <= 0 || height <= 0) return { width: maxSide, height: maxSide };

  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };

  const scale = maxSide / longest;
  return { width: width * scale, height: height * scale };
}

/**
 * Узел по уже сохранённой картинке. `center` — куда её положить:
 * точка сброса файла, точка вставки из буфера или центр видимой области.
 */
export function createImageNode(stored: StoredImage, center: WorldPoint): ImageNode {
  const size = fitIntoSide({
    width: stored.naturalWidth,
    height: stored.naturalHeight,
  });

  return {
    id: crypto.randomUUID(),
    type: 'image',
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    width: size.width,
    height: size.height,
    rotation: 0,
    opacity: 1,
    locked: false,
    blobId: stored.blobId,
    naturalWidth: stored.naturalWidth,
    naturalHeight: stored.naturalHeight,
  };
}

/** Пропорции узла. Нужны ресайзу, чтобы картинка не плющилась. */
export function aspectOf(node: ImageNode): number {
  return node.naturalHeight > 0 ? node.naturalWidth / node.naturalHeight : 1;
}
