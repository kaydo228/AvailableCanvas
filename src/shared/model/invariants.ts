/**
 * Инварианты модели из раздела 5 docs/SPEC.md.
 *
 * Пока заглушки — тесты на них падают, и это ожидаемо.
 * Реализуются в зоне A вместе с движком холста.
 */

import type { BoardDocument, Endpoint } from '@/shared/types/document';

export interface Violation {
  /** Номер инварианта из раздела 5 ТЗ. */
  rule: 1 | 2 | 3 | 4 | 5;
  message: string;
}

const notImplemented = (what: string): never => {
  throw new Error(`не реализовано: ${what}`);
};

/** Инвариант 1: order и nodes соответствуют друг другу взаимно однозначно. */
export function checkOrderMatchesNodes(_doc: BoardDocument): Violation[] {
  return notImplemented('checkOrderMatchesNodes');
}

/** Инвариант 2: ConnectorNode не участвует в groupId. */
export function checkConnectorsNotGrouped(_doc: BoardDocument): Violation[] {
  return notImplemented('checkConnectorsNotGrouped');
}

/** Инвариант 3: у Endpoint задан ровно один из nodeId или point. */
export function checkEndpointExclusive(_endpoint: Endpoint): boolean {
  return notImplemented('checkEndpointExclusive');
}

/** Инвариант 3, по всему документу. */
export function checkEndpointsExclusive(_doc: BoardDocument): Violation[] {
  return notImplemented('checkEndpointsExclusive');
}

/** Инвариант 5: zoom в диапазоне [0.1, 4]. */
export function checkZoomInRange(_doc: BoardDocument): Violation[] {
  return notImplemented('checkZoomInRange');
}

/** Все инварианты разом. Инвариант 4 проверяется через operations.removeNode. */
export function validateDocument(_doc: BoardDocument): Violation[] {
  return notImplemented('validateDocument');
}
