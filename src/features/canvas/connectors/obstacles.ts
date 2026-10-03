import type { WorldPoint } from '@/features/canvas/engine/contract';
import { hiddenDesignIds } from '@/features/design/model';
import type { BoardDocument, BoxNode } from '@/shared/types/document';

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface RouteEnd {
  point: WorldPoint;
  normal: WorldPoint;
}

const CLEARANCE = 12;
const EPSILON = 1e-7;

/** Konva rotates boxes about their top-left origin. */
function bounds(node: BoxNode): Bounds {
  const angle = (node.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const xs = [0, node.width * cos, -node.height * sin, node.width * cos - node.height * sin];
  const ys = [0, node.width * sin, node.height * cos, node.width * sin + node.height * cos];
  return {
    left: node.x + Math.min(...xs),
    top: node.y + Math.min(...ys),
    right: node.x + Math.max(...xs),
    bottom: node.y + Math.max(...ys),
  };
}

function distance(point: WorldPoint, box: Bounds): number {
  return Math.hypot(
    Math.max(box.left - point.x, 0, point.x - box.right),
    Math.max(box.top - point.y, 0, point.y - box.bottom),
  );
}

function crosses(a: WorldPoint, b: WorldPoint, box: Bounds): boolean {
  return a.x === b.x
    ? a.x > box.left + EPSILON &&
        a.x < box.right - EPSILON &&
        Math.max(a.y, b.y) > box.top + EPSILON &&
        Math.min(a.y, b.y) < box.bottom - EPSILON
    : a.y > box.top + EPSILON &&
        a.y < box.bottom - EPSILON &&
        Math.max(a.x, b.x) > box.left + EPSILON &&
        Math.min(a.x, b.x) < box.right - EPSILON;
}

function hits(points: WorldPoint[], box: Bounds): boolean {
  return points.some((point, i) => i > 0 && crosses(points[i - 1] as WorldPoint, point, box));
}

interface Step {
  state: number;
  cost: number;
  score: number;
}

/** Binary heap keeps route search responsive when a corridor has many blockers. */
function push(queue: Step[], step: Step) {
  let i = queue.length;
  queue.push(step);
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if ((queue[parent] as Step).score <= step.score) break;
    queue[i] = queue[parent] as Step;
    i = parent;
  }
  queue[i] = step;
}

function pop(queue: Step[]): Step {
  const first = queue[0] as Step;
  const last = queue.pop() as Step;
  if (queue.length === 0) return first;
  let i = 0;
  while (i * 2 + 1 < queue.length) {
    let child = i * 2 + 1;
    if (child + 1 < queue.length && (queue[child + 1] as Step).score < (queue[child] as Step).score)
      child += 1;
    if ((queue[child] as Step).score >= last.score) break;
    queue[i] = queue[child] as Step;
    i = child;
  }
  queue[i] = last;
  return first;
}

/** A* on obstacle boundary coordinates; no pixel sampling or whole-board grid. */
function search(from: WorldPoint, to: WorldPoint, boxes: Bounds[]): WorldPoint[] | null {
  const xs = [...new Set([from.x, to.x, ...boxes.flatMap((box) => [box.left, box.right])])].sort(
    (a, b) => a - b,
  );
  const ys = [...new Set([from.y, to.y, ...boxes.flatMap((box) => [box.top, box.bottom])])].sort(
    (a, b) => a - b,
  );
  const width = xs.length;
  const pointAt = (cell: number): WorldPoint => ({
    x: xs[cell % width] as number,
    y: ys[Math.floor(cell / width)] as number,
  });
  const start = ys.indexOf(from.y) * width + xs.indexOf(from.x);
  const goal = ys.indexOf(to.y) * width + xs.indexOf(to.x);
  const costs = new Map<number, number>();
  const previous = new Map<number, number>();
  const queue: Step[] = [];
  for (const axis of [0, 1]) {
    costs.set(start * 2 + axis, 0);
    push(queue, { state: start * 2 + axis, cost: 0, score: 0 });
  }
  while (queue.length) {
    const current = pop(queue);
    if (current.cost !== costs.get(current.state)) continue;
    const cell = Math.floor(current.state / 2);
    const a = pointAt(cell);
    if (cell === goal) {
      const path = [a];
      let state = current.state;
      while (previous.has(state)) {
        state = previous.get(state) as number;
        path.push(pointAt(Math.floor(state / 2)));
      }
      return path.reverse();
    }
    const x = cell % width;
    const y = Math.floor(cell / width);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= ys.length) continue;
      const next = cell + dx + dy * width;
      const b = pointAt(next);
      if (boxes.some((box) => crosses(a, b, box))) continue;
      const axis = dx === 0 ? 1 : 0;
      const state = next * 2 + axis;
      const cost =
        current.cost +
        Math.abs(b.x - a.x) +
        Math.abs(b.y - a.y) +
        (axis === current.state % 2 ? 0 : CLEARANCE);
      if (cost >= (costs.get(state) ?? Infinity)) continue;
      costs.set(state, cost);
      previous.set(state, current.state);
      push(queue, { state, cost, score: cost + Math.abs(to.x - b.x) + Math.abs(to.y - b.y) });
    }
  }
  return null;
}

export function avoidObstacles(
  initial: number[],
  from: RouteEnd,
  to: RouteEnd,
  document: BoardDocument,
  endpointIds: (string | undefined)[],
): WorldPoint[] {
  let path: WorldPoint[] = [];
  for (let i = 0; i < initial.length; i += 2)
    path.push({ x: initial[i] as number, y: initial[i + 1] as number });
  const boxes: Bounds[] = [];
  const hidden = hiddenDesignIds(document);
  for (const node of Object.values(document.nodes)) {
    if (
      hidden.has(node.id) ||
      node.type === 'connector' ||
      node.type === 'group' ||
      (node.type === 'shape' && node.design?.kind === 'section')
    )
      continue;
    const box = bounds(node);
    if (!Object.values(box).every(Number.isFinite)) continue;
    const endpoint = endpointIds.includes(node.id);
    const gap = Math.min(distance(from.point, box), distance(to.point, box));
    // No route can escape a covering object without crossing it. Ignore just
    // that object, still avoiding every other blocker on an overlapping board.
    if (!endpoint && gap < EPSILON) continue;
    const padding = endpoint ? 0 : Math.min(CLEARANCE, gap / 2);
    boxes.push({
      left: box.left - padding,
      top: box.top - padding,
      right: box.right + padding,
      bottom: box.bottom + padding,
    });
  }
  if (!boxes.some((box) => hits(path, box))) return path;

  const stub = (end: RouteEnd): WorldPoint => {
    let length = 16;
    for (const box of boxes) {
      const far = {
        x: end.point.x + end.normal.x * length,
        y: end.point.y + end.normal.y * length,
      };
      if (!crosses(end.point, far, box)) continue;
      const edge =
        end.normal.x > 0
          ? box.left
          : end.normal.x < 0
            ? box.right
            : end.normal.y > 0
              ? box.top
              : box.bottom;
      const gap =
        (edge - (end.normal.x ? end.point.x : end.point.y)) * (end.normal.x || end.normal.y);
      if (gap >= 0) length = Math.min(length, gap);
    }
    return { x: end.point.x + end.normal.x * length, y: end.point.y + end.normal.y * length };
  };
  const start = stub(from);
  const end = stub(to);
  const relevant = new Set<Bounds>();
  // Grow only when a candidate hits another object. Distant board contents
  // never add grid coordinates. Each retry adds at least one blocker.
  while (true) {
    const blockers = boxes.filter((box) => hits(path, box) && !relevant.has(box));
    if (!blockers.length) return path;
    for (const box of blockers) relevant.add(box);
    // Endpoint boxes also keep the middle of the path from doubling back
    // through its own source or target.
    for (const box of boxes) {
      if (distance(from.point, box) < EPSILON || distance(to.point, box) < EPSILON)
        relevant.add(box);
    }
    const detour = search(start, end, [...relevant]);
    if (!detour) return path;
    path = [from.point, ...detour, to.point];
  }
}
