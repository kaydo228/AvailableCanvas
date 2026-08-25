/**
 * Рамка выделения: какие узлы она задела.
 *
 * «Задела» — именно пересечение, а не полное накрытие: чтобы выделить
 * большую картинку, пришлось бы обводить её целиком, а это неудобно
 * и расходится с тем, как ведут себя все редакторы.
 */

import type { Rect } from '@/features/canvas/engine/contract';
import type { BoardDocument, Id, Node } from '@/shared/types/document';

/** Габариты узла в мировых координатах. У коннектора рамки нет. */
export function boundsOfNode(node: Node): Rect | null {
  if (node.type === 'connector') return null;
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Узлы, задетые рамкой, в порядке отрисовки снизу вверх.
 *
 * Заблокированные пропускаются: замок в инспекторе должен защищать
 * и от случайного захвата рамкой, иначе он бесполезен.
 */
export function nodesInBox(document: BoardDocument, box: Rect): Id[] {
  // Вырожденная рамка — это клик, а не протяжка: выделением он занимается
  // отдельно. Без этой проверки любой клик по узлу «задевал» бы его рамкой
  // нулевой площади и сбрасывал набор до одного элемента.
  if (box.width <= 0 || box.height <= 0) return [];

  const hits: Id[] = [];

  for (const id of document.order) {
    const node = document.nodes[id];
    if (!node) continue;
    if (node.type !== 'connector' && node.locked) continue;

    const bounds = boundsOfNode(node);
    if (bounds && rectsIntersect(bounds, box)) hits.push(id);
  }

  return hits;
}
