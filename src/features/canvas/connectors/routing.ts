/**
 * Прокладка маршрута соединителя: прямая, ломаная под прямым углом, кривая.
 *
 * Единственная точка правды о маршруте. Рендерер, подпись и всё остальное
 * берут точки отсюда: три места, считающие маршрут по-своему, разъедутся
 * на второй неделе.
 *
 * Возвращается ПЛОСКИЙ массив чисел, а не объект. Причина не в красоте:
 * `shallow` из zustand сравнивает объекты на один уровень через `Object.is`,
 * и объект с полем-массивом давал бы новую ссылку на каждый вызов —
 * то есть цикл перерендеров. Массив чисел он сравнивает поэлементно.
 */

import type { WorldPoint } from '@/features/canvas/engine/contract';
import type { BoardDocument, ConnectorNode, Endpoint } from '@/shared/types/document';

import {
  anchorPoint,
  autoAnchor,
  centerOf,
  referencePoint,
  SIDE_ANCHORS,
  type SideAnchor,
} from './geometry';

/** Длина вылета из фигуры в мировых единицах. */
export const STUB = 16;
/** Меньше этого вылет перестаёт быть заметным. */
export const MIN_STUB = 4;
/** Ниже этой дистанции маршрут вырождается в прямую. */
export const DEGENERATE = 1e-6;

/** Внешняя нормаль стороны. */
const NORMALS: Record<SideAnchor, WorldPoint> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

interface Side {
  point: WorldPoint;
  normal: WorldPoint;
  /** Рамка фигуры, если конец к ней привязан. Нужна ветке обхода. */
  box: { x: number; y: number; width: number; height: number } | null;
}

/**
 * Точка якоря, внешняя нормаль и рамка для одного конца.
 * У свободного конца нормаль выводится из направления на противоположный
 * конец по доминирующей оси — тем же правилом, что и `autoAnchor`.
 */
function sideOf(endpoint: Endpoint, document: BoardDocument, toward: WorldPoint): Side | null {
  if (endpoint.point) {
    const dx = toward.x - endpoint.point.x;
    const dy = toward.y - endpoint.point.y;
    const normal =
      Math.abs(dx) >= Math.abs(dy)
        ? { x: Math.sign(dx) || 1, y: 0 }
        : { x: 0, y: Math.sign(dy) || 1 };
    return { point: endpoint.point, normal, box: null };
  }

  if (!endpoint.nodeId) return null;
  const node = document.nodes[endpoint.nodeId];
  if (!node || node.type === 'connector') return null;

  const anchor = endpoint.anchor ?? 'auto';
  /*
   * Значение вне типа приходит из импортированного документа и ведёт себя
   * как `auto`. Без этой проверки NORMALS[side] даёт undefined, и линия
   * роняет весь слой, а не только себя.
   */
  const known = SIDE_ANCHORS.includes(anchor as SideAnchor);
  const side: SideAnchor = known ? (anchor as SideAnchor) : autoAnchor(node, toward);

  return {
    point: anchorPoint(node, side),
    normal: NORMALS[side],
    box: { x: node.x, y: node.y, width: node.width, height: node.height },
  };
}

const isHorizontal = (n: WorldPoint) => n.y === 0;

/** Вылет ужимается до половины дистанции, но не короче MIN_STUB. */
function stubLength(from: WorldPoint, to: WorldPoint): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.max(MIN_STUB, Math.min(STUB, distance / 2));
}

const shift = (p: WorldPoint, n: WorldPoint, by: number): WorldPoint => ({
  x: p.x + n.x * by,
  y: p.y + n.y * by,
});

/** Объединяющая рамка двух связанных фигур. Обходим только их. */
function unionBox(a: Side, b: Side) {
  const boxes = [a.box, b.box].filter((box) => box !== null);
  if (boxes.length === 0) return null;

  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { minX, minY, maxX, maxY };
}

const EPS = 1e-9;

/**
 * Убирает дубли и коллинеарные точки.
 *
 * Ломаная с ужатым вылетом легко выдаёт две совпадающие точки подряд или
 * три точки на одной прямой: при малом зазоре разрез «посередине» попадает
 * ровно между концами вылетов. Konva такое нарисует, но hit-тест, подсчёт
 * середины по длине дуги и касательная для стрелки получают нулевые сегменты.
 */
function simplify(points: WorldPoint[]): WorldPoint[] {
  const out: WorldPoint[] = [];

  for (const point of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - point.x) < EPS && Math.abs(last.y - point.y) < EPS) {
      continue;
    }
    out.push(point);
  }

  for (let i = out.length - 2; i > 0; i -= 1) {
    const a = out[i - 1] as WorldPoint;
    const b = out[i] as WorldPoint;
    const c = out[i + 1] as WorldPoint;
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) < EPS) out.splice(i, 1);
  }

  // Меньше двух точек Konva не нарисует.
  return out.length >= 2 ? out : [points[0] as WorldPoint, points[points.length - 1] as WorldPoint];
}

const flatten = (points: WorldPoint[]): number[] => simplify(points).flatMap((p) => [p.x, p.y]);

/**
 * Ломаная под прямым углом.
 *
 * Обходятся только две фигуры, которые эта линия соединяет. Третьи фигуры
 * не обходятся: это A*-роутинг, он вне ТЗ. Ограничение осознанное.
 */
export function elbowPoints(from: Side, to: Side): number[] {
  const stub = stubLength(from.point, to.point);
  const s1 = shift(from.point, from.normal, stub);
  const s2 = shift(to.point, to.normal, stub);

  const h1 = isHorizontal(from.normal);
  const h2 = isHorizontal(to.normal);

  // Перпендикулярные стороны: одна точка перегиба на пересечении лучей.
  if (h1 !== h2) {
    const corner = h1 ? { x: s2.x, y: s1.y } : { x: s1.x, y: s2.y };
    return flatten([from.point, s1, corner, s2, to.point]);
  }

  /*
   * Одна ось. Смотрят ли нормали навстречу друг другу?
   *
   * Считается по ЯКОРЯМ, а не по концам вылетов. Вылет ужимается до половины
   * зазора, поэтому при зазоре меньше двух вылетов концы вылетов совпадают,
   * разность обращается в ноль, `Math.sign(0)` даёт 0 — и ветка «навстречу»
   * не срабатывала никогда. На доске это выглядело как шип наружу посреди
   * короткого промежутка между двумя фигурами.
   */
  const facing = from.normal.x + to.normal.x === 0 && from.normal.y + to.normal.y === 0;
  const projection =
    (to.point.x - from.point.x) * from.normal.x + (to.point.y - from.point.y) * from.normal.y;
  const towardEachOther = facing && projection >= 0;

  if (towardEachOther) {
    const mid = h1 ? (s1.x + s2.x) / 2 : (s1.y + s2.y) / 2;
    const bend1 = h1 ? { x: mid, y: s1.y } : { x: s1.x, y: mid };
    const bend2 = h1 ? { x: mid, y: s2.y } : { x: s2.x, y: mid };
    return flatten([from.point, s1, bend1, bend2, s2, to.point]);
  }

  /*
   * Сонаправленные («обе вправо») или врозь («спиной к спине»).
   * Прямо между вылетами идти нельзя — при равной высоте фигур маршрут
   * прошёл бы насквозь через дальнюю. Поэтому сначала поперёк, за пределы
   * объединяющей рамки, потом вдоль, потом обратно.
   */
  const union = unionBox(from, to);
  let across: number;

  if (h1) {
    const near = union
      ? Math.min(union.minY - stub, Math.min(s1.y, s2.y) - stub)
      : Math.min(s1.y, s2.y) - stub;
    const far = union
      ? Math.max(union.maxY + stub, Math.max(s1.y, s2.y) + stub)
      : Math.max(s1.y, s2.y) + stub;
    const middle = (s1.y + s2.y) / 2;
    across = middle - near <= far - middle ? near : far;
    return flatten([from.point, s1, { x: s1.x, y: across }, { x: s2.x, y: across }, s2, to.point]);
  }

  const near = union
    ? Math.min(union.minX - stub, Math.min(s1.x, s2.x) - stub)
    : Math.min(s1.x, s2.x) - stub;
  const far = union
    ? Math.max(union.maxX + stub, Math.max(s1.x, s2.x) + stub)
    : Math.max(s1.x, s2.x) + stub;
  const middle = (s1.x + s2.x) / 2;
  across = middle - near <= far - middle ? near : far;

  return flatten([from.point, s1, { x: across, y: s1.y }, { x: across, y: s2.y }, s2, to.point]);
}

/** Плечо контрольной точки кубической Безье. */
export function controlArm(distance: number): number {
  return Math.max(12, Math.min(160, distance * 0.5));
}

/**
 * Кубическая Безье. Konva при `bezier` читает 2 + 6k чисел, поэтому
 * одна кривая — ровно восемь: начало, две контрольные, конец.
 */
export function curvePoints(from: Side, to: Side): number[] {
  const distance = Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y);
  const arm = controlArm(distance);

  const c1 = shift(from.point, from.normal, arm);
  const c2 = shift(to.point, to.normal, arm);

  // Без simplify: у Безье это не вершины полилинии, а контрольные точки,
  // и «коллинеарную» среди них убирать нельзя — Konva ждёт ровно 2 + 6k.
  return [from.point, c1, c2, to.point].flatMap((p) => [p.x, p.y]);
}

/**
 * Точки маршрута. Плоский массив, пригодный прямо для `Konva.Line`.
 * `null` — конец ссылается на исчезнувший узел.
 */
export function connectorPoints(
  connector: ConnectorNode,
  document: BoardDocument,
): number[] | null {
  const fromRef = referencePoint(connector.from, document);
  const toRef = referencePoint(connector.to, document);
  if (!fromRef || !toRef) return null;

  const from = sideOf(connector.from, document, toRef);
  const to = sideOf(connector.to, document, fromRef);
  if (!from || !to) return null;

  // Нефинитные координаты приходят из битого импорта. Пустить их в маршрут
  // значит записать NaN в модель и потерять линию навсегда.
  if (![from.point.x, from.point.y, to.point.x, to.point.y].every(Number.isFinite)) {
    return null;
  }

  const distance = Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y);
  // Вырожденный случай общий для всех трёх режимов: гнуть и кривить нечего.
  if (distance < DEGENERATE) {
    return flatten([from.point, to.point]);
  }

  switch (connector.routing) {
    case 'elbow':
      return elbowPoints(from, to);
    case 'curve':
      return curvePoints(from, to);
    default:
      return flatten([from.point, to.point]);
  }
}

/** Рисуется ли маршрут как кривая. Выводится из режима, подписки не требует. */
export function isBezier(connector: ConnectorNode, points: number[]): boolean {
  // Вырожденный маршрут всегда прямой, даже в режиме кривой:
  // Konva на двух точках с bezier не отрисует ничего.
  return connector.routing === 'curve' && points.length >= 8;
}

export { centerOf };
