/**
 * Ответ сервера — не сообщение пользователю. Здесь закреплён перевод:
 * человек должен понять, что делать, а не читать английскую строку из API.
 */

import { describe, expect, it } from 'vitest';

import { authErrorText } from './session';

describe('authErrorText', () => {
  it('неверная пара логин-пароль', () => {
    expect(authErrorText('Invalid login credentials')).toBe('Неверная почта или пароль');
  });

  it('такой пользователь уже есть', () => {
    expect(authErrorText('User already registered')).toBe(
      'Эта почта уже зарегистрирована — войдите',
    );
  });

  it('короткий пароль', () => {
    expect(authErrorText('Password should be at least 6 characters')).toBe(
      'Пароль короче шести символов',
    );
  });

  it('незнакомую ошибку показываем как есть, а не глотаем', () => {
    expect(authErrorText('Service unavailable')).toBe('Service unavailable');
  });

  it('пустой ответ тоже должен что-то сказать', () => {
    expect(authErrorText('')).toBe('Не удалось связаться с сервером');
  });
});
