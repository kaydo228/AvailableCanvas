/**
 * ВРЕМЯНКА. Копия STICKY_PALETTE из features/canvas/nodes/stickyPalette.ts.
 *
 * Оригинал лежит в зоне A, и правило style/noRestrictedImports справедливо
 * не пускает туда слайс зоны B. Запрос на вынос палитры в shared/ui заведён
 * в docs/CONTRACT-REQUESTS.md от 2026-08-25.
 *
 * Когда A перенесёт: удалить этот файл, заменить импорт на
 * `@/shared/ui/stickyPalette`. Значения обязаны совпадать с оригиналом —
 * расхождение даст стикеры двух разных жёлтых.
 */

export interface StickyColor {
  id: string;
  fill: string;
  text: string;
  label: string;
}

export const STICKY_PALETTE: readonly StickyColor[] = [
  { id: 'yellow', fill: '#FEF3A8', text: '#4A3E0B', label: 'Жёлтый' },
  { id: 'peach', fill: '#FFD9C0', text: '#5A3115', label: 'Персиковый' },
  { id: 'pink', fill: '#FBC9D9', text: '#5B1F35', label: 'Розовый' },
  { id: 'mint', fill: '#C4EBD3', text: '#12432A', label: 'Мятный' },
  { id: 'sky', fill: '#C6E2F7', text: '#123A5A', label: 'Голубой' },
  { id: 'lilac', fill: '#DCD3F5', text: '#33245E', label: 'Сиреневый' },
] as const;

/** Цвет текста для заливки. Для чужой заливки — тёмный по умолчанию. */
export const stickyTextColor = (fill: string): string =>
  STICKY_PALETTE.find((color) => color.fill === fill)?.text ?? '#1F2937';
