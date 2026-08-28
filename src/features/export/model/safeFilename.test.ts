/**
 * Имя доски уходит в имя скачиваемого файла как есть, а туда попадает всё,
 * что человек мог набрать в поле, — включая то, чего не видно.
 */

import { describe, expect, test } from 'vitest';

import { safeFilename } from './exportPng';

describe('safeFilename', () => {
  test('обычное имя не трогается', () => {
    expect(safeFilename('Схема авторизации')).toBe('Схема авторизации');
  });

  test('символы, ломающие файловую систему, заменяются', () => {
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });

  test('метка смены направления письма вычищается: она переворачивает показ имени', () => {
    // «файл<U+202E>gnp.txt» в списке загрузок выглядит как «файлtxt.png».
    expect(safeFilename('файл‮gnp.txt')).toBe('файлgnp.txt');
  });

  test('невидимые символы не считаются именем', () => {
    expect(safeFilename('​​')).toBe('Доска');
  });

  test('ведущие точки схлопываются: «...» давало файл «....prostor.json»', () => {
    expect(safeFilename('...')).toBe('Доска');
    expect(safeFilename('.prostor')).toBe('prostor');
  });

  test('пустое и пробельное имя заменяется на запасное', () => {
    expect(safeFilename('')).toBe('Доска');
    expect(safeFilename('   ')).toBe('Доска');
  });
});
