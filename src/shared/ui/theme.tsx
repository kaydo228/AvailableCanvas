/**
 * Тема оформления: светлая, тёмная, системная.
 *
 * Цвета живут в токенах `src/index.css` — здесь только переключение атрибута
 * `data-theme` на <html>. Значение по умолчанию — «системная»: атрибута нет,
 * и решает медиазапрос. Первичная установка темы делается скриптом в
 * index.html до отрисовки, иначе тёмная страница моргает белым.
 */

import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const KEY = 'prostor-theme';
const listeners = new Set<() => void>();

const read = (): Theme => {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'dark' || value === 'light' ? value : 'system';
  } catch {
    return 'system';
  }
};

/** Кэш для useSyncExternalStore: getSnapshot обязан возвращать одно и то же значение. */
let current: Theme = read();

const apply = (theme: Theme) => {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
};

export const setTheme = (theme: Theme) => {
  current = theme;
  apply(theme);
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Приватный режим: тема просто не переживёт перезагрузку.
  }
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useTheme = (): Theme =>
  useSyncExternalStore(
    subscribe,
    () => current,
    () => 'system' as Theme,
  );

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Theme, string> = {
  system: 'Тема: как в системе',
  light: 'Тема: светлая',
  dark: 'Тема: тёмная',
};
const ICON = { system: Monitor, light: Sun, dark: Moon };

/**
 * Одна кнопка на три состояния: подпись говорит, что сейчас, а не что будет —
 * иначе по индикатору нельзя прочитать текущее состояние.
 */
export const ThemeToggle = ({ className = '' }: { className?: string }) => {
  const theme = useTheme();
  const Icon = ICON[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[theme])}
      title={LABEL[theme]}
      aria-label={LABEL[theme]}
      className={`grid size-8 place-items-center rounded-md text-pencil transition-colors hover:bg-well hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
};
