/** Realtime-синхронизация одной открытой облачной доски. */

import { useEffect } from 'react';

import {
  getDocument,
  getProject,
  overwriteProject,
  removeRevokedProject,
} from '@/features/persistence';
import { beginSaveSession, loadRemoteDocument } from '@/features/persistence/autosave';
import { repairDocument } from '@/features/persistence/repair';
import { readSyncState, writeSyncState } from '@/features/persistence/syncStore';
import { useBoardStore } from '@/shared/store/board';
import type { Id, Viewport } from '@/shared/types/document';

import type { ProjectAccess } from './access';
import { getCloud } from './client';
import { pullProject, remoteList } from './pull';
import type { ProjectRow } from './push';
import { isProjectPushPending, rowUpdatedAt } from './push';
import { useSession } from './session';

export interface RemoteProjectContext {
  userId: string;
  currentViewport: Viewport;
  remoteRevision?: number;
  access?: ProjectAccess;
  ownWritePending?: boolean;
  active?: () => boolean;
}

export type RemoteApplyResult = { applied: false } | { applied: true; name: string };

const validRow = (value: unknown): value is ProjectRow => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const row = value as ProjectRow;
  const document = row.document as unknown;
  return (
    typeof row.id === 'string' &&
    typeof row.owner === 'string' &&
    typeof row.name === 'string' &&
    Number.isInteger(row.revision) &&
    row.revision >= 0 &&
    Number.isFinite(rowUpdatedAt(row.created_at)) &&
    Number.isFinite(rowUpdatedAt(row.updated_at)) &&
    typeof document === 'object' &&
    document !== null &&
    !Array.isArray(document) &&
    (document as { projectId?: unknown }).projectId === row.id
  );
};

/** Применяет одну серверную ревизию, не создавая обратное автосохранение. */
export const applyRemoteProjectRow = async (
  value: unknown,
  context: RemoteProjectContext,
): Promise<RemoteApplyResult> => {
  if (!validRow(value)) {
    console.warn('Realtime прислал повреждённую строку проекта', value);
    return { applied: false };
  }
  const row = value;

  const state = await readSyncState(row.id);
  const knownRevision = Math.max(context.remoteRevision ?? -1, state?.remoteRevision ?? -1);
  if (row.revision <= knownRevision) return { applied: false };

  const updatedAt = rowUpdatedAt(row.updated_at);
  const access =
    context.access ?? state?.access ?? (row.owner === context.userId ? 'owner' : undefined);
  const nextState = {
    projectId: row.id,
    owner: row.owner,
    ...(access ? { access } : {}),
    remoteUpdatedAt: updatedAt,
    remoteRevision: row.revision,
    dirty: false,
    isPublic: row.is_public,
    ...(state?.declined !== undefined ? { declined: state.declined } : {}),
  };

  // Эхо собственной записи уже находится в локальном документе. Повторная
  // загрузка породила бы лишний рендер и могла затереть более свежий штрих.
  if (row.updated_by === context.userId && context.ownWritePending) {
    await writeSyncState(nextState);
    return { applied: false };
  }

  try {
    const repaired = repairDocument(row.document);
    const document = { ...repaired.document, viewport: context.currentViewport };

    await overwriteProject(
      {
        id: row.id,
        name: row.name,
        createdAt: rowUpdatedAt(row.created_at),
        updatedAt,
        ...(row.thumbnail ? { thumbnail: row.thumbnail } : {}),
      },
      document,
    );
    await writeSyncState(nextState);
    if (context.active && !context.active()) return { applied: false };
    beginSaveSession(row.id, updatedAt);
    loadRemoteDocument(document);
    return { applied: true, name: row.name };
  } catch (error) {
    console.warn('Не удалось применить realtime-обновление проекта', error);
    return { applied: false };
  }
};

export interface ProjectRealtimeOptions {
  projectId?: Id;
  access?: ProjectAccess;
  onName(name: string): void;
  onRevoked(): void;
}

export const useProjectRealtime = ({
  projectId,
  access,
  onName,
  onRevoked,
}: ProjectRealtimeOptions): void => {
  const userId = useSession((state) => state.userId);

  useEffect(() => {
    const cloud = getCloud();
    if (!cloud || !projectId || !userId || !access) return;

    let stopped = false;
    let revoked = false;
    let disconnected = false;
    let projectChannel: ReturnType<typeof cloud.channel> | null = null;
    let accessChannel: ReturnType<typeof cloud.channel> | null = null;

    const closeChannels = () => {
      if (stopped) return;
      stopped = true;
      if (projectChannel) void cloud.removeChannel(projectChannel);
      if (accessChannel) void cloud.removeChannel(accessChannel);
    };

    const revoke = async () => {
      if (revoked) return;
      revoked = true;
      closeChannels();
      try {
        await removeRevokedProject(projectId);
      } catch (error) {
        console.warn('Не удалось удалить отозванный проект из локального хранилища', error);
      } finally {
        onRevoked();
      }
    };

    const apply = async (row: ProjectRow) => {
      const viewport = useBoardStore.getState().document?.viewport;
      if (!viewport || stopped) return;
      const result = await applyRemoteProjectRow(row, {
        userId,
        currentViewport: viewport,
        access,
        ownWritePending: isProjectPushPending(projectId),
        active: () => !stopped,
      });
      if (result.applied && !stopped) onName(result.name);
    };

    const reconcile = async () => {
      const remote = await remoteList(userId);
      if (!remote || stopped) return;
      const project = remote.find((item) => item.id === projectId);
      if (!project) {
        await revoke();
        return;
      }
      if (!(await pullProject(project)) || stopped) return;

      const [savedProject, document] = await Promise.all([
        getProject(projectId),
        getDocument(projectId),
      ]);
      if (!savedProject || !document || stopped) return;

      const viewport = useBoardStore.getState().document?.viewport ?? document.viewport;
      const visibleDocument = { ...document, viewport };
      beginSaveSession(projectId, savedProject.updatedAt);
      loadRemoteDocument(visibleDocument);
      onName(savedProject.name);
    };

    projectChannel = cloud
      .channel(`project:${projectId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` },
        (payload) => void apply(payload.new as ProjectRow),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` },
        () => void revoke(),
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          disconnected = true;
          return;
        }
        if (status === 'SUBSCRIBED' && disconnected) {
          disconnected = false;
          void reconcile();
        }
      });

    accessChannel = cloud
      .channel(`project-access:${projectId}:${userId}`, { config: { private: true } })
      .on('broadcast', { event: 'access-revoked' }, () => void revoke());

    void cloud.realtime
      .setAuth()
      .then(() => {
        if (!stopped) accessChannel?.subscribe();
      })
      .catch((error) => {
        if (!stopped) console.warn('Не удалось авторизовать realtime-канал доступа', error);
      });

    return closeChannels;
  }, [access, onName, onRevoked, projectId, userId]);
};
