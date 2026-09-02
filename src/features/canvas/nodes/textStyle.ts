/**
 * Стиль текста → отрисовка: гарнитуры и цвет по умолчанию.
 *
 * Один список стеков на всех, кто рисует текст — Konva и <textarea> оверлея.
 * Разъедутся стеки — разъедутся метрики, и строка будет прыгать при входе
 * в правку и выходе из неё.
 */

import type { TextFont } from '@/shared/types/document';

export const FONT_STACKS: Record<TextFont, string> = {
  sans: 'Golos Text, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

/** Стек по ключу из модели. Ключа нет — гарнитура по умолчанию. */
export const fontStack = (font: TextFont | undefined): string => FONT_STACKS[font ?? 'sans'];

/**
 * Цвет текста по умолчанию — токен `--ink` из index.css, тот же, которым
 * набран интерфейс. Читается вычисленным: доска на тёмной теме тёмная
 * (`bg-paper`), и почти чёрный текст на ней невидим — новый узел выглядел
 * как «текст не создался».
 *
 * Значение не кэшируется намеренно, в отличие от цвета сетки: зовётся оно
 * один раз на создание узла, а не на кадр, зато так подхватывает и смену
 * темы, и системный медиазапрос без единой подписки.
 */
export const themeInk = (fallback: string): string => {
  if (typeof getComputedStyle !== 'function') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || fallback;
};
