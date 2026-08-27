/**
 * Что показывать в панели для текущего выделения (FR-09).
 *
 * Чистые функции без React и стора — их можно звать из тестов и из любого
 * компонента панели. Вся логика «что общего у этих узлов» живёт здесь одна:
 * если она расползётся по секциям, разные секции начнут считать по-разному.
 */

import type { Id, Node, TextStyle } from '@/shared/types/document';

/** Что именно показывает панель прямо сейчас. */
export type InspectorMode =
  | { kind: 'canvas' }
  | { kind: 'single'; node: Node }
  | { kind: 'multi'; nodes: Node[]; sameType: Node['type'] | null };

export const inspectorMode = (nodes: Node[]): InspectorMode => {
  if (nodes.length === 0) return { kind: 'canvas' };

  const first = nodes[0];
  if (nodes.length === 1 && first) return { kind: 'single', node: first };

  const type = first?.type ?? null;
  const sameType = type !== null && nodes.every((n) => n.type === type) ? type : null;
  return { kind: 'multi', nodes, sameType };
};

/**
 * Поля, которые панель умеет показывать общими.
 *
 * Список закрытый и намеренно короткий: при разнотипном выделении общее — это
 * прозрачность и порядок слоёв, всё остальное у типов значит разное.
 */
export type CommonField =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotation'
  | 'opacity'
  | 'locked'
  | 'fill'
  | 'stroke'
  | 'strokeWidth'
  | 'textStyle';

/** У коннектора нет рамки — см. ConnectorNode в модели, у него только концы. */
const hasBox = (node: Node): boolean => node.type !== 'connector';

const hasFill = (node: Node): boolean => node.type === 'shape' || node.type === 'sticky';

const hasStroke = (node: Node): boolean =>
  node.type === 'shape' || node.type === 'connector' || node.type === 'draw';

/** `dash` есть у фигуры и коннектора, но не у рисунка. */
export const hasDash = (node: Node): boolean => node.type === 'shape' || node.type === 'connector';

/**
 * Ключ, под которым у узла лежит TextStyle. У фигуры и коннектора это `label`,
 * у текста и стикера — `text`. Одним ключом не обойтись, поэтому спрашиваем тип.
 */
export const textStyleKey = (node: Node): 'text' | 'label' | null => {
  switch (node.type) {
    case 'text':
    case 'sticky':
      return 'text';
    case 'shape':
    case 'connector':
      return 'label';
    default:
      return null;
  }
};

export const textStyleOf = (node: Node): TextStyle | undefined => {
  const key = textStyleKey(node);
  if (key === null) return undefined;
  return (node as unknown as Record<string, TextStyle | undefined>)[key];
};

/** Поля, общие для всех выделенных узлов. Порядок устойчивый — панель по нему рисует секции. */
export const commonFields = (nodes: Node[]): CommonField[] => {
  if (nodes.length === 0) return [];

  const all = (predicate: (node: Node) => boolean) => nodes.every(predicate);
  const fields: CommonField[] = [];

  // Группа рамку имеет, но сдвиг рамки её детей не двигает: `moveNodes` про
  // `children` не знает. Пока это не починено в зоне A
  // (docs/CONTRACT-REQUESTS.md, 2026-08-27 A → B), поля геометрии у группы
  // не показываем вовсе: поле, которое двигает рамку отдельно от содержимого,
  // хуже отсутствующего.
  if (all(hasBox) && !nodes.some((node) => node.type === 'group')) {
    fields.push('x', 'y', 'width', 'height', 'rotation');
  }

  // opacity и locked есть у всех типов, включая коннектор — это и есть тот
  // минимум, который остаётся при разнотипном выделении.
  fields.push('opacity', 'locked');

  if (all(hasFill)) fields.push('fill');
  if (all(hasStroke)) fields.push('stroke', 'strokeWidth');
  if (all((n) => textStyleOf(n) !== undefined)) fields.push('textStyle');

  return fields;
};

/**
 * Общее значение поля или `undefined`, если значения расходятся.
 *
 * Панель показывает `undefined` как «разные» — пустое поле с плейсхолдером,
 * а не первое попавшееся значение: показать значение первого узла и дать его
 * молча применить ко всем — это потерянные данные.
 */
export const sharedValue = <T>(nodes: Node[], read: (node: Node) => T): T | undefined => {
  if (nodes.length === 0) return undefined;
  const first = read(nodes[0] as Node);
  return nodes.every((node) => Object.is(read(node), first)) ? first : undefined;
};

/** Идентификаторы выделения — то, что уходит в updateNodes. */
export const idsOf = (nodes: Node[]): Id[] => nodes.map((node) => node.id);
