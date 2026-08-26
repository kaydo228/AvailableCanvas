/**
 * Чистые операции над документом. Стор их вызывает, сам логику не держит.
 */

import {
  centerOf,
  connectorEnds,
  pointEndpoint,
  referencePoint,
  resolveEndpoint,
} from '@/features/canvas/connectors/geometry';
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
/** Конечная точка или ноль: NaN в модели дороже неточной координаты. */
const finitePoint = (p: { x: number; y: number }): { x: number; y: number } => ({
  x: Number.isFinite(p.x) ? p.x : 0,
  y: Number.isFinite(p.y) ? p.y : 0,
});

export function removeNode(document: BoardDocument, nodeId: Id): BoardDocument {
  const doomed = document.nodes[nodeId];

  // Узла нет, но мусорная запись в order могла остаться от битого импорта —
  // вычищаем её и здесь, иначе инвариант 1 не восстановить ничем.
  if (!doomed) {
    if (!document.order.includes(nodeId)) return document;
    return { ...document, order: document.order.filter((id) => id !== nodeId) };
  }

  /*
   * Object.create(null), а не {}: узел с id `__proto__` при обычном
   * присваивании уходит в сеттер прототипа и молча пропадает из nodes,
   * оставаясь в order. Такой id приходит из импортированного документа.
   */
  const nodes = Object.create(null) as Record<Id, Node>;

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

    /**
     * Запасной расчёт для случая, когда ВТОРОЙ конец не разрешается —
     * например, он уже висит на несуществующем узле после битого импорта.
     * Раньше `ends === null` отменял отвязку обоих концов сразу, и узел
     * оставался в модели висячей ссылкой навсегда: линия не рисуется,
     * починить нечем, и всё это уезжает в IndexedDB.
     */
    const detached = (which: 'from' | 'to'): { x: number; y: number } => {
      if (ends) return ends[which];

      const other = which === 'from' ? node.to : node.from;
      const toward =
        referencePoint(other, document) ??
        (doomed.type !== 'connector' ? centerOf(doomed) : { x: 0, y: 0 });

      return (
        resolveEndpoint(node[which], document, toward) ??
        (doomed.type !== 'connector' ? centerOf(doomed) : { x: 0, y: 0 })
      );
    };

    nodes[id] = {
      ...node,
      ...(touchesFrom ? { from: pointEndpoint(finitePoint(detached('from'))) } : {}),
      ...(touchesTo ? { to: pointEndpoint(finitePoint(detached('to'))) } : {}),
    };
  }

  return {
    ...document,
    // Обратно в обычный объект: Object.create(null) ломает сериализацию
    // и сравнение в тестах, а защита нужна была только на время сборки.
    nodes: { ...nodes },
    order: document.order.filter((id) => id !== nodeId),
  };
}

/** Удаление набора узлов. Отвязка считается на каждом шаге по-честному. */
export function removeNodes(document: BoardDocument, ids: Id[]): BoardDocument {
  return ids.reduce((acc, id) => removeNode(acc, id), document);
}
