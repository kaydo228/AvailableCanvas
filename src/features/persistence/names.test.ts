/** Имя проекта: что считать пустым и где обрезать. */

import { describe, expect, test } from 'vitest';

import { isBlankName, MAX_PROJECT_NAME } from './projectsRepo';

describe('isBlankName', () => {
  test('обычное имя не пустое', () => {
    expect(isBlankName('Доска')).toBe(false);
  });

  test('пустая строка и пробелы — пустое', () => {
    expect(isBlankName('')).toBe(true);
    expect(isBlankName('    ')).toBe(true);
    expect(isBlankName('\t\n')).toBe(true);
  });

  test('zero-width пробелы тоже пустое: trim() их не берёт', () => {
    expect(isBlankName('​​​')).toBe(true);
    expect('​'.trim()).toBe('​'); // вот почему одного trim() мало
  });

  test('неразрывный пробел — пустое', () => {
    expect(isBlankName('  ')).toBe(true);
  });

  test('эмодзи — не пустое', () => {
    expect(isBlankName('🙂')).toBe(false);
  });
});

describe('предел длины', () => {
  test('он один на всё приложение', () => {
    expect(MAX_PROJECT_NAME).toBe(120);
  });
});
