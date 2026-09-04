/**
 * Какие доски вообще можно предложить перенести. Ошибка здесь означает
 * вопрос «перенести 12 досок?» тому, у кого все двенадцать уже в аккаунте,
 * — или, хуже, предложение утащить доски другого пользователя.
 */

import { describe, expect, it } from 'vitest';

import { adoptable } from './adopt';

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
