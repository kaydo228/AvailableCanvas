import { beforeEach, expect, it, vi } from 'vitest';
import { buildBoardFile, importJson } from '@/features/export/model/transfer';
import { collectOrphanBlobs } from '@/features/persistence/blobStore';
import { doc } from '@/shared/model/fixtures';
import { useBoardStore } from '@/shared/store/board';
import type { BoardDocument, ImageNode } from '@/shared/types/document';

// Browser database and image decoding are the I/O boundaries; the export/import/GC logic is real.
const memory = vi.hoisted(() => ({
  documents: [] as BoardDocument[],
  saved: null as BoardDocument | null,
  blobs: new Map<string, Blob>(),
}));
vi.mock('@/features/persistence/db', () => ({
  withDB: (fn: (db: unknown) => unknown) =>
    fn({
      getAll: () => memory.documents,
      getAllKeys: () => [...memory.blobs.keys()],
      get: (_store: string, id: string) => ({ blob: memory.blobs.get(id) }),
    }),
}));
vi.mock('@/features/persistence/blobStore', async (original) => ({
  ...(await original<typeof import('@/features/persistence/blobStore')>()),
  putImage: async (blob: Blob) => {
    memory.blobs.set('new-image', blob);
    return { blobId: 'new-image', naturalWidth: 10, naturalHeight: 10 };
  },
}));
vi.mock('@/features/persistence/projectsRepo', () => ({
  createProject: async (name: string) => ({ id: 'imported', name, createdAt: 1, updatedAt: 1 }),
  saveDocument: async (document: BoardDocument) => {
    memory.saved = document;
  },
}));
const image: ImageNode = {
  id: 'image',
  type: 'image',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  naturalWidth: 10,
  naturalHeight: 10,
  rotation: 0,
  opacity: 1,
  locked: false,
  blobId: 'old-image',
};
beforeEach(() => {
  memory.blobs.clear();
  memory.documents = [];
  memory.saved = null;
  memory.blobs.set('old-image', new Blob(['image bytes'], { type: 'image/png' }));
});
function historicalDocument(): BoardDocument {
  const document = doc([]);
  document.versions = [
    {
      id: 'v',
      name: 'With image',
      createdAt: 1,
      snapshot: { nodes: { image }, order: ['image'], background: document.background },
    },
  ];
  return document;
}
it('GC retains a snapshot-only image until its last version is removed', async () => {
  memory.documents = [historicalDocument()];
  memory.blobs.set('unused', new Blob());
  expect(await collectOrphanBlobs()).toEqual(['unused']);
  memory.documents[0]?.versions?.splice(0);
  expect(await collectOrphanBlobs()).toEqual(['old-image', 'unused']);
});
it('exports a snapshot-only image and imports it under a fresh blob id inside the version', async () => {
  useBoardStore.getState().loadDocument(historicalDocument());
  const exported = await buildBoardFile('Board');
  expect(exported.images['old-image']).toMatch(/^data:image\/png;base64,/);
  const file = { text: async () => JSON.stringify(exported) } as File;
  await importJson(file);
  expect(memory.saved?.projectId).toBe('imported');
  expect(memory.saved?.versions?.[0]?.snapshot.nodes.image).toMatchObject({
    type: 'image',
    blobId: 'new-image',
  });
  expect(memory.blobs.get('new-image')?.size).toBeGreaterThan(0);
  expect(memory.saved?.nodes).toEqual({});
});
