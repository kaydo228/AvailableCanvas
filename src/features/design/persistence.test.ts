import { describe, expect, it } from 'vitest';
import { collectBlobIds } from '@/features/cloud/model/images';
import { parseBoardFile } from '@/features/export/lib/fileFormat';
import { repairDocument } from '@/features/persistence/repair';
import { parseClipboard, serializeNodes } from '@/features/shortcuts/model/useClipboard';
import { connector, doc, shape } from '@/shared/model/fixtures';
import { useBoardStore } from '@/shared/store/board';
import type { DesignCard } from '@/shared/types/design';
import type { BoardDocument, Node, ShapeNode } from '@/shared/types/document';

const card = (id: string): ShapeNode => ({
  ...shape(id),
  design: {
    kind: 'card',
    cardType: 'mechanic',
    title: 'Прыжок',
    summary: 'Высокий',
    status: 'testing',
    implementation: 'in-progress',
    tags: ['движение'],
    fields: { Цена: '5' },
    references: [],
    comments: [],
    table: { columns: ['Имя'], rows: [['Высота']] },
  },
});
const section = (id: string, children: string[]): ShapeNode => ({
  ...shape(id),
  design: {
    kind: 'section',
    title: 'Движение',
    description: '',
    children,
    collapsed: false,
    readingOrder: 0,
  },
});
const file = (document: BoardDocument, images = {}) =>
  JSON.stringify({ format: 'prostor-board', version: 1, name: 'Игра', document, images });

describe('design persistence', () => {
  it('round trips rich cards, references, relations and nonrecursive snapshots', () => {
    const a = card('a');
    const relation = { ...connector('link', 'a', 'ref'), relation: 'related' as const };
    const document = doc([
      a,
      section('s', ['a']),
      { ...shape('ref'), design: { kind: 'reference', targetId: 'a' } },
      relation,
    ]);
    document.versions = [
      {
        id: 'v',
        name: 'Первый',
        createdAt: 1,
        snapshot: { nodes: document.nodes, order: document.order, background: document.background },
      },
    ];
    expect(parseBoardFile(file(document)).document).toEqual(document);
  });
  it('rejects oversized design fields at the file boundary', () => {
    const a = card('a');
    (a.design as DesignCard).title = 'x'.repeat(241);
    expect(() => parseBoardFile(file(doc([a])))).toThrow();
  });
  it('retains and validates images used only in saved versions', () => {
    const image: Node = {
      ...shape('image'),
      type: 'image',
      blobId: 'historic-image',
      naturalWidth: 100,
      naturalHeight: 60,
    };
    const document = doc([]);
    document.versions = [
      {
        id: 'v',
        name: 'Вчера',
        createdAt: 1,
        snapshot: { nodes: { image }, order: ['image'], background: document.background },
      },
    ];
    expect(collectBlobIds(document)).toEqual(['historic-image']);
    expect(() => parseBoardFile(file(document))).toThrow();
    expect(
      parseBoardFile(file(document, { 'historic-image': 'data:image/png;base64,AA==' })).document
        .versions,
    ).toHaveLength(1);
  });
  it('duplicates a section with independent contents and remaps internal card references', () => {
    const a = card('a');
    (a.design as DesignCard).references = ['b'];
    useBoardStore
      .getState()
      .loadDocument(
        doc([
          section('s', ['a', 'b', 'ref']),
          a,
          card('b'),
          { ...shape('ref'), design: { kind: 'reference', targetId: 'a' } },
        ]),
      );
    const copies = useBoardStore.getState().duplicateNodes(['s']);
    const document = required(useBoardStore.getState().document);
    expect(copies).toHaveLength(4);
    const copiedSection = document.nodes[required(copies[0])] as ShapeNode;
    expect(copiedSection.design).toMatchObject({ children: copies.slice(1) });
    expect((document.nodes[required(copies[1])] as ShapeNode).design).toMatchObject({
      references: [copies[2]],
    });
    expect((document.nodes[required(copies[3])] as ShapeNode).design).toMatchObject({
      targetId: copies[1],
    });
    useBoardStore.getState().removeNodes([required(copies[0])]);
    expect(useBoardStore.getState().document?.nodes[required(copies[1])]).toBeDefined();
  });
  it('repairs invalid and duplicate membership without mutating source', () => {
    const document = doc([
      section('s', ['a', 'a', 'missing', 'other']),
      section('other', ['a']),
      card('a'),
    ]);
    const repaired = repairDocument(document).document;
    expect((repaired.nodes.s as ShapeNode).design).toMatchObject({ children: ['a'] });
    expect((repaired.nodes.other as ShapeNode).design).toMatchObject({ children: [] });
    expect((document.nodes.s as ShapeNode).design).toMatchObject({
      children: ['a', 'a', 'missing', 'other'],
    });
  });
});

it('repairs partial local card data and malformed versions before rendering', () => {
  const document = doc([
    {
      ...shape('a'),
      design: {
        kind: 'card',
        title: 'Keep me',
        summary: 42,
        comments: [{ text: 'Keep comment', createdAt: 'bad' }],
      },
    } as unknown as ShapeNode,
  ]);
  document.versions = [
    null,
    { id: 'broken', name: 'Broken', createdAt: 1, snapshot: null },
  ] as unknown as NonNullable<BoardDocument['versions']>;
  const repaired = repairDocument(document);
  expect((repaired.document.nodes.a as ShapeNode).design).toMatchObject({
    kind: 'card',
    title: 'Keep me',
    summary: '',
    tags: [],
    table: { columns: [], rows: [] },
    comments: [{ text: 'Keep comment', createdAt: 0 }],
  });
  expect(repaired.document.versions).toEqual([]);
  expect(repaired.repairs.length).toBeGreaterThan(0);
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing test fixture');
  return value;
}

it('rejects dates outside the JavaScript date range and repairs local version dates', () => {
  const document = doc([card('a')]);
  document.versions = [
    {
      id: 'v',
      name: 'Old',
      createdAt: 1e100,
      snapshot: { nodes: document.nodes, order: document.order, background: document.background },
    },
  ];
  expect(() => parseBoardFile(file(document))).toThrow();
  const fixed = repairDocument(document).document;
  expect(() => new Date(fixed.versions?.[0]?.createdAt ?? 0).toISOString()).not.toThrow();
});

it('clipboard preserves design metadata and remaps references in the inserted section', () => {
  const nodes = [
    section('s', ['a', 'ref']),
    card('a'),
    { ...shape('ref'), design: { kind: 'reference', targetId: 'a' } } as ShapeNode,
  ];
  const parsed = required(parseClipboard(serializeNodes(nodes)));
  expect(parsed).toEqual(nodes);
  useBoardStore.getState().loadDocument(doc([]));
  const ids = useBoardStore.getState().pasteNodes(parsed);
  const document = required(useBoardStore.getState().document);
  expect((document.nodes[required(ids[0])] as ShapeNode).design).toMatchObject({
    children: ids.slice(1),
  });
  expect((document.nodes[required(ids[2])] as ShapeNode).design).toMatchObject({
    targetId: ids[1],
  });
});
it('repair preserves section ownership while dissolving a one-member group', () => {
  const a = { ...card('a'), groupId: 'g' };
  const document = doc([section('s', ['g']), a, { ...shape('g'), type: 'group', children: ['a'] }]);
  const repaired = repairDocument(document).document;
  expect((repaired.nodes.s as ShapeNode).design).toMatchObject({ children: ['a'] });
});
