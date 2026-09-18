/**
 * Публикация доски на чтение.
 *
 * Читателю доска НЕ кладётся в IndexedDB: человек, перешедший по чужой ссылке,
 * не должен обнаружить чужую доску в своём списке проектов. Документ живёт
 * только в памяти вкладки, пока её не закрыли.
 */

import { repairDocument } from '@/features/persistence/repair';
import { readSyncState, writeSyncState } from '@/features/persistence/syncStore';
import type { BoardDocument, Id } from '@/shared/types/document';

import { getCloud } from './client';
import type { ProjectRow } from './push';

/** Имя едет вместе с документом: без него выгрузке нечего писать в имя файла. */
export interface PublicBoard {
  name: string;
  document: BoardDocument;
}

export const publicPath = (projectId: Id): string => `/s/${projectId}`;

export const publicUrl = (projectId: Id, origin: string = window.location.origin): string =>
  `${origin.replace(/\/$/, '')}${import.meta.env.BASE_URL.replace(/\/$/, '')}${publicPath(projectId)}`;

export const setPublic = async (projectId: Id, isPublic: boolean): Promise<boolean> => {
  const cloud = getCloud();
  if (!cloud) return false;

  // `.select()` — не украшение: `update` без него отвечает успехом и на ноль
  // затронутых строк (правило доступа отсеяло чужую доску, строки ещё нет на
  // сервере), а интерфейс рапортовал бы «опубликовано» при неизменном флаге.
  const { data, error } = await cloud
    .from('projects')
    .update({ is_public: isPublic })
    .eq('id', projectId)
    .select('id');
  if (error || data?.length !== 1) return false;

  const state = await readSyncState(projectId);
  await writeSyncState({ projectId, dirty: false, ...state, isPublic });
  return true;
};

export const loadPublicBoard = async (projectId: Id): Promise<PublicBoard | null> => {
  const cloud = getCloud();
  if (!cloud) return null;

  // Без входа: правило доступа в базе само отдаст строку, только если
  // `is_public` истинно. Проверять это здесь ещё раз незачем — и опасно:
  // две проверки в разных местах разъезжаются.
  //
  // Колонки перечислены поимённо, а не `*`: `owner` в ответе анониму — это
  // uuid владельца, то есть имя его папки в хранилище картинок, и `*` отдавал
  // бы его каждому, кто открыл публичную ссылку. Превью и времена публичному
  // экрану тоже не нужны.
  const { data, error } = await cloud
    .from('projects')
    .select('name, document')
    .eq('id', projectId)
    .single();
  if (error || !data) return null;

  const row = data as Pick<ProjectRow, 'name' | 'document'>;
  return { name: row.name, document: repairDocument(row.document).document };
};
