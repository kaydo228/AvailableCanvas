/**
 * Скачивание и применение решений.
 *
 * Пришедший документ проходит `repairDocument` — ту же починку, что и файл
 * при импорте. Причина та же: строка в базе могла быть записана другой
 * версией приложения, и это граница доверия, а не «наши же данные».
 */

import { deleteProject, listProjects, overwriteProject } from '@/features/persistence';
import { repairDocument } from '@/features/persistence/repair';
import { allSyncStates, forgetSyncState, writeSyncState } from '@/features/persistence/syncStore';
import type { Id } from '@/shared/types/document';

import { getCloud } from './client';
import { type Decision, decide, type LocalBoard, type RemoteBoard } from './merge';
import { type ProjectRow, pushProject, rowUpdatedAt } from './push';

export const remoteList = async (owner: string): Promise<RemoteBoard[]> => {
  const cloud = getCloud();
  if (!cloud) return [];

  const { data, error } = await cloud.from('projects').select('id, updated_at').eq('owner', owner);
  if (error || !data) return [];

  return data.map((row) => ({ id: row.id as Id, updatedAt: rowUpdatedAt(row.updated_at) }));
};

export const localBoards = async (): Promise<LocalBoard[]> => {
  const [projects, states] = await Promise.all([listProjects(), allSyncStates()]);
  const byId = new Map(states.map((state) => [state.projectId, state]));

  return projects.map((project) => {
    const state = byId.get(project.id);
    return { projectId: project.id, updatedAt: project.updatedAt, ...(state ? { state } : {}) };
  });
};

export const pullProject = async (projectId: Id): Promise<boolean> => {
  const cloud = getCloud();
  if (!cloud) return false;

  const { data, error } = await cloud.from('projects').select('*').eq('id', projectId).single();
  if (error || !data) return false;

  const row = data as ProjectRow;
  const updatedAt = rowUpdatedAt(row.updated_at);
  const repaired = repairDocument(row.document);

  await overwriteProject(
    {
      id: row.id,
      name: row.name,
      createdAt: rowUpdatedAt(row.created_at),
      updatedAt,
      ...(row.thumbnail ? { thumbnail: row.thumbnail } : {}),
    },
    repaired.document,
  );

  await writeSyncState({
    projectId: row.id,
    owner: row.owner,
    remoteUpdatedAt: updatedAt,
    dirty: false,
    isPublic: row.is_public,
  });

  return true;
};

const deleteLocal = async (projectId: Id): Promise<void> => {
  await deleteProject(projectId);
  await forgetSyncState(projectId);
};

export interface SyncActions {
  push(projectId: Id): Promise<boolean>;
  pull(projectId: Id): Promise<boolean>;
  deleteLocal(projectId: Id): Promise<void>;
}

/**
 * Применение решений по одному. Последовательно, а не `Promise.all`: пачка
 * параллельных записей в IndexedDB и в сеть на двадцати досках — это способ
 * получить таймаут вместо синхронизации.
 *
 * Отказ на одной доске не отменяет остальные: связь могла оборваться посреди
 * списка, и половина синхронизированных досок лучше нуля.
 */
export async function applyDecisions(decisions: Decision[], actions: SyncActions): Promise<void> {
  for (const decision of decisions) {
    try {
      if (decision.kind === 'push') await actions.push(decision.projectId);
      else if (decision.kind === 'pull') await actions.pull(decision.projectId);
      else if (decision.kind === 'delete-local') await actions.deleteLocal(decision.projectId);
    } catch (error) {
      console.warn('Не удалось синхронизировать доску', decision.projectId, error);
    }
  }
}

export const syncNow = async (owner: string): Promise<void> => {
  const [local, remote] = await Promise.all([localBoards(), remoteList(owner)]);

  await applyDecisions(decide(local, remote, owner), {
    push: (projectId) => pushProject(projectId, owner),
    pull: pullProject,
    deleteLocal,
  });
};
