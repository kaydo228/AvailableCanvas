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

import type { MemberRole, ProjectAccess } from './access';
import { getCloud } from './client';
import { type Decision, decide, type LocalBoard, type RemoteBoard } from './merge';
import { type ProjectRow, pushProject, rowUpdatedAt } from './push';

/**
 * Список досок владельца на сервере. `null` — «спросить не удалось»: сети нет,
 * токен протух, проект уснул, правило доступа отказало.
 *
 * Отличать это от пустого списка обязательно. Пустой массив означает «у
 * владельца нет ни одной доски», и `decide` на нём выносит `delete-local`
 * каждой доске, которая когда-то синхронизировалась — то есть один отказ
 * сервера стирал бы из IndexedDB все синхронизированные доски разом.
 */
export const remoteList = async (actorId: string): Promise<RemoteBoard[] | null> => {
  const cloud = getCloud();
  if (!cloud) return null;

  const [projects, memberships] = await Promise.all([
    cloud.from('projects').select('id, owner, updated_at, revision'),
    cloud.from('project_members').select('project_id, role').eq('user_id', actorId),
  ]);
  if (projects.error || !projects.data || memberships.error || !memberships.data) return null;

  const roles = new Map<string, MemberRole>();
  for (const membership of memberships.data) {
    if (membership.role === 'editor' || membership.role === 'viewer') {
      roles.set(membership.project_id, membership.role);
    }
  }

  return projects.data.flatMap((row) => {
    const access: ProjectAccess | undefined =
      row.owner === actorId ? 'owner' : roles.get(row.id as string);
    if (!access) return [];

    return [
      {
        id: row.id as Id,
        owner: row.owner as string,
        updatedAt: rowUpdatedAt(row.updated_at),
        revision: row.revision as number,
        access,
      },
    ];
  });
};

export const localBoards = async (): Promise<LocalBoard[]> => {
  const [projects, states] = await Promise.all([listProjects(), allSyncStates()]);
  const byId = new Map(states.map((state) => [state.projectId, state]));

  return projects.map((project) => {
    const state = byId.get(project.id);
    return { projectId: project.id, updatedAt: project.updatedAt, ...(state ? { state } : {}) };
  });
};

export const pullProject = async (remote: RemoteBoard): Promise<boolean> => {
  const cloud = getCloud();
  if (!cloud) return false;

  const { data, error } = await cloud.from('projects').select('*').eq('id', remote.id).single();
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
    owner: remote.owner,
    access: remote.access,
    remoteUpdatedAt: updatedAt,
    remoteRevision: remote.revision,
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
  // Сервер не ответил — круг не состоялся. Ни одного решения: «доски нет на
  // сервере» неотличимо от «сервер не сказал», а цена ошибки разная.
  if (!remote) return;

  const remoteById = new Map(remote.map((board) => [board.id, board]));
  await applyDecisions(decide(local, remote, owner), {
    push: (projectId) => pushProject(projectId, owner),
    pull: (projectId) => {
      const board = remoteById.get(projectId);
      return board ? pullProject(board) : Promise.resolve(false);
    },
    deleteLocal,
  });
};
