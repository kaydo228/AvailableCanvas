/**
 * Оповещение между вкладками (П3, П4 из docs/nightly/shell/01-план-починки.md).
 *
 * Хранилище одно на все вкладки, а знали они друг о друге ровно ничего: две
 * вкладки на одном проекте затирали правки друг друга последней записью,
 * и обе показывали «Все изменения сохранены».
 *
 * `BroadcastChannel`, а не `storage`-событие: последнее живёт в localStorage,
 * которого здесь нет, и не умеет структурированные сообщения.
 *
 * Канал — уведомление, а не источник правды. Пропущенное сообщение ничего
 * не ломает: запись всё равно сверяется с базой в `saveDocument`. Поэтому
 * отсутствие `BroadcastChannel` в окружении — не повод падать.
 */

import type { Id } from '@/shared/types/document';

export type BoardEvent =
  /** Документ проекта переписан другой вкладкой. */
  | { kind: 'saved'; projectId: Id; updatedAt: number }
  /** Проект удалён другой вкладкой. */
  | { kind: 'deleted'; projectId: Id }
  /** Список проектов изменился: создание, переименование, дублирование. */
  | { kind: 'projects-changed' };

const CHANNEL = 'prostor';

const channel: BroadcastChannel | null =
  typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;

/** Рассылает событие остальным вкладкам. Себе оно не приходит — так устроен канал. */
export const publish = (event: BoardEvent): void => {
  channel?.postMessage(event);
};

/** Подписка. Возвращает отписку — вызывать в cleanup эффекта. */
export const subscribe = (listener: (event: BoardEvent) => void): (() => void) => {
  if (!channel) return () => {};

  const handler = (message: MessageEvent<BoardEvent>) => listener(message.data);
  channel.addEventListener('message', handler);
  return () => channel.removeEventListener('message', handler);
};
