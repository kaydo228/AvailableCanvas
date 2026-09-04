/**
 * Картинки в Storage. Путь — `owner/blobId`: и писать, и читать свою папку
 * может только владелец — правило `select` в базе сужено до неё же
 * (docs/cloud-setup.md). `download()` ходит через API, который правила
 * проверяет, поэтому чужую папку им не перечислить и не прочитать.
 *
 * Что остаётся доступно постороннему: bucket публичный, значит файл можно
 * скачать по точному публичному адресу `.../object/public/images/owner/blobId`
 * без всякого входа. Защита здесь — неугадываемый `blobId`, и только он.
 * Раньше того же уровня «защиты» хватало и на перечисление папки целиком:
 * общее правило `using (bucket_id = 'images')` разрешало `list()` любому,
 * а uuid владельца анонимно отдавала публичная доска (`share.ts`) — угадывать
 * не требовалось вовсе.
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

/**
 * Возвращает `true`, только если все нужные файлы гарантированно лежат на
 * сервере. `pushProject` кладёт строку доски лишь при `true` — иначе на
 * сервере окажется документ со ссылкой на файл, которого там нет, а на
 * другом устройстве это откроется дырой вместо картинки, и само не починится.
 */
export const uploadImages = async (document: BoardDocument, owner: string): Promise<boolean> => {
  const cloud = getCloud();
  if (!cloud) return true;

  for (const blobId of collectBlobIds(document)) {
    const blob = await getBlob(blobId);
    if (!blob) continue;

    // upsert: false — файл неизменяемый, второй раз его заливать незачем.
    const { error } = await cloud.storage.from(BUCKET).upload(`${owner}/${blobId}`, blob, {
      upsert: false,
    });
    // «Уже есть» — код 409, нормальный исход повторной выгрузки, не ошибка.
    // Проверяем код, а не текст сообщения: текст меняется между версиями API.
    if (error && error.statusCode !== '409') return false;
  }

  return true;
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
