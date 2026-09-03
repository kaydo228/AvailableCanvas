/**
 * Единственная точка доступа к Supabase.
 *
 * Клиент создаётся лениво и ровно один раз: `createClient` держит сессию
 * и подписки, второй экземпляр даёт два независимых состояния входа.
 *
 * Переменных нет — облака нет. Это не ошибка и не отключённая функция,
 * а обычный режим работы: приложение остаётся полностью локальным, каким
 * оно и было до синхронизации.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface CloudEnv {
  url?: string | undefined;
  anonKey?: string | undefined;
}

/** Чистая фабрика: настройки внутрь, клиент или `null` наружу. Тестируется. */
export const createCloudClient = ({ url, anonKey }: CloudEnv): SupabaseClient | null => {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
};

/** `undefined` — ещё не создавали, `null` — создавали, настроек не было. */
let cached: SupabaseClient | null | undefined;

export const getCloud = (): SupabaseClient | null => {
  cached ??= createCloudClient({
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  });
  return cached;
};

/**
 * Подмена клиента. Нужна e2e: сети в тестах нет, а проверять надо весь путь
 * от кнопки до записи в IndexedDB.
 */
export const setCloud = (client: SupabaseClient | null): void => {
  cached = client;
};

export const cloudEnabled = (): boolean => getCloud() !== null;

// Ручка для e2e. Только в DEV: в сборке её нет, подменить клиент снаружи
// нельзя — иначе это дыра, а не тестовая ручка.
if (import.meta.env.DEV) {
  (window as unknown as { __cloud: { setCloud: typeof setCloud } }).__cloud = { setCloud };
}
