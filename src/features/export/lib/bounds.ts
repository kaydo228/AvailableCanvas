/**
 * Габариты содержимого доски в мировых координатах (FR-12).
 *
 * Считаются по узлам документа, а не по видимой области: экспортировать надо
 * всю доску целиком, где бы сейчас ни стояла камера. Видимая область к делу
 * отношения не имеет — по ней обрезалось бы всё, что не влезло в экран.
 */

import type { BoardDocument, BoxNode, Id } from '@/shared/types/document';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Поля вокруг содержимого: обводка рисуется по краю и без запаса срезается. */
export const EXPORT_PADDING = 24;

interface Point {
  x: number;
  y: number;
}

/**
 * Углы узла с учётом поворота. Konva вращает вокруг точки `x, y`, то есть
 * вокруг левого верхнего угла, — здесь та же математика, иначе повёрнутый
 * узел вылезет за посчитанную рамку.
 */
const corners = (node: BoxNode): Point[] => {
  const { x, y, width, height } = node;
  const radians = (node.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return [
    { dx: 0, dy: 0 },
    { dx: width, dy: 0 },
    { dx: width, dy: height },
    { dx: 0, dy: height },
  ].map(({ dx, dy }) => ({ x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos }));
};

/**
 * Рамка вокруг перечисленных узлов или `null`, если считать нечего.
 *
 * У коннектора рамки нет (см. `ConnectorNode`), поэтому от него берутся
 * свободные концы: привязанные и так лежат на фигурах, которые уже посчитаны.
 */
export const boundsOf = (
  document: BoardDocument,
  ids: Iterable<Id>,
  padding = EXPORT_PADDING,
): Box | null => {
  const points: Point[] = [];

  for (const id of ids) {
    const node = document.nodes[id];
    if (!node) continue;

    if (node.type === 'connector') {
      for (const endpoint of [node.from, node.to]) {
        if (endpoint.point) points.push(endpoint.point);
      }
      continue;
    }

    points.push(...corners(node));
  }

  const first = points[0];
  if (!first) return null;

  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
};
