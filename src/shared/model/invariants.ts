/**
 * Инварианты модели из раздела 5 docs/SPEC.md.
 *
 * Это проверка, а не починка: функции только находят нарушения и называют их.
 * Что делать с найденным, решает вызывающий — оболочка чинит документ на входе
 * (`features/persistence/repair.ts`), тесты просто падают.
 *
 * Четыре из пяти инвариантов держатся конструкцией кода, а не проверками:
 * инвариант 1 — `addNode` пишет и в `nodes`, и в `order`; инвариант 3 —
 * конструкторы `pointEndpoint`/`nodeEndpoint`, собрать неправильный конец
 * через них нельзя; инвариант 4 — `operations.removeNode`; инвариант 5 —
 * `clampZoom` в движке. Здесь они проверяются для случая, когда документ
 * пришёл извне и мимо всей этой конструкции: из файла, из IndexedDB,
 * из чужой версии приложения.
 */

import { groupBounds } from '@/shared/model/operations';
import type { BoardDocument, Endpoint, Id, Node } from '@/shared/types/document';
import { ZOOM_MAX, ZOOM_MIN } from '@/shared/types/document';

export interface Violation {
  /** Номер инварианта из раздела 5 ТЗ. */
  rule: 1 | 2 | 3 | 4 | 5;
  message: string;
}

/**
 * Инвариант 1: order и nodes соответствуют друг другу взаимно однозначно.
 *
 * «Взаимно однозначно» значит три вещи, и каждая ломается по-своему: id
 * в `order` без узла рисует пустоту, узел без записи в `order` сохраняется
 * и не отрисовывается, дубль в `order` рисует узел дважды и даёт React
 * два одинаковых ключа.
 */
export function checkOrderMatchesNodes(doc: BoardDocument): Violation[] {
  const violations: Violation[] = [];
  const seen = new Set<Id>();

  for (const id of doc.order) {
    if (seen.has(id)) {
      violations.push({ rule: 1, message: `узел ${id} стоит в order дважды` });
      continue;
    }
    seen.add(id);
    if (!doc.nodes[id]) {
      violations.push({ rule: 1, message: `в order есть ${id}, которого нет в nodes` });
    }
  }

  for (const id of Object.keys(doc.nodes)) {
    if (!seen.has(id)) {
      violations.push({ rule: 1, message: `узел ${id} есть в nodes, но не в order` });
    }
  }

  return violations;
}

/**
 * Инвариант 2: ConnectorNode не участвует в groupId.
 *
 * По типам `groupId` у коннектора нет вовсе — но документ приходит извне,
 * и там он может оказаться. Группа двигает своих детей, а у линии нет
 * рамки, двигать нечего: она поехала бы за группой концами, отвязавшись
 * от фигур, к которым привязана.
 */
export function checkConnectorsNotGrouped(doc: BoardDocument): Violation[] {
  const violations: Violation[] = [];

  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.type !== 'connector') continue;
    if ('groupId' in node && (node as { groupId?: Id }).groupId !== undefined) {
      violations.push({
        rule: 2,
        message: `линии ${id} приписан groupId — у коннектора его не бывает`,
      });
    }
  }

  return violations;
}

/** Инвариант 2 с обеих сторон: groupId и children описывают одну вложенность. */
export function checkGroupRelations(doc: BoardDocument): Violation[] {
  const violations: Violation[] = [];
  const reportedCycles = new Set<string>();

  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.type === 'connector' || node.groupId === undefined) continue;
    const group = doc.nodes[node.groupId];
    if (group?.type !== 'group') {
      violations.push({
        rule: 2,
        message: `узел ${id} ссылается на несуществующую группу ${node.groupId}`,
      });
    } else if (!group.children.includes(id)) {
      violations.push({ rule: 2, message: `узел ${id} отсутствует в children группы ${group.id}` });
    }
  }

  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.type !== 'group') continue;
    const seen = new Set<Id>();
    for (const childId of node.children) {
      const child = doc.nodes[childId];
      if (seen.has(childId)) {
        violations.push({ rule: 2, message: `группа ${id} содержит ${childId} дважды` });
      } else if (!child || child.type === 'connector' || childId === id) {
        violations.push({ rule: 2, message: `группа ${id} содержит недопустимый узел ${childId}` });
      } else if (child.groupId !== id) {
        violations.push({
          rule: 2,
          message: `ребёнок ${childId} не ссылается обратно на группу ${id}`,
        });
      }
      seen.add(childId);
    }
  }

  for (const group of Object.values(doc.nodes)) {
    if (group.type !== 'group') continue;
    const chain: Id[] = [];
    const positions = new Map<Id, number>();
    let current: Id | undefined = group.id;
    while (current !== undefined) {
      const position = positions.get(current);
      if (position !== undefined) {
        const cycle = chain.slice(position).sort().join(', ');
        if (!reportedCycles.has(cycle)) {
          reportedCycles.add(cycle);
          violations.push({ rule: 2, message: `вложенность групп содержит цикл: ${cycle}` });
        }
        break;
      }
      positions.set(current, chain.length);
      chain.push(current);
      const currentNode: Node | undefined = doc.nodes[current];
      current = currentNode?.type === 'group' ? currentNode.groupId : undefined;
    }
  }

  return violations;
}

/** Рамка группы хранится для экспорта, но остаётся производной от состава. */
export function checkGroupFrames(doc: BoardDocument): Violation[] {
  const violations: Violation[] = [];

  for (const group of Object.values(doc.nodes)) {
    if (group.type !== 'group') continue;
    if (group.children.length < 2) {
      violations.push({ rule: 2, message: `группа ${group.id} содержит меньше двух участников` });
      continue;
    }
    const expected = groupBounds(doc, group.id);
    if (!expected) {
      violations.push({ rule: 2, message: `группа ${group.id} не имеет вычисляемой рамки` });
      continue;
    }
    if (
      group.x !== expected.x ||
      group.y !== expected.y ||
      group.width !== expected.width ||
      group.height !== expected.height
    ) {
      violations.push({ rule: 2, message: `рамка группы ${group.id} расходится с её составом` });
    }
  }

  return violations;
}

/**
 * Инвариант 3: у Endpoint задан ровно один из nodeId или point.
 *
 * Оба разом — неизвестно, за чем следовать: за фигурой или за координатой.
 * Ни одного — рисовать линию не от чего.
 */
export function checkEndpointExclusive(endpoint: Endpoint): boolean {
  return (endpoint.nodeId !== undefined) !== (endpoint.point !== undefined);
}

/** Инвариант 3, по всему документу. */
export function checkEndpointsExclusive(doc: BoardDocument): Violation[] {
  const violations: Violation[] = [];

  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.type !== 'connector') continue;
    for (const which of ['from', 'to'] as const) {
      if (!checkEndpointExclusive(node[which])) {
        violations.push({
          rule: 3,
          message: `у линии ${id} конец «${which}» задан не ровно одним способом`,
        });
      }
    }
  }

  return violations;
}

/**
 * Инвариант 5: zoom в диапазоне [ZOOM_MIN, ZOOM_MAX].
 *
 * Границы берутся из модели, а не повторяются числами: их же использует
 * `clampZoom` в движке, и разъехавшись, они дали бы документ, который
 * проверка считает валидным, а движок тут же зажимает.
 *
 * NaN ловится отдельно: он не больше и не меньше ничего, и обычное сравнение
 * с границами пропустило бы его молча.
 */
export function checkZoomInRange(doc: BoardDocument): Violation[] {
  const { zoom } = doc.viewport;

  if (!Number.isFinite(zoom)) {
    return [{ rule: 5, message: `зум не число: ${zoom}` }];
  }
  if (zoom < ZOOM_MIN || zoom > ZOOM_MAX) {
    return [{ rule: 5, message: `зум ${zoom} вне диапазона [${ZOOM_MIN}, ${ZOOM_MAX}]` }];
  }
  return [];
}

/**
 * Все инварианты разом. Инвариант 4 проверяется через operations.removeNode:
 * он про переход между состояниями, а не про состояние, и по одному
 * документу его не увидеть.
 */
export function validateDocument(doc: BoardDocument): Violation[] {
  return [
    ...checkOrderMatchesNodes(doc),
    ...checkConnectorsNotGrouped(doc),
    ...checkGroupRelations(doc),
    ...checkGroupFrames(doc),
    ...checkEndpointsExclusive(doc),
    ...checkZoomInRange(doc),
  ];
}
