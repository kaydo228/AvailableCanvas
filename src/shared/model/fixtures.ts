/** Фикстуры для тестов инвариантов. */

import type {
  BoardDocument,
  ConnectorNode,
  Id,
  Node,
  ShapeNode,
} from '@/shared/types/document';

export function shape(id: Id, x = 0, y = 0): ShapeNode {
  return {
    id,
    type: 'shape',
    shape: 'rect',
    x,
    y,
    width: 100,
    height: 60,
    rotation: 0,
    opacity: 1,
    locked: false,
    fill: '#ffffff',
    stroke: '#111111',
    strokeWidth: 1,
  };
}

export function connector(id: Id, fromId: Id, toId: Id): ConnectorNode {
  return {
    id,
    type: 'connector',
    from: { nodeId: fromId, anchor: 'auto' },
    to: { nodeId: toId, anchor: 'auto' },
    routing: 'straight',
    stroke: '#111111',
    strokeWidth: 2,
    startCap: 'none',
    endCap: 'arrow',
    locked: false,
    opacity: 1,
  };
}

export function doc(nodes: Node[]): BoardDocument {
  return {
    projectId: 'p1',
    schemaVersion: 1,
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    order: nodes.map((n) => n.id),
    viewport: { x: 0, y: 0, zoom: 1 },
    background: { color: '#fafafa', grid: 'dots' },
  };
}
