/**
 * Подсветка четырёх якорей на фигуре под курсором и черновик линии
 * во время протяжки (FR-07, этап 2).
 *
 * Рисуется на слое выделения: это временная разметка, из-за неё не должна
 * перерисовываться вся доска.
 */

import { Circle, Line } from 'react-konva';

import type { WorldPoint } from '@/features/canvas/engine/contract';

import { anchorPoint, SIDE_ANCHORS } from './geometry';
import type { AnchorHint, ConnectorDraft } from './useConnectorTool';

const ACCENT = '#2f6fed';

export function AnchorHints({
  hint,
  draft,
}: {
  hint: AnchorHint | null;
  draft: ConnectorDraft | null;
}) {
  return (
    <>
      {draft && <DraftLine draft={draft} />}
      {hint &&
        SIDE_ANCHORS.map((side) => {
          const at: WorldPoint = anchorPoint(hint.node, side);
          const isActive = hint.active === side;
          return (
            <Circle
              key={side}
              x={at.x}
              y={at.y}
              // Радиус в экранных пикселях: на мелком зуме якорь иначе
              // превращается в точку, на крупном — в блюдце.
              radius={isActive ? 7 : 4.5}
              strokeScaleEnabled={false}
              fill={isActive ? ACCENT : '#ffffff'}
              stroke={ACCENT}
              strokeWidth={1.5}
              listening={false}
            />
          );
        })}
    </>
  );
}

function DraftLine({ draft }: { draft: ConnectorDraft }) {
  return (
    <Line
      points={[draft.from.x, draft.from.y, draft.to.x, draft.to.y]}
      stroke={ACCENT}
      strokeWidth={1.5}
      strokeScaleEnabled={false}
      dash={[6, 4]}
      listening={false}
    />
  );
}
