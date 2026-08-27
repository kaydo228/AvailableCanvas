/**
 * Рендерер группы (раздел 5 ТЗ, `GroupNode`).
 *
 * Группа — контейнер, а не рисуемый объект: у неё нет ни заливки, ни обводки
 * в модели, и рисовать поверх содержимого ей нечего. Здесь только пунктирная
 * рамка вокруг состава, и только когда группа выделена: без неё непонятно,
 * почему клик по одной фигуре подсветил ещё четыре.
 *
 * `listening={false}` принципиально. Иначе прямоугольник во всю рамку
 * перехватывал бы клики по пустоте между участниками, а заодно и по чужим
 * узлам, оказавшимся под ним, — группа с широко расставленным содержимым
 * превращалась бы в невидимую заслонку на полдоски. Клик по участнику
 * разворачивается в выделение всей группы на уровне слоя
 * (`selection/groupSelection.ts`), и рамке для этого хит-тест не нужен.
 *
 * Координаты узла — МИРОВЫЕ: слой содержимого уже масштабирован вьюпортом.
 */

import { memo } from 'react';
import { Rect } from 'react-konva';

import type { NodeViewProps } from '@/features/canvas/nodes/contract';
import type { GroupNode } from '@/shared/types/document';

/** Тот же цвет, что у рамки выделения узлов, — это одна и та же сущность. */
const GROUP_STROKE = '#2f6fed';

/** Толщина в ЭКРАННЫХ пикселях: strokeScaleEnabled={false} отменяет масштаб. */
const GROUP_STROKE_WIDTH = 1;

/** Пунктир отличает рамку группы от рамки одиночного выделения. */
const GROUP_DASH = [4, 4];

/** Зазор между рамкой и содержимым, в мировых единицах. */
const GROUP_PADDING = 4;

function GroupViewInner({ node, selected }: NodeViewProps<GroupNode>) {
  if (!selected) return null;

  return (
    /*
     * Без `id` намеренно. По id узлы ищут в дереве Konva трансформер
     * (`SelectionTransformer`) и перетаскивание набора (`useGroupDrag`).
     * Найдя эту рамку, они бы взялись за неё как за обычный узел — и записали
     * бы в модель координаты со сдвигом на GROUP_PADDING, а размер — с двойным
     * отступом. Рамка группы производная: её пересчитывает `resyncGroups`
     * по содержимому, трогать её напрямую нельзя ничем.
     */
    <Rect
      x={node.x - GROUP_PADDING}
      y={node.y - GROUP_PADDING}
      width={node.width + GROUP_PADDING * 2}
      height={node.height + GROUP_PADDING * 2}
      stroke={GROUP_STROKE}
      strokeWidth={GROUP_STROKE_WIDTH}
      dash={GROUP_DASH}
      strokeScaleEnabled={false}
      opacity={node.opacity}
      listening={false}
    />
  );
}

export const GroupView = memo(GroupViewInner);
