import type { CardType, RelationType } from '@/shared/types/design';
export const TEMPLATE_LABELS = {
  concept: 'Концепт',
  loop: 'Игровой цикл',
  mechanic: 'Механика',
  enemy: 'Противник',
  level: 'Уровень',
  quest: 'Квест',
  playtest: 'Плейтест',
} as const;
export type TemplateId = keyof typeof TEMPLATE_LABELS;
export const CARD_FIELDS: Record<CardType, string[]> = {
  concept: ['Фантазия игрока', 'Для кого', 'Ключевой опыт', 'Отличие'],
  mechanic: ['Действие игрока', 'Правила', 'Условия', 'Результат', 'Ограничения'],
  character: ['Роль', 'Мотивация', 'Способности'],
  enemy: ['Поведение', 'Атаки', 'Слабости', 'Награда'],
  item: ['Эффект', 'Получение', 'Ограничения'],
  resource: ['Источник', 'Расход', 'Лимит'],
  location: ['Цель', 'Маршрут', 'Препятствия', 'Атмосфера'],
  quest: ['Цель', 'Условия', 'Шаги', 'Награда'],
  playtest: ['Гипотеза', 'Сценарий', 'Наблюдения', 'Решение'],
};
type Template = { cards: [CardType, string][]; relation: RelationType };
export const TEMPLATES: Record<TemplateId, Template> = {
  concept: {
    cards: [
      ['concept', 'Идея игры'],
      ['character', 'Игрок'],
      ['location', 'Мир'],
    ],
    relation: 'related',
  },
  loop: {
    cards: [
      ['mechanic', 'Действие'],
      ['resource', 'Награда'],
      ['mechanic', 'Развитие'],
    ],
    relation: 'transitions',
  },
  mechanic: {
    cards: [
      ['mechanic', 'Правило'],
      ['resource', 'Стоимость'],
      ['playtest', 'Проверка механики'],
    ],
    relation: 'requires',
  },
  enemy: {
    cards: [
      ['enemy', 'Противник'],
      ['item', 'Награда'],
      ['playtest', 'Проверка боя'],
    ],
    relation: 'related',
  },
  level: {
    cards: [
      ['location', 'Уровень'],
      ['enemy', 'Препятствие'],
      ['quest', 'Цель уровня'],
    ],
    relation: 'transitions',
  },
  quest: {
    cards: [
      ['quest', 'Квест'],
      ['character', 'Заказчик'],
      ['item', 'Награда'],
    ],
    relation: 'related',
  },
  playtest: {
    cards: [
      ['playtest', 'Плейтест'],
      ['mechanic', 'Проверяемая механика'],
    ],
    relation: 'related',
  },
};
