/**
 * Создание соединителей. Чистые функции.
 */

import type { WorldPoint } from '@/features/canvas/engine/contract';
import type { ConnectorNode, Endpoint } from '@/shared/types/document';

import { pointEndpoint } from './geometry';

export const DEFAULT_CONNECTOR_STROKE = '#111111';
export const DEFAULT_CONNECTOR_WIDTH = 2;

export type ConnectorOverrides = Partial<Omit<ConnectorNode, 'id' | 'type'>>;

export function createConnector(
  from: Endpoint,
  to: Endpoint,
  overrides: ConnectorOverrides = {},
): ConnectorNode {
  const base: ConnectorNode = {
    id: crypto.randomUUID(),
    type: 'connector',
    from,
    to,
    routing: 'straight',
    stroke: DEFAULT_CONNECTOR_STROKE,
    strokeWidth: DEFAULT_CONNECTOR_WIDTH,
    // Стрелка на конце по умолчанию: соединитель почти всегда направленный,
    // а перещёлкивать её вручную после каждой линии утомительно.
    startCap: 'none',
    endCap: 'arrow',
    locked: false,
    opacity: 1,
  };

  return Object.assign(base, overrides);
}

/** Линия между двумя свободными точками — этап 1. */
export function connectorFromPoints(
  start: WorldPoint,
  end: WorldPoint,
  overrides: ConnectorOverrides = {},
): ConnectorNode {
  return createConnector(pointEndpoint(start), pointEndpoint(end), overrides);
}

/** Меньше этого протяжка — промах, а не линия. */
export const MIN_CONNECTOR_LENGTH = 4;

export function isTooShort(start: WorldPoint, end: WorldPoint, zoom: number): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) * zoom < MIN_CONNECTOR_LENGTH;
}
