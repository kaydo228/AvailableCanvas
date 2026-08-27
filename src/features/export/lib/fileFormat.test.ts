/**
 * Три файла, на которых импорт обязан вести себя предсказуемо: правильный,
 * обрезанный посередине и от другой версии схемы с лишними полями.
 */

import { expect, test } from 'vitest';

import { repairDocument } from '@/features/persistence/repair';
import { doc, shape } from '@/shared/model/fixtures';
import type { BoardDocument } from '@/shared/types/document';
import { BadFile, parseBoardFile } from './fileFormat';

const validFile = () => ({
  format: 'prostor-board',
  version: 1,
  name: 'Доска',
  savedAt: 1_700_000_000_000,
  document: doc([shape('a', 10, 20)]),
  images: {},
});

const text = (value: unknown): string => JSON.stringify(value, null, 2);

test('правильный файл открывается', () => {
  const file = parseBoardFile(text(validFile()));

  expect(file.name).toBe('Доска');
  expect(file.document.order).toEqual(['a']);
  expect(file.document.nodes.a).toMatchObject({ type: 'shape', x: 10, y: 20 });
});

test('обрезанный посередине файл — понятная ошибка, а не падение', () => {
  const whole = text(validFile());
  const half = whole.slice(0, Math.floor(whole.length / 2));

  expect(() => parseBoardFile(half)).toThrow(BadFile);
  expect(() => parseBoardFile(half)).toThrow(/повреждён или скачался не полностью/);
});

test('файл другой версии схемы — сказано про версию, а не про формат', () => {
  const future = {
    ...validFile(),
    version: 2,
    exportedBy: 'prostor 9.0',
    document: { ...validFile().document, schemaVersion: 2, layers: ['фон', 'основной'] },
  };

  expect(() => parseBoardFile(text(future))).toThrow(/более новой версией Prostor: версия файла 2/);
});

test('лишние поля при своей версии не мешают: они просто отбрасываются', () => {
  const withExtras = {
    ...validFile(),
    exportedBy: 'prostor 1.1',
    document: {
      ...validFile().document,
      nodes: { a: { ...shape('a', 10, 20), shadowBlur: 8, futureField: null } },
    },
  };

  const file = parseBoardFile(text(withExtras));

  expect(file.document.nodes.a).not.toHaveProperty('shadowBlur');
  expect(file.document.order).toEqual(['a']);
});

test('чужой JSON — сказано, что это не доска', () => {
  expect(() => parseBoardFile('{"hello":"world"}')).toThrow(/не файл доски Prostor/);
  expect(() => parseBoardFile('[1,2,3]')).toThrow(/не объект/);
});

test('битая модель — сказано, какое поле не то', () => {
  const broken = validFile();
  const broken2 = {
    ...broken,
    document: { ...broken.document, nodes: { a: { ...shape('a'), width: 'сто' } } },
  };

  expect(() => parseBoardFile(text(broken2))).toThrow(/document\.nodes\.a\.width/);
  expect(() => parseBoardFile(text(broken2))).toThrow(/ожидалось число, а там строка/);
});

/*
 * Раньше здесь стоял отказ: схема сама сверяла order с nodes. Теперь это
 * забота persistence/repair, и он не отвергает файл, а сводит их обратно
 * и докладывает об этом. Причина смены — в docs/DECISIONS.md, 2026-08-27:
 * ровно такой же документ приезжает из IndexedDB, где отказ означал бы
 * «твоя доска больше не открывается», и разводить два входа нельзя.
 */
test('order и nodes разъехались — схема пропускает, чинит repair', () => {
  const broken = validFile();
  const orphan = { ...broken, document: { ...broken.document, order: ['a', 'нет-такого'] } };

  const file = parseBoardFile(text(orphan));
  expect(file.document.order).toEqual(['a', 'нет-такого']);

  const { document, repairs } = repairDocument(file.document as BoardDocument);
  expect(document.order).toEqual(['a']);
  expect(repairs).toHaveLength(1);
  expect(repairs[0]).toMatchObject({ rule: 1 });
});

test('картинка узла потерялась — файл не проходит', () => {
  const base = validFile();
  const withImage = {
    ...base,
    document: {
      ...base.document,
      nodes: {
        img: {
          id: 'img',
          type: 'image',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          locked: false,
          blobId: 'b1',
          naturalWidth: 100,
          naturalHeight: 100,
        },
      },
      order: ['img'],
    },
    images: {},
  };

  expect(() => parseBoardFile(text(withImage))).toThrow(/картинки для узла img нет в файле/);
});
