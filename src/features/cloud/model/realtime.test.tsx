import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { beginSaveSession, loadRemoteDocument, useAutosave } from '@/features/persistence/autosave';
import { doc, shape } from '@/shared/model/fixtures';
import { useBoardStore } from '@/shared/store/board';
import type { BoardDocument, Project } from '@/shared/types/document';

import type { ProjectRow } from './push';
import { applyRemoteProjectRow, useProjectRealtime } from './realtime';

const deps = vi.hoisted(() => ({
  overwriteProject: vi.fn(async (_project: Project, _document: BoardDocument) => undefined),
  removeRevokedProject: vi.fn(async () => undefined),
  getProject: vi.fn(async () => ({
    id: 'p1',
    name: 'После reconnect',
    createdAt: 1,
    updatedAt: 9,
  })),
  getDocument: vi.fn(async () => doc([shape('from-reconnect')])),
  readSyncState: vi.fn(async () => ({
    projectId: 'p1',
    owner: 'owner-1',
    access: 'editor' as const,
    remoteRevision: 4,
    remoteUpdatedAt: 4,
    dirty: false,
    isPublic: false,
  })),
  writeSyncState: vi.fn(async () => undefined),
  remoteList: vi.fn(async () => [
    {
      id: 'p1',
      owner: 'owner-1',
      access: 'editor' as const,
      revision: 7,
      updatedAt: 7,
    },
  ]),
  pullProject: vi.fn(async () => true),
  saveDocument: vi.fn(async () => ({ ok: true as const, updatedAt: 10 })),
  getCloud: vi.fn(),
}));

vi.mock('@/features/persistence', () => ({
  getDocument: deps.getDocument,
  getProject: deps.getProject,
  overwriteProject: deps.overwriteProject,
  removeRevokedProject: deps.removeRevokedProject,
}));
vi.mock('@/features/persistence/projectsRepo', () => ({ saveDocument: deps.saveDocument }));
vi.mock('@/features/persistence/syncStore', () => ({
  readSyncState: deps.readSyncState,
  writeSyncState: deps.writeSyncState,
}));
vi.mock('./pull', () => ({ remoteList: deps.remoteList, pullProject: deps.pullProject }));
vi.mock('./client', () => ({ getCloud: deps.getCloud }));
vi.mock('./session', () => ({
  useSession: (selector: (state: { userId: string }) => unknown) => selector({ userId: 'owner-1' }),
}));

const localViewport = { x: 10, y: 20, zoom: 2 };

const remoteRow = (patch: Partial<ProjectRow> = {}): ProjectRow => ({
  id: 'p1',
  owner: 'owner-1',
  name: 'Общая доска',
  created_at: '2026-09-18T10:00:00.000Z',
  updated_at: '2026-09-18T11:00:00.000Z',
  thumbnail: null,
  document: {
    ...doc([shape('remote')]),
    viewport: { x: 900, y: 800, zoom: 0.5 },
  },
  is_public: false,
  revision: 5,
  updated_by: 'editor-2',
  ...patch,
});

type ChannelHandler = {
  type: string;
  filter: Record<string, unknown>;
  callback: (payload: Record<string, unknown>) => void;
};

class FakeChannel {
  handlers: ChannelHandler[] = [];
  status: ((status: string) => void) | undefined;

  constructor(readonly topic: string) {}

  on(type: string, filter: Record<string, unknown>, callback: ChannelHandler['callback']) {
    this.handlers.push({ type, filter, callback });
    return this;
  }

  subscribe(callback?: (status: string) => void) {
    this.status = callback;
    return this;
  }

  emit(type: string, event: string, payload: Record<string, unknown> = {}) {
    this.handlers
      .find((handler) => handler.type === type && handler.filter.event === event)
      ?.callback(payload);
  }
}

const channels: FakeChannel[] = [];
const removeChannel = vi.fn(async () => 'ok');
const setAuth = vi.fn(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  channels.length = 0;
  useBoardStore.getState().closeDocument();
  deps.getCloud.mockReturnValue({
    realtime: { setAuth },
    channel: (topic: string) => {
      const channel = new FakeChannel(topic);
      channels.push(channel);
      return channel;
    },
    removeChannel,
  });
});

afterEach(() => {
  useBoardStore.getState().closeDocument();
  vi.useRealTimers();
});

describe('applyRemoteProjectRow', () => {
  it('applies a newer foreign revision, but preserves the local viewport', async () => {
    useBoardStore.getState().loadDocument({ ...doc([]), viewport: localViewport });

    const result = await applyRemoteProjectRow(remoteRow(), {
      userId: 'owner-1',
      currentViewport: localViewport,
      remoteRevision: 4,
    });

    expect(result).toEqual({ applied: true, name: 'Общая доска' });
    expect(deps.overwriteProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', name: 'Общая доска' }),
      expect.objectContaining({ viewport: localViewport }),
    );
    expect(useBoardStore.getState().document).toEqual(
      expect.objectContaining({ viewport: localViewport }),
    );
    expect(deps.writeSyncState).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', remoteRevision: 5, dirty: false }),
    );
  });

  it('ignores the same or an older revision', async () => {
    expect(
      await applyRemoteProjectRow(remoteRow({ revision: 4 }), {
        userId: 'owner-1',
        currentViewport: localViewport,
        remoteRevision: 4,
      }),
    ).toEqual({ applied: false });

    expect(deps.overwriteProject).not.toHaveBeenCalled();
    expect(deps.writeSyncState).not.toHaveBeenCalled();
  });

  it('for the current writer advances metadata without replacing the document', async () => {
    const result = await applyRemoteProjectRow(remoteRow({ updated_by: 'owner-1' }), {
      userId: 'owner-1',
      currentViewport: localViewport,
      remoteRevision: 4,
    });

    expect(result).toEqual({ applied: false });
    expect(deps.overwriteProject).not.toHaveBeenCalled();
    expect(deps.writeSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteRevision: 5,
        remoteUpdatedAt: Date.parse(remoteRow().updated_at),
      }),
    );
  });

  it('repairs remote content before applying it', async () => {
    await applyRemoteProjectRow(
      remoteRow({
        document: {
          ...remoteRow().document,
          nodes: { remote: { ...shape('remote'), opacity: 99 } },
        },
      }),
      { userId: 'owner-1', currentViewport: localViewport, remoteRevision: 4 },
    );

    const applied = deps.overwriteProject.mock.calls[0]?.[1];
    expect(applied?.viewport).toEqual(localViewport);
    expect(applied?.nodes.remote?.opacity).toBe(1);
  });

  it('logs and ignores a malformed payload', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await applyRemoteProjectRow(null, {
      userId: 'owner-1',
      currentViewport: localViewport,
      remoteRevision: 4,
    });

    expect(result).toEqual({ applied: false });
    expect(warn).toHaveBeenCalled();
    expect(deps.overwriteProject).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('remote autosave boundary', () => {
  it('skips exactly one remote load, then saves the next ordinary edit', async () => {
    vi.useFakeTimers();
    const initial = doc([shape('a')]);
    useBoardStore.getState().loadDocument(initial);
    beginSaveSession('p1', 1);
    const { unmount } = renderHook(() => useAutosave());

    act(() => loadRemoteDocument({ ...initial, nodes: { ...initial.nodes } }));
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(deps.saveDocument).not.toHaveBeenCalled();

    act(() => useBoardStore.getState().updateNode('a', { x: 42 }));
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(deps.saveDocument).toHaveBeenCalledTimes(1);

    unmount();
  });
});

describe('useProjectRealtime', () => {
  it('revokes once for delete and access broadcast, then removes both channels on cleanup', async () => {
    const onRevoked = vi.fn();
    const { unmount } = renderHook(() =>
      useProjectRealtime({ projectId: 'p1', access: 'editor', onName: vi.fn(), onRevoked }),
    );
    await waitFor(() => expect(channels).toHaveLength(2));

    act(() => {
      channels
        .find((channel) => channel.topic === 'project:p1')
        ?.emit('postgres_changes', 'DELETE');
      channels
        .find((channel) => channel.topic.includes('project-access:'))
        ?.emit('broadcast', 'access-revoked');
    });

    await waitFor(() => expect(deps.removeRevokedProject).toHaveBeenCalledTimes(1));
    expect(onRevoked).toHaveBeenCalledTimes(1);

    unmount();
    expect(removeChannel).toHaveBeenCalledTimes(2);
  });

  it('pulls after a broken connection subscribes again', async () => {
    const onName = vi.fn();
    renderHook(() =>
      useProjectRealtime({ projectId: 'p1', access: 'editor', onName, onRevoked: vi.fn() }),
    );
    await waitFor(() => expect(channels).toHaveLength(2));

    const projectChannel = channels.find((channel) => channel.topic === 'project:p1');
    act(() => {
      projectChannel?.status?.('SUBSCRIBED');
      projectChannel?.status?.('CHANNEL_ERROR');
      projectChannel?.status?.('SUBSCRIBED');
    });

    await waitFor(() => expect(deps.pullProject).toHaveBeenCalledTimes(1));
    expect(deps.remoteList).toHaveBeenCalledWith('owner-1');
    expect(onName).toHaveBeenCalledWith('После reconnect');
  });
});
