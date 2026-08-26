/**
 * Рамка выделения. Рисуется на слое выделения, а не в общем — иначе каждое
 * движение мыши перерисовывало бы всю доску вместе с узлами.
 */

import { Rect } from 'react-konva';

import type { Rect as WorldRect } from '@/features/canvas/engine/contract';

export function MarqueeRect({ box }: { box: WorldRect | null }) {
  if (!box || box.width <= 0 || box.height <= 0) return null;

  return (
    <Rect
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      fill="rgba(47,111,237,0.08)"
      stroke="#2f6fed"
      strokeWidth={1}
      strokeScaleEnabled={false}
      listening={false}
    />
  );
}
