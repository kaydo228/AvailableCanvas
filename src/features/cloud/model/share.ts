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
  `${origin.replace(/\/$/, '')}${publicPath(projectId)}`;

export const setPublic = async (projectId: Id, isPublic: boolean): Promise<boolean> => {
  const cloud = getCloud();
  if (!cloud) return false;

  const { error } = await cloud
    .from('projects')
    .update({ is_public: isPublic })
    .eq('id', projectId);
  if (error) return false;

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
  const { data, error } = await cloud.from('projects').select('*').eq('id', projectId).single();
  if (error || !data) return null;

  const row = data as ProjectRow;
  return { name: row.name, document: repairDocument(row.document).document };
};
