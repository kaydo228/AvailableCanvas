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

import { canEdit } from './access';
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
  revision: number;
  updated_by: string | null;
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
  revision: 0,
  updated_by: owner,
});

/** Время строки обратно в миллисекунды — тем же способом во всех местах. */
export const rowUpdatedAt = (value: string): number => Date.parse(value);

/** Записи, которые прямо сейчас отправляет именно этот экземпляр приложения. */
const pendingWrites = new Map<Id, number>();

const beginProjectPush = (projectId: Id): void => {
  pendingWrites.set(projectId, (pendingWrites.get(projectId) ?? 0) + 1);
};

const endProjectPush = (projectId: Id): void => {
  const remaining = (pendingWrites.get(projectId) ?? 1) - 1;
  if (remaining > 0) pendingWrites.set(projectId, remaining);
  else pendingWrites.delete(projectId);
};

export const isProjectPushPending = (projectId: Id): boolean => pendingWrites.has(projectId);

export const pushProject = async (projectId: Id, owner: string): Promise<boolean> => {
  const cloud = getCloud();
  if (!cloud) return false;

  const [project, document, state] = await Promise.all([
    getProject(projectId),
    getDocument(projectId),
    readSyncState(projectId),
  ]);
  if (!project || !document) return false;

  // Согласие на перенос проверяется здесь, а не в вызывающих: их два
  // (`useCloudSync` на холсте и круг синхронизации), и любой третий должен
  // получить тот же запрет даром. `declined` — ответ «Оставить локальными»,
  // который иначе отменялся бы первым же сдвигом узла на этой доске.
  // Чужой `owner` — доска другого пользователя на общем устройстве: `decide`
  // защищает её специально, а прямая выгрузка обходила эту защиту с холста.
  const access =
    state?.access ?? (state?.owner === undefined || state.owner === owner ? 'owner' : undefined);
  const legacyForeignProject = state?.owner !== undefined && state.owner !== owner && !state.access;
  if (state?.declined === true || legacyForeignProject || !canEdit(access)) {
    return false;
  }

  // Картинки — первыми: при настоящей (не 409) ошибке выгрузки строку доски
  // не пишем вовсе, иначе на сервере окажется документ со ссылкой на файл,
  // которого там нет — на другом устройстве это откроется дырой вместо
  // картинки, и само не починится. Дальше это та же ветка `error`, что и
  // отказ `upsert`: остаётся прежний `remoteUpdatedAt`, ставится `dirty`.
  const imagesUploaded = await uploadImages(document, projectId);
  let pushStarted = false;
  try {
    if (imagesUploaded) {
      beginProjectPush(projectId);
      pushStarted = true;
    }
    const result = imagesUploaded
      ? await cloud.rpc('save_project', {
          p_project_id: project.id,
          p_name: project.name,
          p_created_at: new Date(project.createdAt).toISOString(),
          p_updated_at: new Date(project.updatedAt).toISOString(),
          p_thumbnail: project.thumbnail ?? null,
          p_document: document,
        })
      : { data: null, error: new Error('картинки доски не выгрузились') };
    const saved = Array.isArray(result.data) ? result.data[0] : undefined;
    const error = result.error || !saved;

    // `writeSyncState` — это `put`, полная перезапись: при ошибке нельзя молча
    // выбросить remoteUpdatedAt, иначе доска, которая уже уезжала на сервер,
    // после первого же обрыва сети станет неотличима от той, что не уезжала
    // никогда. `exactOptionalPropertyTypes` не даёт положить туда `undefined`
    // явно — если доска ни разу не доехала, ключ просто не пишем.
    const remoteUpdatedAt = error ? state?.remoteUpdatedAt : rowUpdatedAt(saved.updated_at);
    const remoteRevision = error ? state?.remoteRevision : (saved.revision as number);
    await writeSyncState({
      projectId,
      owner: state?.owner ?? owner,
      ...(access ? { access } : {}),
      ...(remoteUpdatedAt !== undefined ? { remoteUpdatedAt } : {}),
      ...(remoteRevision !== undefined ? { remoteRevision } : {}),
      dirty: Boolean(error),
      isPublic: state?.isPublic ?? false,
      ...(state?.declined !== undefined ? { declined: state.declined } : {}),
    });

    return !error;
  } finally {
    if (pushStarted) endProjectPush(projectId);
  }
};

/**
 * Удаление строки на сервере. `false` — сервера не спросили или он отказал.
 * Проглатывать этот отказ нельзя: локально доска уже снесена, и молчаливый
 * провал означает, что она вернётся скачиванием на следующем входе, а человек
 * узнает об этом сам и не поймёт почему (см. README, «Чего не умеет»).
 */
export const deleteRemote = async (projectId: Id): Promise<boolean> => {
  const cloud = getCloud();
  if (!cloud) return false;

  const { error } = await cloud.from('projects').delete().eq('id', projectId);
  return !error;
};
