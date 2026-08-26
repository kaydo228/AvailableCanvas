/**
 * Геометрия соединителей. Чистые функции, без React и без стора.
 *
 * Инвариант 3 из раздела 5 ТЗ — «у Endpoint задан ровно один из nodeId
 * или point» — обеспечивается КОНСТРУКЦИЕЙ: наружу торчат только
 * `pointEndpoint` и `nodeEndpoint`, и собрать конец с обоими полями
 * или без единого через них нельзя. Проверять постфактум ненадёжно:
 * достаточно одного места, где объект собрали руками.
 */

import type { WorldPoint } from '@/features/canvas/engine/contract';
import type {
  Anchor,
  BoardDocument,
  BoxNode,
  ConnectorNode,
  Endpoint,
  Id,
  Node,
} from '@/shared/types/document';

/** Стороны, к которым можно привязаться. `auto` сюда не входит: это не сторона. */
export type SideAnchor = Exclude<Anchor, 'auto'>;

export const SIDE_ANCHORS: readonly SideAnchor[] = ['top', 'right', 'bottom', 'left'];

// ─── Конструкторы концов ────────────────────────────────────────────────

/** Свободный конец. */
export function pointEndpoint(point: WorldPoint): Endpoint {
  return { point: { x: point.x, y: point.y } };
}

/** Конец, привязанный к узлу. */
export function nodeEndpoint(nodeId: Id, anchor: Anchor = 'auto'): Endpoint {
  return { nodeId, anchor };
}

/** Проверка инварианта 3. Нужна тестам и валидации импортируемых документов. */
export function isValidEndpoint(endpoint: Endpoint): boolean {
  const hasNode = endpoint.nodeId !== undefined;
  const hasPoint = endpoint.point !== undefined;
  return hasNode !== hasPoint;
}

// ─── Точки на рамке узла ────────────────────────────────────────────────

export function centerOf(node: BoxNode): WorldPoint {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

/** Середина стороны рамки. */
export function anchorPoint(node: BoxNode, anchor: SideAnchor): WorldPoint {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;

  switch (anchor) {
    case 'top':
      return { x: cx, y: node.y };
    case 'bottom':
      return { x: cx, y: node.y + node.height };
    case 'left':
      return { x: node.x, y: cy };
    case 'right':
      return { x: node.x + node.width, y: cy };
    default:
      // Значение вне типа приходит из импортированного документа: типы там
      // никто не проверял. Без этой ветки switch возвращает undefined,
      // и обращение к `.x` роняет весь слой, а не одну линию.
      return { x: cx, y: cy };
  }
}

/**
 * Сторона, выбранная сама — режим `auto`.
 *
 * Сравниваются не абсолютные смещения, а доли от полуразмеров: у широкой
 * низкой фигуры почти любая цель оказывается «сбоку» по абсолютной величине,
 * и линия лезла бы из торца вместо верха.
 */
export function autoAnchor(node: BoxNode, toward: WorldPoint): SideAnchor {
  const center = centerOf(node);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;

  const halfW = Math.max(node.width / 2, 1e-6);
  const halfH = Math.max(node.height / 2, 1e-6);

  if (Math.abs(dx) / halfW >= Math.abs(dy) / halfH) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

// ─── Разрешение концов в мировые точки ──────────────────────────────────

function boxNode(document: BoardDocument, id: Id): BoxNode | null {
  const node: Node | undefined = document.nodes[id];
  if (!node || node.type === 'connector') return null;
  return node;
}

/**
 * Ориентир конца: точка, к которой тянется противоположная сторона.
 * Для привязанного конца это центр фигуры, для свободного — сама точка.
 * Нужен, чтобы разрешить `auto` на обоих концах разом и без рекурсии.
 */
export function referencePoint(endpoint: Endpoint, document: BoardDocument): WorldPoint | null {
  if (endpoint.point) return endpoint.point;
  if (endpoint.nodeId) {
    const node = boxNode(document, endpoint.nodeId);
    return node ? centerOf(node) : null;
  }
  return null;
}

/**
 * Мировая точка конца. `toward` — ориентир противоположного конца,
 * от него зависит выбор стороны в режиме `auto`.
 */
export function resolveEndpoint(
  endpoint: Endpoint,
  document: BoardDocument,
  toward: WorldPoint,
): WorldPoint | null {
  if (endpoint.point) return endpoint.point;
  if (!endpoint.nodeId) return null;

  const node = boxNode(document, endpoint.nodeId);
  if (!node) return null;

  /*
   * Неизвестное значение ведёт себя как `auto` — ТАК ЖЕ, как в routing.ts.
   * Раньше здесь был откат на центр рамки, а там на автоподбор стороны:
   * линия рисовалась из якоря, а при удалении фигуры конец отвязывался
   * в центр, то есть прыгал. Два отката на один случай — всегда расхождение.
   */
  const anchor = endpoint.anchor ?? 'auto';
  const known = SIDE_ANCHORS.includes(anchor as SideAnchor);
  const side: SideAnchor = known ? (anchor as SideAnchor) : autoAnchor(node, toward);
  return anchorPoint(node, side);
}

/** Обе точки линии. `null` — конец ссылается на исчезнувший узел. */
export function connectorEnds(
  connector: ConnectorNode,
  document: BoardDocument,
): { from: WorldPoint; to: WorldPoint } | null {
  const fromRef = referencePoint(connector.from, document);
  const toRef = referencePoint(connector.to, document);
  if (!fromRef || !toRef) return null;

  const from = resolveEndpoint(connector.from, document, toRef);
  const to = resolveEndpoint(connector.to, document, fromRef);
  if (!from || !to) return null;

  return { from, to };
}

/** Плоский массив координат для Konva.Line и Konva.Arrow. */
export function straightPoints(from: WorldPoint, to: WorldPoint): number[] {
  return [from.x, from.y, to.x, to.y];
}

// ─── Поиск цели под курсором (этап 2) ───────────────────────────────────

/**
 * Верхняя фигура под точкой. Идём с конца `order`: он снизу вверх,
 * значит последний подходящий и есть видимый сверху.
 *
 * Коннекторы пропускаем: цепляться линией за линию нельзя, у неё нет рамки.
 */
export function nodeAtPoint(document: BoardDocument, point: WorldPoint): BoxNode | null {
  for (let i = document.order.length - 1; i >= 0; i -= 1) {
    const id = document.order[i];
    if (!id) continue;
    const node = boxNode(document, id);
    if (!node) continue;

    if (
      point.x >= node.x &&
      point.x <= node.x + node.width &&
      point.y >= node.y &&
      point.y <= node.y + node.height
    ) {
      return node;
    }
  }
  return null;
}

/** Ближайший якорь фигуры к точке и расстояние до него в мировых единицах. */
export function nearestAnchor(
  node: BoxNode,
  point: WorldPoint,
): { anchor: SideAnchor; distance: number } {
  let best: SideAnchor = 'top';
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const side of SIDE_ANCHORS) {
    const at = anchorPoint(node, side);
    const distance = Math.hypot(at.x - point.x, at.y - point.y);
    if (distance < bestDistance) {
      best = side;
      bestDistance = distance;
    }
  }

  return { anchor: best, distance: bestDistance };
}

/**
 * Радиус прилипания к якорю в ЭКРАННЫХ пикселях: на любом зуме целиться
 * приходится одинаково, а в мировых единицах на мелком зуме якорь стал бы
 * недосягаем, на крупном — прилипал бы через пол-экрана.
 */
export const ANCHOR_SNAP_SCREEN = 18;

/**
 * Куда привязать конец, если отпустили в этой точке.
 *
 * Отпустили близко к якорю — эта сторона. Отпустили внутри фигуры, но мимо
 * якорей — `auto`: человек показал фигуру, а не сторону, и решать, откуда
 * выходить линии, должна программа. Мимо фигуры — свободная точка.
 */
export function endpointAt(document: BoardDocument, point: WorldPoint, zoom: number): Endpoint {
  const node = nodeAtPoint(document, point);
  if (!node) return pointEndpoint(point);

  const { anchor, distance } = nearestAnchor(node, point);
  const snap = ANCHOR_SNAP_SCREEN / Math.max(zoom, 1e-6);

  return nodeEndpoint(node.id, distance <= snap ? anchor : 'auto');
}
