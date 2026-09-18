/**
 * Какие файлы нужны доске. Ошибка здесь тихая и злая: не выгрузили картинку —
 * на другом устройстве доска открылась с дырой вместо изображения.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { doc, shape } from '@/shared/model/fixtures';
import type { ImageNode } from '@/shared/types/document';
import { setCloud } from './client';
import { collectBlobIds, connectRemoteImages, downloadImage, uploadImages } from './images';

const blobs = vi.hoisted(() => ({
  getBlob: vi.fn(async () => new Blob(['image'])),
  putBlobDirect: vi.fn(async () => undefined),
  setRemoteBlobSource: vi.fn(),
}));
vi.mock('@/features/persistence/blobStore', () => blobs);

const upload = vi.fn(async () => ({ error: null }));
const download = vi.fn(async () => ({ data: new Blob(['remote']), error: null }));

beforeEach(() => {
  vi.clearAllMocks();
  setCloud({ storage: { from: () => ({ upload, download }) } } as never);
});

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

describe('project image paths', () => {
  it('uploads into the project folder', async () => {
    await uploadImages(doc([image('i1', 'blob-1')]), 'p1');

    expect(upload).toHaveBeenCalledWith('p1/blob-1', expect.any(Blob), { upsert: false });
  });

  it('downloads from the project folder', async () => {
    await downloadImage('blob-1', 'p1');

    expect(download).toHaveBeenCalledWith('p1/blob-1');
  });

  it('connects and clears a project-scoped lazy source', async () => {
    connectRemoteImages('p1');
    const source = blobs.setRemoteBlobSource.mock.calls[0]?.[0] as (
      blobId: string,
    ) => Promise<Blob | undefined>;
    await source('blob-1');

    expect(download).toHaveBeenCalledWith('p1/blob-1');
    expect(blobs.putBlobDirect).toHaveBeenCalledWith('blob-1', expect.any(Blob));

    connectRemoteImages(null);
    expect(blobs.setRemoteBlobSource).toHaveBeenLastCalledWith(null);
  });
});
