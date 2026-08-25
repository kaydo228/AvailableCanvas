/**
 * Подбор кегля под рамку. Вынесен из компонента, чтобы тестировать
 * без рендера, и принимает функцию измерения параметром — в jsdom
 * настоящего измерения текста нет, и подгонять тест под ноль нельзя.
 */

/** Габариты текста при заданном кегле и ограничении по ширине. */
export type MeasureText = (
  text: string,
  fontSize: number,
  maxWidth: number,
) => { width: number; height: number };

export interface FitOptions {
  text: string;
  maxWidth: number;
  maxHeight: number;
  /** Кегль, с которого начинаем уменьшать. */
  fontSize: number;
  minFontSize?: number;
  measure: MeasureText;
}

export interface FitResult {
  fontSize: number;
  /** true — не влезло даже на минимальном кегле, текст придётся обрезать. */
  overflow: boolean;
}

export const MIN_FONT_SIZE = 8;

/**
 * Наибольший кегль из диапазона, при котором текст помещается в рамку.
 *
 * Идём вниз с шагом в 1: диапазон кеглей маленький (обычно 18 → 8),
 * бинарный поиск здесь экономил бы три вызова измерения ценой того,
 * что при немонотонном переносе слов он может промахнуться.
 */
export function fitFontSize({
  text,
  maxWidth,
  maxHeight,
  fontSize,
  minFontSize = MIN_FONT_SIZE,
  measure,
}: FitOptions): FitResult {
  if (text.trim().length === 0) return { fontSize, overflow: false };
  if (maxWidth <= 0 || maxHeight <= 0) {
    return { fontSize: minFontSize, overflow: true };
  }

  const start = Math.max(fontSize, minFontSize);

  for (let size = start; size >= minFontSize; size -= 1) {
    const box = measure(text, size, maxWidth);
    if (box.height <= maxHeight && box.width <= maxWidth) {
      return { fontSize: size, overflow: false };
    }
  }

  return { fontSize: minFontSize, overflow: true };
}

/**
 * Измерение через canvas. Переносит по словам так же, как Konva с wrap='word',
 * поэтому подобранный кегль совпадает с тем, что реально отрисуется.
 *
 * Если контекста нет (jsdom без пакета canvas) — возвращает нули, и подбор
 * вырождается в «взять исходный кегль». Это осознанно: лучше не ужать,
 * чем ужать по выдуманным цифрам.
 */
export const measureWithCanvas: MeasureText = (text, fontSize, maxWidth) => {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return { width: 0, height: 0 };

  context.font = `${fontSize}px Inter, system-ui, sans-serif`;

  const lineHeight = fontSize * 1.3;
  let widest = 0;
  let lines = 0;

  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (context.measureText(candidate).width > maxWidth && current) {
        widest = Math.max(widest, context.measureText(current).width);
        lines += 1;
        current = word;
      } else {
        current = candidate;
      }
    }
    widest = Math.max(widest, context.measureText(current).width);
    lines += 1;
  }

  return { width: widest, height: lines * lineHeight };
};
