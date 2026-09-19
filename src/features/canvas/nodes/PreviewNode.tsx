/**
 * Призрак создаваемого узла: показывает рамку, пока идёт протяжка.
 * Без него непонятно, что вообще получится, — размер видно только
 * после отпускания кнопки.
 */

import { Group, Line, Rect } from 'react-konva';

import { arrowHeadPoints, DEFAULT_DRAW_DASH } from '@/features/canvas/tools/drawTool';
import type { Node } from '@/shared/types/document';

export function PreviewNode({ node }: { node: Node | null }) {
  if (!node || node.type === 'connector') return null;

  if (node.type === 'draw') {
    const arrow = arrowHeadPoints(node.points, node.strokeWidth);

    return (
      <Group x={node.x} y={node.y} opacity={node.opacity} listening={false}>
        <Line
          points={node.points}
          stroke={node.stroke}
          strokeWidth={node.strokeWidth}
          lineCap="round"
          lineJoin="round"
          dash={DEFAULT_DRAW_DASH}
        />
        {arrow.length > 0 && (
          <Line
            points={arrow}
            stroke={node.stroke}
            strokeWidth={node.strokeWidth}
            lineCap="round"
            lineJoin="round"
          />
        )}
      </Group>
    );
  }

  return (
    <Rect
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      stroke="#2f6fed"
      strokeWidth={1}
      strokeScaleEnabled={false}
      dash={[4, 4]}
      fill="rgba(47,111,237,0.06)"
      listening={false}
    />
  );
}
