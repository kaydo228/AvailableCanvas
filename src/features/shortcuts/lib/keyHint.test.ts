import { expect, test } from 'vitest';
import { formatHint } from './keyHint';

test('на маке модификаторы становятся значками и склеиваются', () => {
  expect(formatHint('$mod+Z', true)).toBe('⌘Z');
  expect(formatHint('$mod+Shift+Z', true)).toBe('⌘⇧Z');
});

test('вне мака остаётся Ctrl со знаками плюс', () => {
  expect(formatHint('$mod+Z', false)).toBe('Ctrl+Z');
  expect(formatHint('$mod+Shift+Z', false)).toBe('Ctrl+Shift+Z');
});

test('одиночные клавиши не трогаются', () => {
  expect(formatHint('V', true)).toBe('V');
  expect(formatHint('?', false)).toBe('?');
  expect(formatHint('Space + перетаскивание', true)).toBe('Space + перетаскивание');
});
