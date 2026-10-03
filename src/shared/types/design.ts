/** Содержание игрового диздока. Геометрия остаётся в узлах канваса. */
export const CARD_TYPES = {
  concept: 'Концепт',
  mechanic: 'Механика',
  character: 'Персонаж',
  enemy: 'Противник',
  item: 'Предмет',
  resource: 'Ресурс',
  location: 'Локация',
  quest: 'Квест',
  playtest: 'Плейтест',
} as const;
export type CardType = keyof typeof CARD_TYPES;
export const DESIGN_STATUSES = {
  idea: 'Идея',
  testing: 'Нужно проверить',
  validated: 'Проверено',
  deferred: 'Отложено',
} as const;
export type DesignStatus = keyof typeof DESIGN_STATUSES;
export const RELATION_TYPES = {
  requires: 'Требует',
  consumes: 'Расходует',
  gives: 'Даёт',
  unlocks: 'Открывает',
  transitions: 'Переходит в',
  related: 'Связано с',
} as const;
export type RelationType = keyof typeof RELATION_TYPES;

export interface DesignComment {
  id: string;
  author: string;
  text: string;
  createdAt: number;
  resolved: boolean;
}

export interface ParameterTable {
  columns: string[];
  rows: string[][];
}

export interface DesignCard {
  kind: 'card';
  cardType: CardType;
  title: string;
  summary: string;
  status: DesignStatus;
  implementation: 'not-started' | 'in-progress' | 'done';
  tags: string[];
  /** Названия полей человекочитаемые: правила, ограничения, гипотеза и т.д. */
  fields: Record<string, string>;
  references: string[];
  comments: DesignComment[];
  table: ParameterTable;
}

export interface DesignSection {
  kind: 'section';
  title: string;
  description: string;
  children: string[];
  collapsed: boolean;
  /** Порядок чтения не зависит от положения на холсте. */
  readingOrder: number;
}

export interface DesignReference {
  kind: 'reference';
  targetId: string;
}

export type DesignContent = DesignCard | DesignSection | DesignReference;
