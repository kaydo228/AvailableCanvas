/**
 * Выгрузка доски. Одна строка на доску, документ целиком в `jsonb`.
 *
 * Порядок внутри выгрузки: сначала картинки (задача 6), потом строка. Обратный
 * порядок даёт мгновение, когда на сервере лежит доска со ссылками на ещё
 * не загруженные файлы, и другое устройство успевает её скачать именно тогда.
 *
 * Ошибка сети не откатывает ничего локально — она только ставит `dirty`.
 */

import { getDocument, getProject } from '@/features/persistence';
import { readSyncState, writeSyncState } from '@/features/persistence/syncStore';
import type { BoardDocument, Id, Project } from '@/shared/types/document';

import { getCloud } from './client';
import { uploadImages } from './images';

export interface ProjectRow {
  id: string;
  owner: string;
  name: string;
  created_at: string;
  updated_at: string;
  thumbnail: string | null;
  document: BoardDocument;
  is_public: boolean;
}

export const toRow = (
  project: Pick<Project, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'thumbnail'>,
  document: BoardDocument,
  owner: string,
  isPublic: boolean,
): ProjectRow => ({
  id: project.id,
  owner,
  name: project.name,
  created_at: new Date(project.createdAt).toISOString(),
  updated_at: new Date(project.updatedAt).toISOString(),
  thumbnail: project.thumbnail ?? null,
  document,
  is_public: isPublic,
});

/** Время строки обратно в миллисекунды — тем же способом во всех местах. */
export const rowUpdatedAt = (value: string): number => Date.parse(value);

export const pushProject = async (projectId: Id, owner: string): Promise<boolean> => {
  const cloud = getCloud();
  if (!cloud) return false;

  const [project, document, state] = await Promise.all([
    getProject(projectId),
    getDocument(projectId),
    readSyncState(projectId),
  ]);
  if (!project || !document) return false;

  // Картинки — первыми: при настоящей (не 409) ошибке выгрузки строку доски
  // не пишем вовсе, иначе на сервере окажется документ со ссылкой на файл,
  // которого там нет — на другом устройстве это откроется дырой вместо
  // картинки, и само не починится. Дальше это та же ветка `error`, что и
  // отказ `upsert`: остаётся прежний `remoteUpdatedAt`, ставится `dirty`.
  const imagesUploaded = await uploadImages(document, owner);
  const { error } = imagesUploaded
    ? await cloud.from('projects').upsert(toRow(project, document, owner, state?.isPublic ?? false))
    : { error: new Error('картинки доски не выгрузились') };

  // `writeSyncState` — это `put`, полная перезапись: при ошибке нельзя молча
  // выбросить remoteUpdatedAt, иначе доска, которая уже уезжала на сервер,
  // после первого же обрыва сети станет неотличима от той, что не уезжала
  // никогда. `exactOptionalPropertyTypes` не даёт положить туда `undefined`
  // явно — если доска ни разу не доехала, ключ просто не пишем.
  const remoteUpdatedAt = error ? state?.remoteUpdatedAt : project.updatedAt;
  await writeSyncState({
    projectId,
    owner,
    ...(remoteUpdatedAt !== undefined ? { remoteUpdatedAt } : {}),
    dirty: Boolean(error),
    isPublic: state?.isPublic ?? false,
  });

  return !error;
};

export const deleteRemote = async (projectId: Id): Promise<void> => {
  await getCloud()?.from('projects').delete().eq('id', projectId);
};
