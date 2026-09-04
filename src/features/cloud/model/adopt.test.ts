/**
 * Какие доски вообще можно предложить перенести. Ошибка здесь означает
 * вопрос «перенести 12 досок?» тому, у кого все двенадцать уже в аккаунте,
 * — или, хуже, предложение утащить доски другого пользователя.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adoptable, adoptBoards, declineAdoption } from './adopt';

const states = vi.hoisted(() => ({
  writeSyncState: vi.fn(async (_state: unknown) => undefined),
}));
vi.mock('@/features/persistence/syncStore', () => states);

beforeEach(() => vi.clearAllMocks());

describe('adoptable', () => {
  it('доска без владельца — можно предложить', () => {
    expect(adoptable([{ projectId: 'a', updatedAt: 1 }])).toEqual(['a']);
  });

  it('доска уже за кем-то закреплена — не предлагаем', () => {
    expect(
      adoptable([
        { projectId: 'a', updatedAt: 1, state: { projectId: 'a', dirty: false, owner: 'user-2' } },
      ]),
    ).toEqual([]);
  });

  it('на вопрос уже ответили «нет» — второй раз не спрашиваем', () => {
    expect(
      adoptable([
        { projectId: 'a', updatedAt: 1, state: { projectId: 'a', dirty: false, declined: true } },
      ]),
    ).toEqual([]);
  });
});

describe('adoptBoards', () => {
  it('закрепляет каждую доску за владельцем и помечает невыгруженной', async () => {
    await adoptBoards(['a', 'b'], 'user-1');

    expect(states.writeSyncState).toHaveBeenCalledTimes(2);
    expect(states.writeSyncState).toHaveBeenNthCalledWith(1, {
      projectId: 'a',
      owner: 'user-1',
      dirty: true,
    });
    expect(states.writeSyncState).toHaveBeenNthCalledWith(2, {
      projectId: 'b',
      owner: 'user-1',
      dirty: true,
    });
  });
});

describe('declineAdoption', () => {
  it('запоминает отказ и НЕ проставляет владельца', async () => {
    await declineAdoption(['a']);

    expect(states.writeSyncState).toHaveBeenCalledWith({
      projectId: 'a',
      dirty: false,
      declined: true,
    });
  });

  it('после отказа доску больше не предлагают', async () => {
    // Проверка пары «записали → перестали спрашивать» целиком: по отдельности
    // обе половины зелены и на разъехавшемся поле.
    await declineAdoption(['a']);
    const state = states.writeSyncState.mock.calls[0]?.[0] as never;

    expect(adoptable([{ projectId: 'a', updatedAt: 1, state }])).toEqual([]);
  });
});
