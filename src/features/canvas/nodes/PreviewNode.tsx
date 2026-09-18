/**
 * Призрак создаваемого узла: показывает рамку, пока идёт протяжка.
 * Без него непонятно, что вообще получится, — размер видно только
 * после отпускания кнопки.
 */

import { Line, Rect } from 'react-konva';

import type { Node } from '@/shared/types/document';

export function PreviewNode({ node }: { node: Node | null }) {
  if (!node || node.type === 'connector') return null;

  if (node.type === 'draw') {
    return (
      <Line
        x={node.x}
        y={node.y}
        points={node.points}
        stroke={node.stroke}
        strokeWidth={node.strokeWidth}
        lineCap="round"
        lineJoin="round"
        opacity={0.6}
        listening={false}
      />
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
