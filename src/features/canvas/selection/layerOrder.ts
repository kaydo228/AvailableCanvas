/**
 * Порядок слоёв: `order` — снизу вверх, последний элемент рисуется поверх всех.
 *
 * Чистые функции над массивом идентификаторов. Логика вынесена сюда, потому
 * что при множественном выделении она неочевидна: сдвигать выделенные узлы
 * надо так, чтобы их взаимный порядок не менялся, а для этого важно, с какого
 * конца идти.
 */

import type { Id } from '@/shared/types/document';

/**
 * Сдвиг выделенных на одну позицию вверх.
 *
 * Идём с верхнего конца: если начать снизу, нижний выделенный перепрыгнет
 * через своего же соседа сверху, и группа перемешается внутри себя.
 * Узел, уже упёршийся в потолок, остаётся на месте и не даёт подняться
 * следующему за ним выделенному — иначе группа «схлопнется» к верху.
 */
export function bringForward(order: Id[], ids: Id[]): Id[] {
  const selected = new Set(ids);
  const next = [...order];

  for (let i = next.length - 2; i >= 0; i -= 1) {
    const current = next[i];
    const above = next[i + 1];
    if (current === undefined || above === undefined) continue;
    if (!selected.has(current) || selected.has(above)) continue;
    next[i] = above;
    next[i + 1] = current;
  }

  return next;
}

/** Сдвиг выделенных на одну позицию вниз. Зеркально bringForward. */
export function sendBackward(order: Id[], ids: Id[]): Id[] {
  const selected = new Set(ids);
  const next = [...order];

  for (let i = 1; i < next.length; i += 1) {
    const current = next[i];
    const below = next[i - 1];
    if (current === undefined || below === undefined) continue;
    if (!selected.has(current) || selected.has(below)) continue;
    next[i] = below;
    next[i - 1] = current;
  }

  return next;
}

/** Выделенные наверх, их взаимный порядок сохраняется. */
export function bringToFront(order: Id[], ids: Id[]): Id[] {
  const selected = new Set(ids);
  const rest = order.filter((id) => !selected.has(id));
  const moved = order.filter((id) => selected.has(id));
  return [...rest, ...moved];
}

/** Выделенные вниз, их взаимный порядок сохраняется. */
export function sendToBack(order: Id[], ids: Id[]): Id[] {
  const selected = new Set(ids);
  const rest = order.filter((id) => !selected.has(id));
  const moved = order.filter((id) => selected.has(id));
  return [...moved, ...rest];
}
