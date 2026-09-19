/** Рендерер свободно нарисованной стрелки. */

import type Konva from 'konva';
import { memo } from 'react';
import { Group, Line, Rect } from 'react-konva';
import type { NodeViewProps } from '@/features/canvas/nodes/contract';
import { arrowHeadPoints } from '@/features/canvas/tools/drawTool';
import type { DrawNode } from '@/shared/types/document';

const SELECTION_STROKE = '#2f6fed';

function DrawViewInner({ node, selected, readOnly, onSelect, onDragEnd }: NodeViewProps<DrawNode>) {
  const arrow = arrowHeadPoints(node.points, node.strokeWidth);

  return (
    <Group
      id={node.id}
      name="node"
      x={node.x}
      y={node.y}
      rotation={node.rotation}
      opacity={node.opacity}
      draggable={!readOnly && !node.locked}
      onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
        event.cancelBubble = true;
        onSelect(node.id, event.evt.shiftKey);
      }}
      onDragEnd={(event: Konva.KonvaEventObject<DragEvent>) => {
        onDragEnd(node.id, event.target.x(), event.target.y());
      }}
    >
      <Line
        points={node.points}
        stroke={node.stroke}
        strokeWidth={node.strokeWidth}
        lineCap="round"
        lineJoin="round"
      />
      {arrow.length > 0 && (
        <Line
          points={arrow}
          stroke={node.stroke}
          strokeWidth={node.strokeWidth}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      )}
      {selected && (
        <Rect
          x={0}
          y={0}
          width={node.width}
          height={node.height}
          stroke={SELECTION_STROKE}
          strokeWidth={1}
          dash={[4, 4]}
          listening={false}
        />
      )}
    </Group>
  );
}

export const DrawView = memo(DrawViewInner);
