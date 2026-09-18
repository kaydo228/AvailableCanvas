/**
 * Кто вошёл. Тонкая обёртка над Supabase Auth: наружу отдаётся id и почта,
 * сам объект сессии за пределы слайса не выходит.
 *
 * `ready` отделяет «ещё не спросили» от «не вошёл»: без него интерфейс на
 * первом кадре показывает кнопку «Войти» тому, кто уже вошёл, и она моргает.
 */

import { create } from 'zustand';

import { getCloud } from './client';

interface SessionState {
  userId: string | null;
  email: string | null;
  ready: boolean;
}

export interface AuthResult {
  error: string | null;
  needsConfirmation: boolean;
}

export const useSession = create<SessionState>()(() => ({
  userId: null,
  email: null,
  ready: false,
}));

/** Подписка на вход и выход. Зовётся один раз при старте приложения. */
export const initSession = (): void => {
  const cloud = getCloud();
  if (!cloud) {
    useSession.setState({ ready: true });
    return;
  }

  void cloud.auth.getSession().then(({ data }) => {
    useSession.setState({
      userId: data.session?.user.id ?? null,
      email: data.session?.user.email ?? null,
      ready: true,
    });
  });

  cloud.auth.onAuthStateChange((_event, session) => {
    useSession.setState({
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      ready: true,
    });
  });
};

const MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Неверная почта или пароль',
  'User already registered': 'Эта почта уже зарегистрирована — войдите',
  'Password should be at least 6 characters': 'Пароль короче шести символов',
  'Email not confirmed': 'Почта не подтверждена — проверьте письмо',
};

/** Ответ сервера → фраза для человека. Незнакомое пропускаем как есть. */
export const authErrorText = (message: string): string =>
  MESSAGES[message] ?? (message || 'Не удалось связаться с сервером');

export const signIn = async (email: string, password: string): Promise<AuthResult> => {
  const cloud = getCloud();
  if (!cloud) return { error: 'Синхронизация не настроена', needsConfirmation: false };
  const { error } = await cloud.auth.signInWithPassword({ email, password });
  return { error: error ? authErrorText(error.message) : null, needsConfirmation: false };
};

export const signUp = async (email: string, password: string): Promise<AuthResult> => {
  const cloud = getCloud();
  if (!cloud) return { error: 'Синхронизация не настроена', needsConfirmation: false };
  const { data, error } = await cloud.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
  });
  return {
    error: error ? authErrorText(error.message) : null,
    needsConfirmation: !error && data.session === null,
  };
};

export const signOut = async (): Promise<void> => {
  await getCloud()?.auth.signOut();
};
