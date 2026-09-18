/**
 * Форма строки, которая уезжает на сервер. Проверяется то, что молча разъедется:
 * время в Postgres — строка ISO, а сравниваем мы миллисекунды, и обратный разбор
 * обязан давать ровно то же число.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { doc, shape } from '@/shared/model/fixtures';
import { setCloud } from './client';
import { deleteRemote, pushProject, rowUpdatedAt, toRow } from './push';

const repo = vi.hoisted(() => ({
  getProject: vi.fn(async () => ({ id: 'p1', name: 'Доска', createdAt: 0, updatedAt: 100 })),
  getDocument: vi.fn(async () => ({
    projectId: 'p1',
    schemaVersion: 1,
    nodes: {},
    order: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    background: { color: '#fff', grid: 'dots' },
  })),
}));
vi.mock('@/features/persistence', () => repo);

const states = vi.hoisted(() => ({
  readSyncState: vi.fn(async (): Promise<unknown> => undefined),
  writeSyncState: vi.fn(async () => undefined),
}));
vi.mock('@/features/persistence/syncStore', () => states);

const images = vi.hoisted(() => ({ uploadImages: vi.fn(async () => true) }));
vi.mock('./images', () => images);

const rpc = vi.fn(
  async (): Promise<{
    data: { revision: number; updated_at: string; updated_by: string }[] | null;
    error: unknown;
  }> => ({
    data: [
      {
        revision: 1,
        updated_at: new Date(100).toISOString(),
        updated_by: 'user-1',
      },
    ],
    error: null,
  }),
);
const deleteEq = vi.fn(async () => ({ error: null }));
const stubCloud = () =>
  setCloud({
    rpc,
    from: () => ({ delete: () => ({ eq: deleteEq }) }),
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  states.readSyncState.mockResolvedValue(undefined);
  stubCloud();
});

const project = {
  id: 'p1',
  name: 'Доска',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_500_000,
};

describe('toRow', () => {
  it('кладёт документ целиком и владельца', () => {
    const row = toRow(project, doc([shape('a')]), 'user-1', false);

    expect(row.id).toBe('p1');
    expect(row.owner).toBe('user-1');
    expect(row.is_public).toBe(false);
    expect(Object.keys(row.document.nodes)).toEqual(['a']);
  });

  it('время уходит строкой ISO и разбирается обратно без потерь', () => {
    const row = toRow(project, doc([]), 'user-1', false);

    expect(row.updated_at).toBe(new Date(1_700_000_500_000).toISOString());
    expect(rowUpdatedAt(row.updated_at)).toBe(1_700_000_500_000);
  });

  it('превью может не быть — это null, а не undefined', () => {
    // undefined в jsonb превращается в отсутствие поля, и строка на сервере
    // начинает отличаться от строки локально.
    expect(toRow(project, doc([]), 'user-1', false).thumbnail).toBeNull();
  });
});

describe('pushProject: согласие и владелец', () => {
  it('доска без записи синхронизации уезжает на сервер', async () => {
    expect(await pushProject('p1', 'user-1')).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'save_project',
      expect.objectContaining({ p_project_id: 'p1' }),
    );
    expect(images.uploadImages).toHaveBeenCalledWith(expect.anything(), 'p1');
    expect(states.writeSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        owner: 'user-1',
        access: 'owner',
        remoteRevision: 1,
        dirty: false,
      }),
    );
  });

  it('editor сохраняет новую ревизию, не становясь владельцем', async () => {
    states.readSyncState.mockResolvedValue({
      projectId: 'p1',
      owner: 'owner-1',
      access: 'editor',
      remoteRevision: 3,
      dirty: true,
    });
    rpc.mockResolvedValueOnce({
      data: [
        {
          revision: 4,
          updated_at: new Date(100).toISOString(),
          updated_by: 'editor-1',
        },
      ],
      error: null,
    });

    expect(await pushProject('p1', 'editor-1')).toBe(true);
    expect(states.writeSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'owner-1',
        access: 'editor',
        remoteRevision: 4,
        dirty: false,
      }),
    );
  });

  it('viewer не загружает картинки и не вызывает RPC', async () => {
    states.readSyncState.mockResolvedValue({
      projectId: 'p1',
      owner: 'owner-1',
      access: 'viewer',
      remoteRevision: 3,
      dirty: true,
    });

    expect(await pushProject('p1', 'viewer-1')).toBe(false);
    expect(images.uploadImages).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('ошибка RPC сохраняет прежнюю серверную ревизию', async () => {
    states.readSyncState.mockResolvedValue({
      projectId: 'p1',
      owner: 'owner-1',
      access: 'editor',
      remoteUpdatedAt: 50,
      remoteRevision: 3,
      dirty: true,
    });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });

    expect(await pushProject('p1', 'editor-1')).toBe(false);
    expect(states.writeSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'owner-1',
        access: 'editor',
        remoteUpdatedAt: 50,
        remoteRevision: 3,
        dirty: true,
      }),
    );
  });

  it('на вопрос о переносе ответили отказом — доска не уезжает', async () => {
    // Отказ обязан пережить любую правку доски: иначе «Оставить локальными»
    // отменяется первым же сдвигом узла.
    states.readSyncState.mockResolvedValue({ projectId: 'p1', dirty: false, declined: true });

    expect(await pushProject('p1', 'user-1')).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(states.writeSyncState).not.toHaveBeenCalled();
  });

  it('доска другого пользователя не уезжает в чужой аккаунт', async () => {
    states.readSyncState.mockResolvedValue({ projectId: 'p1', dirty: false, owner: 'user-2' });

    expect(await pushProject('p1', 'user-1')).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(states.writeSyncState).not.toHaveBeenCalled();
  });
});

describe('deleteRemote', () => {
  it('удаление прошло — true', async () => {
    expect(await deleteRemote('p1')).toBe(true);
  });

  it('сервер отказал — false, а не молчание', async () => {
    deleteEq.mockResolvedValue({ error: { message: 'сеть недоступна' } } as never);

    expect(await deleteRemote('p1')).toBe(false);
  });
});
