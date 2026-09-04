/**
 * Применение решений. Сами операции подменены — проверяется, что каждое
 * решение вызывает своё действие и ровно один раз: молчаливое «скачали вместо
 * выгрузили» стирает работу, и увидеть это постфактум нечем.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCloud } from './client';
import { applyDecisions, remoteList, syncNow } from './pull';

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

/** Клиент, у которого список досок владельца отвечает заданным исходом. */
const stubCloud = (answer: { data: unknown; error: unknown }) =>
  ({
    from: () => ({ select: () => ({ eq: async () => answer }) }),
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
