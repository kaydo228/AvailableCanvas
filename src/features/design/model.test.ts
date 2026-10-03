import { expect, it } from 'vitest';
import { connector, doc, shape } from '@/shared/model/fixtures';
import type { DesignCard } from '@/shared/types/design';
import type { ShapeNode } from '@/shared/types/document';
import {
  getSection,
  hiddenDesignIds,
  nodeTitle,
  resolveCard,
  searchDesign,
  toDesignMarkdown,
} from './model';

const card: DesignCard = {
  kind: 'card',
  cardType: 'mechanic',
  title: 'Прыжок',
  summary: 'Двойной',
  status: 'testing',
  implementation: 'not-started',
  fields: { Цена: 'Энергия' },
  tags: ['движение'],
  references: [],
  comments: [{ id: 'c', author: 'Ира', text: 'Проверить высоту', createdAt: 1, resolved: false }],
  table: { columns: ['A|B'], rows: [['1\n2']] },
};
const a: ShapeNode = { ...shape('a'), design: card };
const reference: ShapeNode = { ...shape('r'), design: { kind: 'reference', targetId: 'a' } };
const section: ShapeNode = {
  ...shape('s'),
  design: {
    kind: 'section',
    title: 'Бой',
    description: 'Первая секция',
    children: ['a'],
    collapsed: true,
    readingOrder: 1,
  },
};
it('resolves references without copying and clearly names a missing original', () => {
  const document = doc([a, reference]);
  expect(resolveCard(document, 'r')).toBe(a);
  expect(nodeTitle(document, 'r')).toBe('Прыжок');
  delete document.nodes.a;
  expect(resolveCard(document, 'r')).toBeNull();
  expect(nodeTitle(document, 'r')).toBe('Удалённая карточка');
});
it('hides collapsed contents and their connectors while search still finds canonical text and tags', () => {
  const document = doc([section, a, reference, connector('c', 'a', 'r')]);
  expect([...hiddenDesignIds(document)]).toEqual(['a', 'c']);
  expect(getSection(document, 'a')?.id).toBe('s');
  expect(searchDesign(document, 'движение', 'mechanic', 'testing').map((n) => n.id)).toEqual([
    'a',
    'r',
  ]);
  expect(searchDesign(document, 'Энергия').map((n) => n.id)).toEqual(['a', 'r']);
});
it('exports cards once, reference links, reading order, escaped tables and comments', () => {
  const text = toDesignMarkdown(doc([reference, a, section]), 'Игра');
  expect(text.indexOf('## Бой')).toBeLessThan(text.indexOf('### Прыжок'));
  expect(text.match(/### Прыжок/g)).toHaveLength(1);
  expect(text).toContain('[Прыжок](#node-a)');
  expect(text).toContain('A\\|B');
  expect(text).toContain('1<br>2');
  expect(text).toContain('Ира');
  expect(text).toContain('Проверить высоту');
});
