import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FONT_SIZE,
  DEFAULT_TEXT_SIZE,
  MIN_TEXT_SIZE,
  createTextNode,
  shouldRemoveOnBlur,
  textFromDrag,
} from '@/features/canvas/tools/textTool';
import { doc } from '@/shared/model/fixtures';

const P = (x: number, y: number) => ({ x, y });

describe('textFromDrag — клик против протяжки', () => {
  it('клик даёт точку вставки с autoWidth', () => {
    const node = textFromDrag(P(100, 100), P(101, 100), 1);

    expect(node.autoWidth).toBe(true);
    expect(node.width).toBe(DEFAULT_TEXT_SIZE.width);
    expect(node.height).toBe(DEFAULT_TEXT_SIZE.height);
  });

  it('клик центрирует рамку по точке', () => {
    const node = textFromDrag(P(100, 100), P(100, 100), 1);

    expect(node.x).toBe(100 - DEFAULT_TEXT_SIZE.width / 2);
    expect(node.y).toBe(100 - DEFAULT_TEXT_SIZE.height / 2);
  });

  it('протяжка даёт блок фиксированной ширины', () => {
    const node = textFromDrag(P(10, 10), P(310, 90), 1);

    expect(node.autoWidth).toBe(false);
    expect(node.width).toBe(300);
    expect(node.height).toBe(80);
  });

  it('порог клика считается в экранных пикселях, а не в мировых', () => {
    // На четырёхкратном приближении сдвиг в 2 мировые единицы — это 8 экранных,
    // то есть уже протяжка. На стократном отдалении тот же сдвиг — клик.
    expect(textFromDrag(P(0, 0), P(2, 0), 4).autoWidth).toBe(false);
    expect(textFromDrag(P(0, 0), P(2, 0), 0.1).autoWidth).toBe(true);
  });
});

describe('textFromDrag — обратная протяжка', () => {
  it('справа налево даёт положительные размеры', () => {
    const node = textFromDrag(P(400, 300), P(100, 100), 1);

    expect(node.width).toBeGreaterThan(0);
    expect(node.height).toBeGreaterThan(0);
    expect(node.x).toBe(100);
    expect(node.y).toBe(100);
  });

  it('снизу вверх даёт ту же рамку, что и сверху вниз', () => {
    const forward = textFromDrag(P(50, 50), P(250, 150), 1);
    const backward = textFromDrag(P(250, 150), P(50, 50), 1);

    expect(backward.x).toBe(forward.x);
    expect(backward.y).toBe(forward.y);
    expect(backward.width).toBe(forward.width);
    expect(backward.height).toBe(forward.height);
  });

  it('очень узкая протяжка не даёт нечитаемый блок', () => {
    const node = textFromDrag(P(0, 0), P(300, 2), 1);

    expect(node.width).toBeGreaterThanOrEqual(MIN_TEXT_SIZE.width);
    expect(node.height).toBeGreaterThanOrEqual(MIN_TEXT_SIZE.height);
  });
});

describe('shouldRemoveOnBlur — пустой блок удаляется сам', () => {
  const withText = (value: string) =>
    createTextNode({ x: 0, y: 0, width: 100, height: 40 }, {
      text: {
        value,
        fontSize: DEFAULT_FONT_SIZE,
        color: '#000000',
        align: 'left',
      },
    });

  it('пустая строка — удалять', () => {
    expect(shouldRemoveOnBlur(withText(''))).toBe(true);
  });

  it('одни пробелы — удалять: на доске они выглядят как ничто', () => {
    expect(shouldRemoveOnBlur(withText('   '))).toBe(true);
  });

  it('переводы строк и табы — удалять', () => {
    expect(shouldRemoveOnBlur(withText('\n\t  \n'))).toBe(true);
  });

  it('непустой текст — оставить', () => {
    expect(shouldRemoveOnBlur(withText('привет'))).toBe(false);
  });

  it('текст с пробелами по краям — оставить', () => {
    expect(shouldRemoveOnBlur(withText('  привет  '))).toBe(false);
  });
});

describe('инварианты модели для текстового узла', () => {
  it('узел валиден: id, тип, неотрицательные размеры', () => {
    const node = textFromDrag(P(0, 0), P(200, 100), 1);

    expect(node.id).toBeTruthy();
    expect(node.type).toBe('text');
    expect(node.width).toBeGreaterThanOrEqual(0);
    expect(node.height).toBeGreaterThanOrEqual(0);
    expect(node.opacity).toBe(1);
    expect(node.locked).toBe(false);
  });

  it('идентификаторы уникальны', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => textFromDrag(P(0, 0), P(10, 10), 1).id),
    );
    expect(ids.size).toBe(50);
  });

  it('инвариант 1: узел попадает и в nodes, и в order', () => {
    const node = textFromDrag(P(0, 0), P(200, 100), 1);
    const d = doc([node]);

    expect(d.nodes[node.id]).toBeDefined();
    expect(d.order).toContain(node.id);
    expect(d.order).toHaveLength(Object.keys(d.nodes).length);
  });
});
