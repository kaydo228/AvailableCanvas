import {
  CARD_TYPES,
  type CardType,
  DESIGN_STATUSES,
  type DesignContent,
  type DesignStatus,
} from '@/shared/types/design';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown, limit = 10_000): string =>
  typeof value === 'string' ? value.slice(0, limit) : '';
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const strings = (value: unknown): string[] =>
  array(value).filter((item): item is string => typeof item === 'string');
const finite = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Storage predates the import schema; recover partial metadata deterministically. */
export function normalizeDesign(value: unknown): DesignContent | undefined {
  const data = record(value);
  if (data.kind === 'reference') return { kind: 'reference', targetId: string(data.targetId) };
  if (data.kind === 'section')
    return {
      kind: 'section',
      title: string(data.title, 240),
      description: string(data.description),
      children: [...new Set(strings(data.children))],
      collapsed: data.collapsed === true,
      readingOrder: finite(data.readingOrder),
    };
  if (data.kind !== 'card') return undefined;
  const table = record(data.table);
  const columns = strings(table.columns)
    .slice(0, 20)
    .map((column) => string(column, 240));
  return {
    kind: 'card',
    cardType:
      typeof data.cardType === 'string' && Object.hasOwn(CARD_TYPES, data.cardType)
        ? (data.cardType as CardType)
        : 'concept',
    title: string(data.title, 240),
    summary: string(data.summary),
    status:
      typeof data.status === 'string' && Object.hasOwn(DESIGN_STATUSES, data.status)
        ? (data.status as DesignStatus)
        : 'idea',
    implementation:
      data.implementation === 'done' || data.implementation === 'in-progress'
        ? data.implementation
        : 'not-started',
    fields: Object.fromEntries(
      Object.entries(record(data.fields)).map(([key, field]) => [string(key, 240), string(field)]),
    ),
    tags: [
      ...new Set(
        strings(data.tags)
          .map((tag) => string(tag.trim(), 240))
          .filter(Boolean),
      ),
    ].slice(0, 20),
    references: [...new Set(strings(data.references))].slice(0, 1000),
    comments: array(data.comments)
      .slice(0, 200)
      .map((value, index) => {
        const comment = record(value);
        return {
          id: string(comment.id) || `comment-${index}`,
          author: string(comment.author, 240),
          text: string(comment.text),
          createdAt: Math.max(-8.64e15, Math.min(8.64e15, finite(comment.createdAt))),
          resolved: comment.resolved === true,
        };
      }),
    table: {
      columns,
      rows: array(table.rows)
        .slice(0, 200)
        .map((row) => columns.map((_, index) => string(array(row)[index]))),
    },
  };
}
