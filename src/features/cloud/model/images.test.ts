/**
 * Какие файлы нужны доске. Ошибка здесь тихая и злая: не выгрузили картинку —
 * на другом устройстве доска открылась с дырой вместо изображения.
 */

import { describe, expect, it } from 'vitest';

import { doc, shape } from '@/shared/model/fixtures';
import type { ImageNode } from '@/shared/types/document';
import { collectBlobIds } from './images';

const image = (id: string, blobId: string): ImageNode => ({
  id,
  type: 'image',
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  rotation: 0,
  opacity: 1,
  locked: false,
  blobId,
  naturalWidth: 200,
  naturalHeight: 160,
});

describe('collectBlobIds', () => {
  it('собирает картинки документа', () => {
    expect(collectBlobIds(doc([image('i1', 'b1'), shape('s1'), image('i2', 'b2')]))).toEqual([
      'b1',
      'b2',
    ]);
  });

  it('одна и та же картинка в двух узлах — один файл', () => {
    expect(collectBlobIds(doc([image('i1', 'b1'), image('i2', 'b1')]))).toEqual(['b1']);
  });

  it('доска без картинок — пусто', () => {
    expect(collectBlobIds(doc([shape('s1')]))).toEqual([]);
  });
});
