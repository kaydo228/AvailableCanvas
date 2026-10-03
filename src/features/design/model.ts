import { withGroupDescendants } from '@/shared/model/hierarchy';
import {
  CARD_TYPES,
  type CardType,
  DESIGN_STATUSES,
  type DesignCard,
  type DesignReference,
  type DesignSection,
  type DesignStatus,
  RELATION_TYPES,
} from '@/shared/types/design';
import type { BoardDocument, Node, ShapeNode } from '@/shared/types/document';

export type CardNode = ShapeNode & { design: DesignCard };
export type SectionNode = ShapeNode & { design: DesignSection };
export type ReferenceNode = ShapeNode & { design: DesignReference };
export const isCard = (node: Node | undefined): node is CardNode =>
  node?.type === 'shape' && node.design?.kind === 'card';
export const isSection = (node: Node | undefined): node is SectionNode =>
  node?.type === 'shape' && node.design?.kind === 'section';
export const isReference = (node: Node | undefined): node is ReferenceNode =>
  node?.type === 'shape' && node.design?.kind === 'reference';
export function resolveCard(document: BoardDocument, id: string): CardNode | null {
  const seen = new Set<string>();
  let node = document.nodes[id];
  while (isReference(node) && !seen.has(node.id)) {
    seen.add(node.id);
    node = document.nodes[node.design.targetId];
  }
  return isCard(node) ? node : null;
}
export function nodeTitle(document: BoardDocument, id: string): string {
  const node = document.nodes[id];
  if (!node) return 'Удалённая карточка';
  if (isReference(node)) {
    const card = resolveCard(document, id);
    return card ? card.design.title || 'Без названия' : 'Удалённая карточка';
  }
  if (isCard(node) || isSection(node)) return node.design.title || 'Без названия';
  if (node.type === 'text' || node.type === 'sticky') return node.text.value || 'Без названия';
  if (node.type === 'shape' || node.type === 'connector')
    return node.label?.value || 'Без названия';
  return node.type === 'image' ? 'Изображение' : node.type === 'group' ? 'Группа' : 'Рисунок';
}
export const getSections = (document: BoardDocument): SectionNode[] =>
  Object.values(document.nodes)
    .filter(isSection)
    .sort((a, b) => a.design.readingOrder - b.design.readingOrder);
export const getSection = (document: BoardDocument, nodeId: string): SectionNode | undefined =>
  getSections(document).find((section) =>
    withGroupDescendants(document, section.design.children).includes(nodeId),
  );
export function hiddenDesignIds(document: BoardDocument): Set<string> {
  const hidden = new Set<string>();
  for (const section of getSections(document)) {
    if (section.design.collapsed)
      for (const id of withGroupDescendants(document, section.design.children)) {
        if (!isSection(document.nodes[id])) hidden.add(id);
      }
  }
  for (const node of Object.values(document.nodes))
    if (
      node.type === 'connector' &&
      (hidden.has(node.from.nodeId ?? '') || hidden.has(node.to.nodeId ?? ''))
    )
      hidden.add(node.id);
  return hidden;
}
export function searchDesign(
  document: BoardDocument,
  query: string,
  cardType?: CardType,
  status?: DesignStatus,
): Node[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return document.order.flatMap((id) => {
    const node = document.nodes[id];
    if (!node || node.type === 'connector' || node.type === 'group') return [];
    const card = resolveCard(document, id)?.design;
    if ((cardType && card?.cardType !== cardType) || (status && card?.status !== status)) return [];
    const text = [
      nodeTitle(document, id),
      isSection(node) ? node.design.description : '',
      ...(card
        ? [
            card.summary,
            ...card.tags,
            ...Object.entries(card.fields).flat(),
            ...card.table.columns,
            ...card.table.rows.flat(),
            ...card.comments.map((comment) => comment.text),
          ]
        : []),
    ]
      .join(' ')
      .toLocaleLowerCase();
    return words.every((word) => text.includes(word)) ? [node] : [];
  });
}

const md = (text: string): string => text.replace(/[\\`*_[\]<>#]/g, '\\$&');
const cell = (text: string): string => md(text).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
const anchor = (id: string): string => `node-${encodeURIComponent(id)}`;
const link = (document: BoardDocument, id: string): string =>
  `[${md(nodeTitle(document, id))}](#${anchor(resolveCard(document, id)?.id ?? id)})`;
const implementation = { 'not-started': 'Не начато', 'in-progress': 'В работе', done: 'Готово' };

/** A reading view generated directly from live nodes, never a second document. */
export function toDesignMarkdown(document: BoardDocument, name: string): string {
  const lines = [`# ${md(name)}`, ''];
  const emitted = new Set<string>();
  const emit = (id: string): void => {
    if (emitted.has(id)) return;
    emitted.add(id);
    const node = document.nodes[id];
    if (!node || isSection(node)) return;
    if (node.type === 'group') {
      for (const child of node.children) emit(child);
      return;
    }
    if (isReference(node)) {
      lines.push(`Ссылка: ${link(document, id)}`, '');
      return;
    }
    if (isCard(node)) {
      const card = node.design;
      lines.push(
        `<a id="${anchor(id)}"></a>`,
        `### ${md(card.title || 'Без названия')}`,
        '',
        `Тип: ${CARD_TYPES[card.cardType]} · Статус: ${DESIGN_STATUSES[card.status]} · Реализация: ${implementation[card.implementation]}`,
        '',
        md(card.summary),
        '',
      );
      if (card.tags.length) lines.push(`Теги: ${card.tags.map(md).join(', ')}`, '');
      for (const [field, value] of Object.entries(card.fields))
        lines.push(`**${md(field)}:** ${md(value)}`, '');
      if (card.table.columns.length) {
        lines.push(
          `| ${card.table.columns.map(cell).join(' | ')} |`,
          `| ${card.table.columns.map(() => '---').join(' | ')} |`,
        );
        for (const row of card.table.rows)
          lines.push(`| ${card.table.columns.map((_, i) => cell(row[i] ?? '')).join(' | ')} |`);
        lines.push('');
      }
      if (card.references.length)
        lines.push(
          `Ссылки: ${card.references.map((target) => link(document, target)).join(', ')}`,
          '',
        );
      for (const comment of card.comments)
        lines.push(
          `- [${comment.resolved ? 'x' : ' '}] ${md(comment.author || 'Без автора')} (${new Date(comment.createdAt).toISOString()}): ${md(comment.text)}`,
        );
      if (card.comments.length) lines.push('');
      return;
    }
    if (node.type === 'connector') return;
    if (node.type === 'text' || node.type === 'sticky' || (node.type === 'shape' && node.label))
      lines.push(md(nodeTitle(document, id)), '');
    if (node.type === 'image') lines.push(`Изображение: ${md(id)}`, '');
  };
  for (const section of getSections(document)) {
    lines.push(
      `<a id="${anchor(section.id)}"></a>`,
      `## ${md(section.design.title || 'Без названия')}`,
      '',
      md(section.design.description),
      '',
    );
    for (const child of section.design.children) emit(child);
  }
  const remaining = document.order.filter(
    (id) =>
      !emitted.has(id) &&
      !isSection(document.nodes[id]) &&
      document.nodes[id]?.type !== 'connector',
  );
  if (remaining.length) {
    lines.push('## Без раздела', '');
    for (const id of remaining) emit(id);
  }
  const relations = Object.values(document.nodes).filter(
    (node) => node.type === 'connector' && node.relation,
  );
  if (relations.length) {
    lines.push('## Связи', '');
    for (const node of relations)
      if (node.type === 'connector' && node.relation)
        lines.push(
          `- ${link(document, node.from.nodeId ?? '')} → ${RELATION_TYPES[node.relation]} → ${link(document, node.to.nodeId ?? '')}`,
        );
  }
  return `${lines.join('\n').trim()}\n`;
}
