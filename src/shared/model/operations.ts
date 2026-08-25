/**
 * Чистые операции над документом. Стор их вызывает, сам логику не держит.
 * Пока заглушки.
 */

import type { BoardDocument, Id, Node } from '@/shared/types/document';

const notImplemented = (what: string): never => {
  throw new Error(`не реализовано: ${what}`);
};

export function addNode(_doc: BoardDocument, _node: Node): BoardDocument {
  return notImplemented('addNode');
}

/**
 * Инвариант 4: удаление узла обязано отвязать все ссылающиеся на него Endpoint,
 * подставив им последние вычисленные координаты в point.
 * Сами коннекторы при этом НЕ удаляются.
 */
export function removeNode(_doc: BoardDocument, _nodeId: Id): BoardDocument {
  return notImplemented('removeNode');
}
