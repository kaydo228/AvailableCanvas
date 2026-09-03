/**
 * Картинки в Storage. Путь — `owner/blobId`: писать в свою папку может только
 * владелец, читать может кто угодно, у кого есть ссылка (bucket публичный
 * на чтение). `blobId` неугадываем, и это вся защита — так и записано в спеке.
 *
 * Скачивание ленивое: файл тянется в тот момент, когда его попросили нарисовать,
 * а не пачкой после синхронизации. Доска на сорок картинок иначе тормозила бы
 * весь вход ради изображений, которых человек может и не увидеть.
 */

import { getBlob, putBlobDirect, setRemoteBlobSource } from '@/features/persistence/blobStore';
import type { BoardDocument, Id } from '@/shared/types/document';

import { getCloud } from './client';

const BUCKET = 'images';

/** Какие файлы упоминает документ. Порядок — как в `order`, дубли убраны. */
export const collectBlobIds = (document: BoardDocument): Id[] => {
  const found: Id[] = [];
  const seen = new Set<Id>();

  for (const id of document.order) {
    const node = document.nodes[id];
    if (node?.type !== 'image' || seen.has(node.blobId)) continue;
    seen.add(node.blobId);
    found.push(node.blobId);
  }

  return found;
};

export const uploadImages = async (document: BoardDocument, owner: string): Promise<void> => {
  const cloud = getCloud();
  if (!cloud) return;

  for (const blobId of collectBlobIds(document)) {
    const blob = await getBlob(blobId);
    if (!blob) continue;

    // upsert: false — файл неизменяемый, второй раз его заливать незачем.
    // «Уже есть» здесь не ошибка, а нормальный исход повторной выгрузки.
    await cloud.storage.from(BUCKET).upload(`${owner}/${blobId}`, blob, { upsert: false });
  }
};

export const downloadImage = async (blobId: Id, owner: string): Promise<Blob | undefined> => {
  const cloud = getCloud();
  if (!cloud) return undefined;

  const { data } = await cloud.storage.from(BUCKET).download(`${owner}/${blobId}`);
  return data ?? undefined;
};

/**
 * Подключает фолбэк: `blobStore` не знает про облако и не должен — иначе
 * зона хранения начинает зависеть от зоны синхронизации, а не наоборот.
 */
export const connectRemoteImages = (owner: string | null): void => {
  if (!owner) {
    setRemoteBlobSource(null);
    return;
  }

  setRemoteBlobSource(async (blobId) => {
    const blob = await downloadImage(blobId, owner);
    // Скачали — кладём локально: второй раз за тем же файлом в сеть не ходим.
    if (blob) await putBlobDirect(blobId, blob);
    return blob;
  });
};
