/**
 * Чистые операции над документом. Стор их вызывает, сам логику не держит.
 */

import { connectorEnds, pointEndpoint } from '@/features/canvas/connectors/geometry';
import type { BoardDocument, Id, Node } from '@/shared/types/document';

export function addNode(document: BoardDocument, node: Node): BoardDocument {
  // Инвариант 1: узел обязан попасть И в nodes, И в order.
  return {
    ...document,
    nodes: { ...document.nodes, [node.id]: node },
    order: [...document.order, node.id],
  };
}

/**
 * Инвариант 4: удаление узла обязано отвязать все ссылающиеся на него
 * `Endpoint`, подставив им последние вычисленные координаты в `point`.
 * Сами коннекторы при этом НЕ удаляются.
 *
 * Порядок принципиален: координаты якорей считаются ДО удаления, пока узел
 * ещё в документе. После удаления считать уже не от чего, и конец пришлось бы
 * ставить в ноль — линия прыгнула бы в начало координат.
 */
export function removeNode(document: BoardDocument, nodeId: Id): BoardDocument {
  if (!document.nodes[nodeId]) return document;

  const nodes: Record<Id, Node> = {};

  for (const [id, node] of Object.entries(document.nodes)) {
    if (id === nodeId) continue;

    if (node.type !== 'connector') {
      nodes[id] = node;
      continue;
    }

    const touchesFrom = node.from.nodeId === nodeId;
    const touchesTo = node.to.nodeId === nodeId;

    if (!touchesFrom && !touchesTo) {
      nodes[id] = node;
      continue;
    }

    // Считаем от исходного документа: удаляемый узел ещё на месте.
    const ends = connectorEnds(node, document);

    nodes[id] = {
      ...node,
      ...(touchesFrom && ends ? { from: pointEndpoint(ends.from) } : {}),
      ...(touchesTo && ends ? { to: pointEndpoint(ends.to) } : {}),
    };
  }

  return {
    ...document,
    nodes,
    order: document.order.filter((id) => id !== nodeId),
  };
}

/** Удаление набора узлов. Отвязка считается на каждом шаге по-честному. */
export function removeNodes(document: BoardDocument, ids: Id[]): BoardDocument {
  return ids.reduce((acc, id) => removeNode(acc, id), document);
}
