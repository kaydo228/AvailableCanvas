/**
 * Ответ сервера — не сообщение пользователю. Здесь закреплён перевод:
 * человек должен понять, что делать, а не читать английскую строку из API.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { setCloud } from './client';
import { authErrorText, signUp } from './session';

afterEach(() => setCloud(null));

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

describe('signUp', () => {
  it('просит Supabase вернуть подтверждение на адрес открытого приложения', async () => {
    const signUpWithPassword = vi.fn(async () => ({ data: { session: null }, error: null }));
    setCloud({ auth: { signUp: signUpWithPassword } } as never);

    await expect(signUp('me@example.com', 'secret123')).resolves.toMatchObject({
      needsConfirmation: true,
    });
    expect(signUpWithPassword).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'secret123',
      options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
    });
  });
});
