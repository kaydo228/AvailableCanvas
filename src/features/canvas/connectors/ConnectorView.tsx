/**
 * Рендерер соединителя (FR-07, этапы 1–2).
 *
 * Konva.Arrow умеет только одинаковые наконечники на обоих концах, а нам
 * нужны независимые. Поэтому линия рисуется отдельно от наконечников:
 * `Line` для тела, `Arrow` нулевой длины и `Circle` — для концов.
 */

import type Konva from 'konva';
import { Circle, Group, Line } from 'react-konva';

import type { WorldPoint } from '@/features/canvas/engine/contract';
import type { NodeViewProps } from '@/features/canvas/nodes/contract';
import { useBoardStore } from '@/shared/store/board';
import type { ConnectorNode } from '@/shared/types/document';

import { connectorEnds, straightPoints } from './geometry';

const SELECTION_STROKE = '#2f6fed';
/** Невидимая широкая полоса под линией: попасть мышью в 2 px невозможно. */
const HIT_WIDTH = 12;

function ArrowCap({
  at,
  from,
  color,
  size,
}: {
  at: WorldPoint;
  from: WorldPoint;
  color: string;
  size: number;
}) {
  const angle = Math.atan2(at.y - from.y, at.x - from.x);
  const spread = Math.PI / 7;
  const length = size * 4;

  const wing = (sign: number): number[] => [
    at.x - length * Math.cos(angle + sign * spread),
    at.y - length * Math.sin(angle + sign * spread),
  ];

  return (
    <Line
      points={[...wing(1), at.x, at.y, ...wing(-1)]}
      stroke={color}
      strokeWidth={size}
      lineCap="round"
      lineJoin="round"
      closed={false}
      listening={false}
    />
  );
}

export function ConnectorView({ node, selected, onSelect }: NodeViewProps<ConnectorNode>) {
  const document = useBoardStore((s) => s.document);
  if (!document) return null;

  const ends = connectorEnds(node, document);
  // Конец ссылается на исчезнувший узел — рисовать нечего. Инвариант 4
  // обязан такого не допускать, но падать из-за его нарушения нельзя.
  if (!ends) return null;

  const points = straightPoints(ends.from, ends.to);
  const dashProps = node.dash ? { dash: node.dash } : {};

  const handleClick = (event: Konva.KonvaEventObject<MouseEvent>) => {
    event.cancelBubble = true;
    onSelect(node.id, event.evt.shiftKey);
  };

  return (
    <Group id={node.id} name="node" opacity={node.opacity} onClick={handleClick}>
      {/* Полоса захвата: невидима, но ловит клики рядом с линией. */}
      <Line points={points} stroke="transparent" strokeWidth={HIT_WIDTH} />

      {selected && (
        <Line
          points={points}
          stroke={SELECTION_STROKE}
          strokeWidth={node.strokeWidth + 4}
          opacity={0.35}
          lineCap="round"
          listening={false}
        />
      )}

      <Line
        points={points}
        stroke={node.stroke}
        strokeWidth={node.strokeWidth}
        lineCap="round"
        {...dashProps}
        listening={false}
      />

      {node.endCap === 'arrow' && (
        <ArrowCap at={ends.to} from={ends.from} color={node.stroke} size={node.strokeWidth} />
      )}
      {node.startCap === 'arrow' && (
        <ArrowCap at={ends.from} from={ends.to} color={node.stroke} size={node.strokeWidth} />
      )}
      {node.endCap === 'dot' && (
        <Circle
          x={ends.to.x}
          y={ends.to.y}
          radius={node.strokeWidth * 1.8}
          fill={node.stroke}
          listening={false}
        />
      )}
      {node.startCap === 'dot' && (
        <Circle
          x={ends.from.x}
          y={ends.from.y}
          radius={node.strokeWidth * 1.8}
          fill={node.stroke}
          listening={false}
        />
      )}
    </Group>
  );
}
