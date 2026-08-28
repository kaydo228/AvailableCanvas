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
import { rotatePoint } from '@/features/canvas/selection/rotate';
import type { BoardDocument, BoxNode, Id, Node } from '@/shared/types/document';

/**
 * Прозрачность в модели — 0..1 (см. `BaseNode`). Выход за диапазон роняет
 * отрисовку: Konva кэширует узел в холст нулевого размера и бросает
 * `InvalidStateError: drawImage` на КАЖДОМ кадре, а не один раз.
 *
 * Оболочка зажимает её на входе документа, но диапазон принадлежит модели,
 * а не одному входу: `updateNode` зовут и из панели свойств, и из инструментов
 * холста, и мимо санитайзера.
 */
export const clampOpacity = (opacity: number): number => {
  if (!Number.isFinite(opacity)) return 1;
  return Math.min(1, Math.max(0, opacity));
};

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

/* ─── Группы ─────────────────────────────────────────────────────────────── */

/**
 * Группа хранится плоско: узлы остаются в `nodes` и `order` на верхнем уровне,
 * `GroupNode.children` перечисляет состав, `BaseNode.groupId` смотрит обратно.
 * Двусторонняя связь избыточна намеренно — по ней ходят в обе стороны, и
 * пересчитывать одну из сторон обходом всего документа было бы дороже.
 *
 * Обходы ниже защищены от циклов: документ приходит из файла, и группа,
 * ссылающаяся на саму себя, — это не гипотеза, а один из проверенных входов.
 */

/** Верхняя группа, в которую входит узел. Сам узел, если он ни в какой. */
export function topmostGroup(document: BoardDocument, id: Id): Id {
  const seen = new Set<Id>([id]);
  let current = id;

  for (;;) {
    const node = document.nodes[current];
    const parent = node && node.type !== 'connector' ? node.groupId : undefined;
    if (parent === undefined || seen.has(parent) || !document.nodes[parent]) return current;
    seen.add(parent);
    current = parent;
  }
}

/**
 * Переданные узлы вместе со всем содержимым групп, включая вложенные.
 * Порядок сохраняется, дубли убираются: узел мог прийти и сам, и через группу.
 */
export function withGroupDescendants(document: BoardDocument, ids: Iterable<Id>): Id[] {
  const result: Id[] = [];
  const seen = new Set<Id>();

  const visit = (id: Id): void => {
    if (seen.has(id)) return;
    seen.add(id);
    result.push(id);

    const node = document.nodes[id];
    if (node?.type === 'group') for (const child of node.children) visit(child);
  };

  for (const id of ids) visit(id);
  return result;
}

/**
 * Углы узла с учётом поворота. Konva вращает узел вокруг его `x, y`, то есть
 * вокруг левого верхнего угла, — здесь та же математика.
 */
const corners = (node: BoxNode): { x: number; y: number }[] => {
  const origin = { x: node.x, y: node.y };

  return [
    { dx: 0, dy: 0 },
    { dx: node.width, dy: 0 },
    { dx: node.width, dy: node.height },
    { dx: 0, dy: node.height },
  ].map(({ dx, dy }) => rotatePoint({ x: node.x + dx, y: node.y + dy }, origin, node.rotation));
};

/**
 * Рамка группы по её содержимому. `null` — считать не от чего: у группы
 * без детей или из одних коннекторов рамки нет.
 *
 * Углы берутся с учётом поворота ребёнка, а не по паре `x, y` и размеру:
 * повёрнутый ребёнок вылезал бы за рамку, и группа переставала бы охватывать
 * то, что в ней лежит. Заодно это делает поворот группы обратимым — центр
 * рамки при повороте на прямой угол остаётся на месте, и возврат угла
 * возвращает состав туда, где он был.
 */
export function groupBounds(
  document: BoardDocument,
  groupId: Id,
): { x: number; y: number; width: number; height: number } | null {
  const group = document.nodes[groupId];
  if (group?.type !== 'group') return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  // Вложенные группы разворачиваем: их собственная рамка могла устареть,
  // а рамка внешней группы обязана быть верной сама по себе.
  for (const id of withGroupDescendants(document, group.children)) {
    const node = document.nodes[id];
    if (!node || node.type === 'connector' || node.type === 'group') continue;
    for (const corner of corners(node)) {
      minX = Math.min(minX, corner.x);
      minY = Math.min(minY, corner.y);
      maxX = Math.max(maxX, corner.x);
      maxY = Math.max(maxY, corner.y);
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
