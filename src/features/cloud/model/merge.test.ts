/**
 * Правило слияния. Чистая таблица «что локально × что на сервере → что делать».
 *
 * Тут закреплён самый опасный случай: доска, которой нет на сервере, удаляется
 * локально ТОЛЬКО если она там раньше была. Иначе первый же вход стёр бы всё,
 * что человек успел нарисовать до регистрации.
 */

import { describe, expect, it } from 'vitest';

import { decide } from './merge';

const ME = 'user-1';
const local = (projectId: string, updatedAt: number, state?: object) => ({
  projectId,
  updatedAt,
  ...(state ? { state: { projectId, dirty: false, ...state } } : {}),
});

describe('decide', () => {
  it('локальная новее — выгружаем', () => {
    const out = decide(
      [local('a', 200, { owner: ME, remoteUpdatedAt: 100 })],
      [{ id: 'a', updatedAt: 100 }],
      ME,
    );
    expect(out).toEqual([{ kind: 'push', projectId: 'a' }]);
  });

  it('на сервере новее — скачиваем', () => {
    const out = decide(
      [local('a', 100, { owner: ME, remoteUpdatedAt: 100 })],
      [{ id: 'a', updatedAt: 200 }],
      ME,
    );
    expect(out).toEqual([{ kind: 'pull', projectId: 'a' }]);
  });

  it('времена равны и правок нет — ничего', () => {
    const out = decide(
      [local('a', 100, { owner: ME, remoteUpdatedAt: 100 })],
      [{ id: 'a', updatedAt: 100 }],
      ME,
    );
    expect(out).toEqual([{ kind: 'nothing', projectId: 'a' }]);
  });

  it('времена равны, но есть невыгруженные правки — выгружаем', () => {
    const out = decide(
      [local('a', 100, { owner: ME, remoteUpdatedAt: 100, dirty: true })],
      [{ id: 'a', updatedAt: 100 }],
      ME,
    );
    expect(out).toEqual([{ kind: 'push', projectId: 'a' }]);
  });

  it('была на сервере, там её больше нет — удаляем локально', () => {
    const out = decide([local('a', 100, { owner: ME, remoteUpdatedAt: 100 })], [], ME);
    expect(out).toEqual([{ kind: 'delete-local', projectId: 'a' }]);
  });

  it('НИКОГДА не выгружалась и не наша — не трогаем', () => {
    // Доска, нарисованная до входа. Забирать её в аккаунт молча нельзя.
    expect(decide([local('a', 100)], [], ME)).toEqual([{ kind: 'nothing', projectId: 'a' }]);
  });

  it('закреплена за нами, но ещё не уехала — выгружаем', () => {
    const out = decide([local('a', 100, { owner: ME })], [], ME);
    expect(out).toEqual([{ kind: 'push', projectId: 'a' }]);
  });

  it('доска другого пользователя на этом устройстве — не трогаем', () => {
    const out = decide([local('a', 100, { owner: 'user-2', remoteUpdatedAt: 100 })], [], ME);
    expect(out).toEqual([{ kind: 'nothing', projectId: 'a' }]);
  });

  it('есть на сервере, нет локально — скачиваем', () => {
    expect(decide([], [{ id: 'b', updatedAt: 500 }], ME)).toEqual([
      { kind: 'pull', projectId: 'b' },
    ]);
  });
});
