import { nanoid } from 'nanoid';
import { withGroupDescendants } from '@/shared/model/hierarchy';
import { setSectionMembership as assign, topmostGroup } from '@/shared/model/operations';
import { createConnector, useBoardStore } from '@/shared/store/board';
import {
  CARD_TYPES,
  type CardType,
  type DesignCard,
  type DesignSection,
  RELATION_TYPES,
  type RelationType,
} from '@/shared/types/design';
import type { BoardDocument, BoardVersion, ShapeNode } from '@/shared/types/document';
import { getSection, getSections, hiddenDesignIds, isSection, resolveCard } from './model';
import { normalizeDesign } from './normalize';
import { CARD_FIELDS, TEMPLATE_LABELS, TEMPLATES, type TemplateId } from './templates';

const short = (value: string): string => value.slice(0, 240);
const text = (value: string): string => value.slice(0, 10_000);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function normalizeCard(card: DesignCard): DesignCard {
  return normalizeDesign(card) as DesignCard;
}

function cardNode(
  cardType: CardType,
  x: number,
  y: number,
  title: string = CARD_TYPES[cardType],
): ShapeNode {
  return {
    id: nanoid(),
    type: 'shape',
    shape: 'roundRect',
    x,
    y,
    width: 280,
    height: 160,
    rotation: 0,
    opacity: 1,
    locked: false,
    fill: '#20232b',
    stroke: '#606673',
    strokeWidth: 1,
    cornerRadius: 12,
    design: {
      kind: 'card',
      cardType,
      title,
      summary: '',
      status: 'idea',
      implementation: 'not-started',
      tags: [],
      fields: Object.fromEntries(CARD_FIELDS[cardType].map((field) => [field, ''])),
      references: [],
      comments: [],
      table: { columns: [], rows: [] },
    },
  };
}
function position(sectionId?: string): { x: number; y: number } {
  const { document, canvasSize } = useBoardStore.getState();
  const section = sectionId ? document?.nodes[sectionId] : undefined;
  if (isSection(section))
    return { x: section.x + 32, y: section.y + 80 + section.design.children.length * 32 };
  const view = document?.viewport ?? { x: 0, y: 0, zoom: 1 };
  return {
    x: (canvasSize.width / 2 - view.x) / view.zoom - 140,
    y: (canvasSize.height / 2 - view.y) / view.zoom - 80,
  };
}

function sectionNode(
  document: BoardDocument,
  title: string,
  children: string[],
  at: { x: number; y: number },
): ShapeNode {
  const members = withGroupDescendants(document, children).flatMap((id) => {
    const node = document.nodes[id];
    return node && node.type !== 'connector' ? [node] : [];
  });
  const x = members.length ? Math.min(...members.map((node) => node.x)) - 32 : at.x;
  const y = members.length ? Math.min(...members.map((node) => node.y)) - 72 : at.y;
  const width = members.length
    ? Math.max(...members.map((node) => node.x + node.width)) - x + 32
    : 620;
  const height = members.length
    ? Math.max(...members.map((node) => node.y + node.height)) - y + 32
    : 400;
  return {
    id: nanoid(),
    type: 'shape',
    shape: 'roundRect',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    fill: '#17191f',
    stroke: '#656b78',
    strokeWidth: 1,
    cornerRadius: 16,
    design: {
      kind: 'section',
      title: short(title),
      description: '',
      children: [],
      collapsed: false,
      readingOrder:
        Math.max(-1, ...getSections(document).map((section) => section.design.readingOrder)) + 1,
    },
  };
}
export function insertCard(cardType: CardType, sectionId?: string): string {
  if (!useBoardStore.getState().document) return '';
  const at = position(sectionId);
  const node = cardNode(cardType, at.x, at.y);
  useBoardStore.setState((state) => {
    if (!state.document) return;
    state.document.nodes[node.id] = node;
    state.document.order.push(node.id);
    if (sectionId) {
      assign(state.document, node.id, sectionId);
      const section = state.document.nodes[sectionId];
      if (isSection(section)) section.design.collapsed = false;
    }
    state.selection = [node.id];
    state.activeTool = 'select';
    state.editingNodeId = null;
  });
  return node.id;
}
export function insertSection(
  title = 'Новый раздел',
  children = useBoardStore.getState().selection,
): string {
  const document = useBoardStore.getState().document;
  if (!document) return '';
  const members = [...new Set(children.map((id) => topmostGroup(document, id)))].filter(
    (id) => document.nodes[id] && !isSection(document.nodes[id]),
  );
  const node = sectionNode(document, title, members, position());
  useBoardStore.setState((state) => {
    if (!state.document) return;
    state.document.nodes[node.id] = node;
    state.document.order.unshift(node.id);
    for (const child of members) assign(state.document, child, node.id);
    state.selection = [node.id];
    state.activeTool = 'select';
    state.editingNodeId = null;
  });
  return node.id;
}
export function patchCard(id: string, patch: Partial<DesignCard>): void {
  useBoardStore.setState((state) => {
    if (!state.document) return;
    const card = resolveCard(state.document, id);
    if (card) card.design = normalizeCard({ ...card.design, ...copy(patch), kind: 'card' });
  });
}
export function patchSection(id: string, patch: Partial<DesignSection>): void {
  useBoardStore.setState((state) => {
    const document = state.document;
    const section = document?.nodes[id];
    if (!document || !isSection(section)) return;
    const children = patch.children ? [...new Set(patch.children)] : [...section.design.children];
    section.design = {
      ...section.design,
      ...copy(patch),
      kind: 'section',
      children: [],
      title: short(patch.title ?? section.design.title),
      description: text(patch.description ?? section.design.description),
      readingOrder: Number.isFinite(patch.readingOrder)
        ? (patch.readingOrder ?? section.design.readingOrder)
        : section.design.readingOrder,
    };
    for (const child of children) assign(document, child, id);
    if (section.design.collapsed) {
      const hidden = hiddenDesignIds(document);
      state.selection = state.selection.filter((selected) => !hidden.has(selected));
      if (state.editingNodeId && hidden.has(state.editingNodeId)) state.editingNodeId = null;
    }
  });
}
export function convertSticky(id: string, cardType: CardType = 'concept'): void {
  useBoardStore.setState((state) => {
    const node = state.document?.nodes[id];
    if (!state.document || node?.type !== 'sticky') return;
    const replacement = cardNode(cardType, node.x, node.y);
    if (replacement.design?.kind !== 'card') return;
    replacement.design.title = short(node.text.value.split('\n')[0] || CARD_TYPES[cardType]);
    replacement.design.summary = text(node.text.value);
    replacement.id = id;
    replacement.width = Math.max(280, node.width);
    replacement.height = Math.max(160, node.height);
    replacement.rotation = node.rotation;
    replacement.opacity = node.opacity;
    replacement.locked = node.locked;
    if (node.groupId) replacement.groupId = node.groupId;
    state.document.nodes[id] = replacement;
    state.editingNodeId = null;
  });
}
export function insertReference(targetId: string, sectionId?: string): string {
  const document = useBoardStore.getState().document;
  const target = document && resolveCard(document, targetId);
  if (!target) return '';
  const at = position(sectionId);
  const node = cardNode(target.design.cardType, at.x + 32, at.y + 32);
  node.design = { kind: 'reference', targetId: target.id };
  useBoardStore.setState((state) => {
    if (!state.document) return;
    state.document.nodes[node.id] = node;
    state.document.order.push(node.id);
    if (sectionId) {
      assign(state.document, node.id, sectionId);
      const section = state.document.nodes[sectionId];
      if (isSection(section)) section.design.collapsed = false;
    }
    state.selection = [node.id];
    state.activeTool = 'select';
    state.editingNodeId = null;
  });
  return node.id;
}
export function assignSection(nodeId: string, sectionId: string | null): void {
  useBoardStore.setState((state) => {
    if (state.document) assign(state.document, nodeId, sectionId);
  });
}
export function focusNode(id: string): void {
  useBoardStore.setState((state) => {
    const document = state.document;
    const node = document?.nodes[id];
    if (!document || !node) return;
    const section = getSection(document, id);
    if (section) section.design.collapsed = false;
    state.selection = [id];
    state.editingNodeId = null;
    state.activeTool = 'select';
    if (node.type !== 'connector') {
      const zoom = Math.max(
        0.1,
        Math.min(
          document.viewport.zoom,
          1,
          (state.canvasSize.width - 80) / Math.max(1, node.width),
          (state.canvasSize.height - 80) / Math.max(1, node.height),
        ),
      );
      document.viewport = {
        zoom,
        x: state.canvasSize.width / 2 - (node.x + node.width / 2) * zoom,
        y: state.canvasSize.height / 2 - (node.y + node.height / 2) * zoom,
      };
    }
  });
}
export function moveSection(id: string, x: number, y: number): void {
  const state = useBoardStore.getState();
  const section = state.document?.nodes[id];
  if (isSection(section) && Number.isFinite(x) && Number.isFinite(y))
    state.moveNodes([id], x - section.x, y - section.y);
}
function relationNode(fromId: string, toId: string, relation: RelationType) {
  return createConnector(
    { nodeId: fromId, anchor: 'auto' },
    { nodeId: toId, anchor: 'auto' },
    {
      routing: 'elbow',
      relation,
      label: { value: RELATION_TYPES[relation], fontSize: 14, color: '#e2e4e9', align: 'center' },
    },
  );
}
export function insertRelation(fromId: string, toId: string, relation: RelationType): string {
  const document = useBoardStore.getState().document;
  if (
    !document?.nodes[fromId] ||
    !document.nodes[toId] ||
    document.nodes[fromId]?.type === 'connector' ||
    document.nodes[toId]?.type === 'connector'
  )
    return '';
  const node = relationNode(fromId, toId, relation);
  useBoardStore.getState().addNode(node);
  return node.id;
}
export function insertTemplate(template: TemplateId): void {
  const at = position();
  useBoardStore.setState((state) => {
    const document = state.document;
    if (!document) return;
    const spec = TEMPLATES[template];
    const cards = spec.cards.map(([type, title], index) =>
      cardNode(type, at.x + index * 420, at.y, title),
    );
    for (const card of cards) {
      document.nodes[card.id] = card;
      document.order.push(card.id);
    }
    const section = sectionNode(
      document,
      TEMPLATE_LABELS[template],
      cards.map((card) => card.id),
      at,
    );
    document.nodes[section.id] = section;
    document.order.unshift(section.id);
    for (const card of cards) assign(document, card.id, section.id);
    const sequence = template === 'loop' ? [...cards, cards[0]] : cards;
    for (let i = 1; i < sequence.length; i++) {
      const previous = sequence[i - 1];
      const current = sequence[i];
      if (!previous || !current) continue;
      const relation = relationNode(previous.id, current.id, spec.relation);
      document.nodes[relation.id] = relation;
      document.order.push(relation.id);
      assign(document, relation.id, section.id);
    }
    state.selection = [section.id];
    state.activeTool = 'select';
    state.editingNodeId = null;
  });
}
function version(document: BoardDocument, name: string): BoardVersion {
  return {
    id: nanoid(),
    name: short(name.trim()),
    createdAt: Date.now(),
    snapshot: copy({
      nodes: document.nodes,
      order: document.order,
      background: document.background,
    }),
  };
}
export function saveVersion(name: string): boolean {
  const document = useBoardStore.getState().document;
  if (!document || !name.trim() || (document.versions?.length ?? 0) >= 10) return false;
  const saved = version(document, name);
  useBoardStore.setState((state) => {
    if (state.document) {
      state.document.versions ??= [];
      state.document.versions.push(saved);
    }
  });
  return true;
}
export function restoreVersion(id: string): void {
  const document = useBoardStore.getState().document;
  const saved = document?.versions?.find((item) => item.id === id);
  if (!document || !saved) return;
  const backup = version(document, 'Перед восстановлением');
  const snapshot = copy(saved.snapshot);
  useBoardStore.setState((state) => {
    if (!state.document) return;
    const versions = [...(state.document.versions ?? []), backup].slice(-10);
    Object.assign(state.document, snapshot, { versions });
    state.selection = [];
    state.editingNodeId = null;
  });
}
export function deleteVersion(id: string): void {
  useBoardStore.setState((state) => {
    if (state.document?.versions)
      state.document.versions = state.document.versions.filter((item) => item.id !== id);
  });
}
