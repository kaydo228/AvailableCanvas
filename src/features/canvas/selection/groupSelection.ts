/**
 * Разворачивание выделения по группам.
 *
 * Группа не имеет собственного хит-теста (см. `nodes/GroupView.tsx`), поэтому
 * попасть в неё мышью нельзя — попадают всегда в участника. Превращение
 * «щёлкнули по фигуре» в «выделена вся группа» живёт здесь, между слоем
 * и стором: сами рендереры про выделение не знают, а стор не должен знать
 * про то, каким жестом до него дошли.
 *
 * Чистые функции без React и Konva — проверяются vitest'ом напрямую.
 */

import { topmostGroup, withGroupDescendants } from '@/shared/model/operations';
import type { BoardDocument, Id } from '@/shared/types/document';

/**
 * Во что превращается щелчок по узлу.
 *
 * Узел вне групп выделяется сам. Узел внутри группы выделяет ВЕРХНЮЮ группу
 * целиком: вложенная группа — это по-прежнему один объект на экране, и
 * выделять её изнутри значило бы разбирать то, что пользователь собрал.
 *
 * Возвращается сама группа плюс всё её содержимое. Группа нужна, чтобы
 * инспектор показал её как объект и чтобы рамка нарисовалась; содержимое —
 * чтобы перетаскивание, порядок слоёв и удаление работали ровно как для
 * обычного множественного выделения, без отдельной ветки на группы.
 */
export function selectionForClick(document: BoardDocument, nodeId: Id): Id[] {
  const top = topmostGroup(document, nodeId);
  if (top === nodeId && document.nodes[nodeId]?.type !== 'group') return [nodeId];
  return withGroupDescendants(document, [top]);
}

/**
 * То же для набора: рамка выделения задела участников групп — берём группы
 * целиком. Порядок сохраняется, дубли убираются.
 */
export function expandSelection(document: BoardDocument, ids: Iterable<Id>): Id[] {
  const tops: Id[] = [];
  const seen = new Set<Id>();

  for (const id of ids) {
    const top = topmostGroup(document, id);
    if (seen.has(top)) continue;
    seen.add(top);
    tops.push(top);
  }

  return withGroupDescendants(document, tops);
}
