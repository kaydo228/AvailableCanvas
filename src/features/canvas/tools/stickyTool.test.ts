import { describe, expect, it } from 'vitest';

import { fitFontSize, MIN_FONT_SIZE } from '@/features/canvas/nodes/fitText';
import type { MeasureText } from '@/features/canvas/nodes/fitText';
import { STICKY_PALETTE } from '@/features/canvas/nodes/stickyPalette';
import {
  DEFAULT_STICKY_FONT_SIZE,
  DEFAULT_STICKY_SIZE,
  MIN_STICKY_SIDE,
  stickyFromDrag,
} from '@/features/canvas/tools/stickyTool';
import { doc } from '@/shared/model/fixtures';

const P = (x: number, y: number) => ({ x, y });

describe('stickyFromDrag', () => {
  it('клик даёт квадрат размера по умолчанию с центром в точке', () => {
    const node = stickyFromDrag(P(200, 200), P(200, 200), false, 1);

    expect(node.width).toBe(DEFAULT_STICKY_SIZE.width);
    expect(node.height).toBe(DEFAULT_STICKY_SIZE.height);
    expect(node.x).toBe(200 - DEFAULT_STICKY_SIZE.width / 2);
    expect(node.y).toBe(200 - DEFAULT_STICKY_SIZE.height / 2);
  });

  it('протяжка справа налево даёт положительные размеры', () => {
    const node = stickyFromDrag(P(500, 400), P(200, 100), false, 1);

    expect(node.width).toBeGreaterThan(0);
    expect(node.height).toBeGreaterThan(0);
    expect(node.x).toBe(200);
    expect(node.y).toBe(100);
  });

  it('стикер всегда квадратный, даже при вытянутой протяжке', () => {
    const wide = stickyFromDrag(P(0, 0), P(600, 100), false, 1);
    const tall = stickyFromDrag(P(0, 0), P(100, 600), false, 1);

    expect(wide.width).toBe(wide.height);
    expect(tall.width).toBe(tall.height);
    expect(wide.width).toBe(600);
    expect(tall.height).toBe(600);
  });

  it('Shift ничего не меняет: форма и так квадратная', () => {
    const withShift = stickyFromDrag(P(0, 0), P(300, 120), true, 1);
    const without = stickyFromDrag(P(0, 0), P(300, 120), false, 1);

    expect(withShift.width).toBe(without.width);
    expect(withShift.height).toBe(without.height);
  });

  it('крошечная протяжка не даёт нечитаемый стикер', () => {
    const node = stickyFromDrag(P(0, 0), P(12, 9), false, 1);
    expect(node.width).toBeGreaterThanOrEqual(MIN_STICKY_SIDE);
  });
});

describe('инварианты модели для стикера', () => {
  it('узел валиден и заливка из палитры', () => {
    const node = stickyFromDrag(P(0, 0), P(200, 200), false, 1);

    expect(node.id).toBeTruthy();
    expect(node.type).toBe('sticky');
    expect(node.width).toBeGreaterThanOrEqual(0);
    expect(STICKY_PALETTE.map((c) => c.fill)).toContain(node.fill);
  });

  it('цвет текста берётся из той же записи палитры, что и заливка', () => {
    for (const color of STICKY_PALETTE) {
      const node = stickyFromDrag(P(0, 0), P(200, 200), false, 1, color);
      expect(node.fill).toBe(color.fill);
      expect(node.text.color).toBe(color.text);
    }
  });

  it('инвариант 1: узел попадает и в nodes, и в order', () => {
    const node = stickyFromDrag(P(0, 0), P(200, 200), false, 1);
    const d = doc([node]);

    expect(d.nodes[node.id]).toBeDefined();
    expect(d.order).toContain(node.id);
  });
});

describe('fitFontSize — текст ужимается под рамку', () => {
  /**
   * Подставная линейка вместо настоящей: в jsdom измерения текста нет,
   * а подгонять тест под нулевые габариты — значит проверять пустоту.
   * Модель простая и монотонная: символ шириной 0.6 кегля, строки
   * переносятся по ширине, высота строки 1.3 кегля.
   */
  const measure: MeasureText = (text, fontSize, maxWidth) => {
    const charWidth = fontSize * 0.6;
    const perLine = Math.max(1, Math.floor(maxWidth / charWidth));
    const lines = Math.ceil(text.length / perLine);
    return {
      width: Math.min(text.length, perLine) * charWidth,
      height: lines * fontSize * 1.3,
    };
  };

  const box = { maxWidth: 156, maxHeight: 156 };

  it('короткий текст оставляет исходный кегль', () => {
    const { fontSize, overflow } = fitFontSize({
      ...box,
      text: 'Привет',
      fontSize: DEFAULT_STICKY_FONT_SIZE,
      measure,
    });

    expect(fontSize).toBe(DEFAULT_STICKY_FONT_SIZE);
    expect(overflow).toBe(false);
  });

  it('длинный текст уменьшает кегль', () => {
    const { fontSize, overflow } = fitFontSize({
      ...box,
      text: 'а'.repeat(400),
      fontSize: DEFAULT_STICKY_FONT_SIZE,
      measure,
    });

    expect(fontSize).toBeLessThan(DEFAULT_STICKY_FONT_SIZE);
    expect(fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
    expect(overflow).toBe(false);
  });

  it('очень длинный текст упирается в минимум и сообщает про обрезку', () => {
    const { fontSize, overflow } = fitFontSize({
      ...box,
      text: 'а'.repeat(20000),
      fontSize: DEFAULT_STICKY_FONT_SIZE,
      measure,
    });

    expect(fontSize).toBe(MIN_FONT_SIZE);
    expect(overflow).toBe(true);
  });

  it('подобранный кегль действительно помещается', () => {
    for (const length of [10, 60, 120, 300, 900]) {
      const { fontSize, overflow } = fitFontSize({
        ...box,
        text: 'а'.repeat(length),
        fontSize: DEFAULT_STICKY_FONT_SIZE,
        measure,
      });

      if (!overflow) {
        expect(measure('а'.repeat(length), fontSize, box.maxWidth).height)
          .toBeLessThanOrEqual(box.maxHeight);
      }
    }
  });

  it('пустой текст не трогаем', () => {
    const { fontSize } = fitFontSize({
      ...box,
      text: '   ',
      fontSize: DEFAULT_STICKY_FONT_SIZE,
      measure,
    });
    expect(fontSize).toBe(DEFAULT_STICKY_FONT_SIZE);
  });

  it('вырожденная рамка не роняет подбор', () => {
    const { fontSize, overflow } = fitFontSize({
      maxWidth: 0,
      maxHeight: 0,
      text: 'что-то',
      fontSize: DEFAULT_STICKY_FONT_SIZE,
      measure,
    });
    expect(fontSize).toBe(MIN_FONT_SIZE);
    expect(overflow).toBe(true);
  });
});
