import { beforeEach, expect, it } from 'vitest';
import { repairDocument } from '@/features/persistence/repair';
import { doc, shape } from '@/shared/model/fixtures';
import { useBoardStore } from '@/shared/store/board';
import type { ShapeNode } from '@/shared/types/document';
import {
  assignSection,
  convertSticky,
  deleteVersion,
  focusNode,
  insertCard,
  insertReference,
  insertRelation,
  insertSection,
  insertTemplate,
  moveSection,
  patchCard,
  patchSection,
  restoreVersion,
  saveVersion,
} from './actions';
import { isCard, isSection, resolveCard } from './model';
import { TEMPLATE_LABELS } from './templates';

const state = () => useBoardStore.getState();
const document = () => required(state().document);
beforeEach(() => {
  state().loadDocument(doc([]));
  state().setCanvasSize({ width: 1000, height: 800 });
});
it('edits canonical data through a reference and limits user supplied text', () => {
  const id = insertCard('mechanic');
  const reference = insertReference(id);
  patchCard(reference, {
    title: 'x'.repeat(300),
    summary: 'a'.repeat(12000),
    tags: Array.from({ length: 25 }, (_, i) => `tag${i}`),
  });
  const node = required(resolveCard(document(), id));
  expect(node.design.title).toHaveLength(240);
  expect(node.design.summary).toHaveLength(10000);
  expect(node.design.tags).toHaveLength(20);
  expect(resolveCard(document(), reference)?.id).toBe(id);
});
it('converts a sticky in place preserving links, group and section membership', () => {
  state().addNode({
    ...shape('note', 100, 200),
    type: 'sticky',
    groupId: 'g',
    text: { value: 'Правило\nПодробности', fontSize: 20, color: '#000', align: 'left' },
  });
  const section = insertSection('Раздел', ['note']);
  convertSticky('note', 'quest');
  expect(state().document?.nodes.note).toMatchObject({
    id: 'note',
    x: 100,
    y: 200,
    groupId: 'g',
    design: { kind: 'card', cardType: 'quest', summary: 'Правило\nПодробности' },
  });
  expect((document().nodes[section] as ShapeNode).design).toMatchObject({
    children: ['note'],
  });
});
it('section membership is unique, moves contents once, leaves content size intact and expands on focus', () => {
  const a = insertCard('concept');
  const first = insertSection('Первый', [a]);
  const second = insertSection('Второй', []);
  assignSection(a, second);
  expect((document().nodes[first] as ShapeNode).design).toMatchObject({ children: [] });
  const before = document().nodes[a] as ShapeNode;
  const section = document().nodes[second] as ShapeNode;
  moveSection(second, section.x + 40, section.y + 30);
  expect(document().nodes[a]).toMatchObject({
    x: before.x + 40,
    y: before.y + 30,
    width: before.width,
  });
  state().resizeNode(second, { x: 0, y: 0, width: 900, height: 700 });
  expect(document().nodes[a]).toMatchObject({
    x: before.x + 40,
    y: before.y + 30,
    width: before.width,
  });
  patchSection(second, { collapsed: true });
  focusNode(a);
  expect((document().nodes[second] as ShapeNode).design).toMatchObject({ collapsed: false });
  expect(state().selection).toEqual([a]);
  expect(document().viewport.zoom).toBeLessThanOrEqual(1);
});
it('moves explicit free connector ends with a section and attaches semantic relations', () => {
  const a = insertCard('mechanic');
  const b = insertCard('resource');
  const relation = insertRelation(a, b, 'consumes');
  expect(document().nodes[relation]).toMatchObject({
    relation: 'consumes',
    routing: 'elbow',
    from: { nodeId: a },
    to: { nodeId: b },
  });
  const free = state().connect({ point: { x: 10, y: 20 } }, { point: { x: 50, y: 80 } });
  const section = insertSection('Раздел', [a, b, free]);
  state().moveNodes([section, a], 10, 15);
  expect(document().nodes[free]).toMatchObject({
    from: { point: { x: 20, y: 35 } },
    to: { point: { x: 60, y: 95 } },
  });
});
it.each(Object.keys(TEMPLATE_LABELS) as (keyof typeof TEMPLATE_LABELS)[])(
  'inserts editable %s template as one store change',
  (template) => {
    let updates = 0;
    const unsubscribe = useBoardStore.subscribe(() => {
      updates++;
    });
    insertTemplate(template);
    unsubscribe();
    expect(updates).toBe(1);
    const nodes = Object.values(document().nodes);
    expect(nodes.filter(isSection)).toHaveLength(1);
    expect(nodes.filter(isCard).length).toBeGreaterThan(1);
    expect(nodes.some((node) => node.type === 'connector' && node.relation)).toBe(true);
  },
);
it('restores an independent snapshot and backs up current work, retaining project and camera', () => {
  const a = insertCard('concept');
  patchCard(a, { title: 'Раньше' });
  expect(saveVersion('Версия')).toBe(true);
  const saved = required(required(document().versions)[0]);
  patchCard(a, { title: 'Сейчас' });
  state().setViewport({ x: 50, y: 60, zoom: 0.5 });
  restoreVersion(saved.id);
  expect(resolveCard(document(), a)?.design.title).toBe('Раньше');
  expect(state().document).toMatchObject({
    projectId: 'p1',
    viewport: { x: 50, y: 60, zoom: 0.5 },
  });
  expect(document().versions).toHaveLength(2);
  expect(
    (required(required(document().versions)[1]).snapshot.nodes[a] as ShapeNode).design,
  ).toMatchObject({
    title: 'Сейчас',
  });
  expect(saved.snapshot).not.toHaveProperty('versions');
  expect(state().selection).toEqual([]);
  deleteVersion(saved.id);
  expect(document().versions).toHaveLength(1);
});
it('limits named versions but restore always keeps a safety copy', () => {
  expect(saveVersion(' ')).toBe(false);
  for (let i = 0; i < 10; i++) expect(saveVersion(`v${i}`)).toBe(true);
  expect(saveVersion('overflow')).toBe(false);
  const oldest = required(required(document().versions)[0]);
  restoreVersion(oldest.id);
  expect(document().versions).toHaveLength(10);
  expect(document().versions?.at(-1)?.name).toContain('восстановлением');
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing test fixture');
  return value;
}

it('closes the core loop back to its initial action', () => {
  insertTemplate('loop');
  const cards = Object.values(document().nodes).filter(isCard);
  const links = Object.values(document().nodes).filter((node) => node.type === 'connector');
  expect(links).toHaveLength(3);
  expect(
    links.some((node) => node.from.nodeId === cards[2]?.id && node.to.nodeId === cards[0]?.id),
  ).toBe(true);
});
it('never selects children of a collapsed section through select all or marquee', () => {
  const a = insertCard('concept');
  const section = insertSection('Hidden', [a]);
  state().select([a]);
  patchSection(section, { collapsed: true });
  expect(state().selection).toEqual([]);
  state().selectAll();
  expect(state().selection).toEqual([section]);
  state().selectInBox({ x: -1000, y: -1000, width: 10000, height: 10000 });
  expect(state().selection).not.toContain(a);
});

it('retains section contents after ungrouping a member group', () => {
  const a = insertCard('concept');
  const b = insertCard('mechanic');
  const group = required(state().group([a, b]));
  const section = insertSection('Grouped', [group]);
  state().ungroup(group);
  expect((document().nodes[section] as ShapeNode).design).toMatchObject({ children: [a, b] });
  const before = document().nodes[a] as ShapeNode;
  state().moveNodes([section], 20, 30);
  expect(document().nodes[a]).toMatchObject({ x: before.x + 20, y: before.y + 30 });
});
it('retains a surviving member when deletion dissolves a section group', () => {
  const a = insertCard('concept');
  const b = insertCard('mechanic');
  const group = required(state().group([a, b]));
  const section = insertSection('Grouped', [group]);
  state().removeNodes([a]);
  expect((document().nodes[section] as ShapeNode).design).toMatchObject({ children: [b] });
});

it('groups section members without exposing hidden content to marquee deletion', () => {
  const a = insertCard('concept');
  const b = insertCard('mechanic');
  const section = insertSection('Grouped', [a, b]);
  const group = required(state().group([a, b]));
  expect((document().nodes[section] as ShapeNode).design).toMatchObject({ children: [group] });
  patchSection(section, { collapsed: true });
  state().selectInBox({ x: -1000, y: -1000, width: 10000, height: 10000 });
  expect(state().selection).not.toContain(group);
  expect(state().selection).not.toContain(a);
});
it('assigning a group child transfers the whole group to one section', () => {
  const a = insertCard('concept');
  const b = insertCard('mechanic');
  const group = required(state().group([a, b]));
  const first = insertSection('First', [group]);
  const second = insertSection('Second', []);
  assignSection(a, second);
  expect((document().nodes[first] as ShapeNode).design).toMatchObject({ children: [] });
  expect((document().nodes[second] as ShapeNode).design).toMatchObject({ children: [group] });
});

it('reveals cards and references inserted into a collapsed section', () => {
  const section = insertSection('Collapsed', []);
  patchSection(section, { collapsed: true });
  const card = insertCard('mechanic', section);
  expect((document().nodes[section] as ShapeNode).design).toMatchObject({ collapsed: false });
  patchSection(section, { collapsed: true });
  insertReference(card, section);
  expect((document().nodes[section] as ShapeNode).design).toMatchObject({ collapsed: false });
});

it('fresh templates survive storage repair without false damage warnings', () => {
  insertTemplate('loop');
  expect(repairDocument(document()).repairs).toEqual([]);
});
it('template spacing leaves enough room for semantic connector labels', () => {
  insertTemplate('loop');
  const cards = Object.values(document().nodes)
    .filter(isCard)
    .sort((a, b) => a.x - b.x);
  const first = required(cards[0]);
  const second = required(cards[1]);
  expect(second.x - first.x - first.width).toBeGreaterThanOrEqual(140);
});
