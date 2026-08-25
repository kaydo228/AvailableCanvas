/**
 * Палитра стикеров. Шесть заливок — как у бумажных, приглушённых:
 * кислотные цвета на доске из тридцати стикеров быстро становятся невыносимы.
 *
 * Цвет текста хранится рядом с заливкой, а не подбирается на лету: подбор
 * по контрасту даёт грязноватый серый на светлых заливках, а тут значения
 * выбраны глазами.
 */

export interface StickyColor {
  id: string;
  /** Заливка стикера. */
  fill: string;
  /** Цвет текста, читаемый на этой заливке. */
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

export const DEFAULT_STICKY_COLOR: StickyColor = STICKY_PALETTE[0] as StickyColor;

export function stickyColorByFill(fill: string): StickyColor | undefined {
  return STICKY_PALETTE.find((color) => color.fill === fill);
}

/** Цвет текста для заливки. Для чужой заливки — тёмный по умолчанию. */
export function stickyTextColor(fill: string): string {
  return stickyColorByFill(fill)?.text ?? '#1F2937';
}
