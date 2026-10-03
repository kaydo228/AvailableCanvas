/**
 * Применение решений. Сами операции подменены — проверяется, что каждое
 * решение вызывает своё действие и ровно один раз: молчаливое «скачали вместо
 * выгрузили» стирает работу, и увидеть это постфактум нечем.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCloud } from './client';
import { applyDecisions, pullProject, remoteList, syncNow } from './pull';

const repo = vi.hoisted(() => ({
  listProjects: vi.fn(async () => [{ id: 'a', name: 'Доска', createdAt: 0, updatedAt: 100 }]),
  deleteProject: vi.fn(async () => undefined),
  overwriteProject: vi.fn(async () => undefined),
  getProject: vi.fn(async () => undefined),
  getDocument: vi.fn(async () => undefined),
}));
vi.mock('@/features/persistence', () => repo);

const states = vi.hoisted(() => ({
  allSyncStates: vi.fn(async () => [
    { projectId: 'a', owner: 'user-1', remoteUpdatedAt: 100, dirty: false },
  ]),
  readSyncState: vi.fn(async () => undefined),
  writeSyncState: vi.fn(async () => undefined),
  forgetSyncState: vi.fn(async () => undefined),
}));
vi.mock('@/features/persistence/syncStore', () => states);

const stubCloud = (
  projects: { data: unknown; error: unknown },
  memberships: { data: unknown; error: unknown } = { data: [], error: null },
) =>
  ({
    from: (table: string) => ({
      select: () => {
        if (table === 'projects') {
          const result = Promise.resolve(projects);
          return Object.assign(result, {
            eq: vi.fn(() => {
              throw new Error('projects must not be filtered by owner');
            }),
          });
        }

        return { eq: vi.fn(async () => memberships) };
      },
    }),
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  setCloud(null);
});

const spies = () => ({
  push: vi.fn(async () => true),
  pull: vi.fn(async () => true),
  deleteLocal: vi.fn(async () => {}),
});

describe('applyDecisions', () => {
  it('каждое решение зовёт своё действие', async () => {
    const actions = spies();

    await applyDecisions(
      [
        { kind: 'push', projectId: 'a' },
        { kind: 'pull', projectId: 'b' },
        { kind: 'delete-local', projectId: 'c' },
        { kind: 'nothing', projectId: 'd' },
      ],
      actions,
    );

    expect(actions.push).toHaveBeenCalledTimes(1);
    expect(actions.push).toHaveBeenCalledWith('a');
    expect(actions.pull).toHaveBeenCalledTimes(1);
    expect(actions.pull).toHaveBeenCalledWith('b');
    expect(actions.deleteLocal).toHaveBeenCalledTimes(1);
    expect(actions.deleteLocal).toHaveBeenCalledWith('c');
  });

  it('отказ на одной доске не останавливает остальные', async () => {
    const actions = spies();
    actions.push.mockRejectedValueOnce(new Error('нет сети'));

    await applyDecisions(
      [
        { kind: 'push', projectId: 'a' },
        { kind: 'pull', projectId: 'b' },
      ],
      actions,
    );

    expect(actions.pull).toHaveBeenCalledTimes(1);
    expect(actions.pull).toHaveBeenCalledWith('b');
  });
});

describe('remoteList', () => {
  it('ошибка сервера — null, а не пустой список', async () => {
    // Пустой массив здесь означал бы «у владельца нет ни одной доски», и
    // каждая ранее синхронизированная доска получила бы delete-local.
    setCloud(stubCloud({ data: null, error: { message: 'JWT expired' } }));

    expect(await remoteList('user-1')).toBeNull();
  });

  it('сервер ответил пустым списком — это пустой список, а не отказ', async () => {
    setCloud(stubCloud({ data: [], error: null }));

    expect(await remoteList('user-1')).toEqual([]);
  });

  it('облака нет вовсе — тоже null: спросить было некого', async () => {
    setCloud(null);

    expect(await remoteList('user-1')).toBeNull();
  });

  it('возвращает owned и shared проекты с вычисленной ролью', async () => {
    setCloud(
      stubCloud(
        {
          data: [
            {
              id: 'owned',
              owner: 'user-1',
              updated_at: '2026-09-18T10:00:00.000Z',
              revision: 4,
            },
            {
              id: 'shared',
              owner: 'user-2',
              updated_at: '2026-09-18T11:00:00.000Z',
              revision: 7,
            },
          ],
          error: null,
        },
        { data: [{ project_id: 'shared', role: 'editor' }], error: null },
      ),
    );

    expect(await remoteList('user-1')).toEqual([
      {
        id: 'owned',
        owner: 'user-1',
        updatedAt: Date.parse('2026-09-18T10:00:00.000Z'),
        revision: 4,
        access: 'owner',
      },
      {
        id: 'shared',
        owner: 'user-2',
        updatedAt: Date.parse('2026-09-18T11:00:00.000Z'),
        revision: 7,
        access: 'editor',
      },
    ]);
  });

  it('отбрасывает доступную строку без роли', async () => {
    setCloud(
      stubCloud({
        data: [
          {
            id: 'orphan',
            owner: 'user-2',
            updated_at: '2026-09-18T11:00:00.000Z',
            revision: 1,
          },
        ],
        error: null,
      }),
    );

    expect(await remoteList('user-1')).toEqual([]);
  });
});

describe('pullProject', () => {
  it('stores owner, access, revision and public state from remote metadata', async () => {
    const row = {
      id: 'shared',
      owner: 'user-2',
      name: 'Общая',
      created_at: '2026-09-18T09:00:00.000Z',
      updated_at: '2026-09-18T11:00:00.000Z',
      thumbnail: null,
      document: {
        projectId: 'shared',
        schemaVersion: 1,
        nodes: {},
        order: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        background: { color: '#fff', grid: 'dots' },
      },
      is_public: false,
      revision: 7,
    };
    setCloud({
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }),
      }),
    } as never);

    await pullProject({
      id: 'shared',
      owner: 'user-2',
      updatedAt: Date.parse(row.updated_at),
      revision: 7,
      access: 'editor',
    });

    expect(states.writeSyncState).toHaveBeenCalledWith({
      projectId: 'shared',
      owner: 'user-2',
      access: 'editor',
      remoteRevision: 7,
      remoteUpdatedAt: Date.parse(row.updated_at),
      dirty: false,
      isPublic: false,
    });
  });
});

describe('syncNow', () => {
  it('ошибка списка не удаляет ни одной локальной доски', async () => {
    setCloud(stubCloud({ data: null, error: { message: 'сеть недоступна' } }));

    await syncNow('user-1');

    expect(repo.deleteProject).not.toHaveBeenCalled();
    expect(states.forgetSyncState).not.toHaveBeenCalled();
  });

  it('сервер и правда пуст — синхронизированная доска удаляется', async () => {
    setCloud(stubCloud({ data: [], error: null }));

    await syncNow('user-1');

    expect(repo.deleteProject).toHaveBeenCalledWith('a');
  });
});
