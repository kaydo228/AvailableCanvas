/**
 * Рендерер соединителя (FR-07).
 *
 * Konva.Arrow умеет только одинаковые наконечники на обоих концах, а нам
 * нужны независимые. Поэтому линия рисуется отдельно от наконечников.
 */

import type Konva from 'konva';
import { memo } from 'react';
import { Circle, Group, Line } from 'react-konva';
import { useShallow } from 'zustand/react/shallow';

import type { WorldPoint } from '@/features/canvas/engine/contract';
import type { NodeViewProps } from '@/features/canvas/nodes/contract';
import { useBoardStore } from '@/shared/store/board';
import type { ConnectorNode } from '@/shared/types/document';

import { ConnectorLabel } from './ConnectorLabel';
import { endTangent, startTangent } from './labelPosition';
import { connectorPoints, isBezier } from './routing';

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
      listening={false}
    />
  );
}

function ConnectorViewInner({
  node,
  selected,
  editing,
  onSelect,
  onStartEditing,
}: NodeViewProps<ConnectorNode>) {
  /*
   * Подписка узкая — на плоский массив чисел, а не на весь документ.
   *
   * Массив, а не объект: `shallow` из zustand сравнивает объекты на один
   * уровень через `Object.is`, и объект с полем-массивом давал бы новую
   * ссылку на каждый вызов — то есть цикл перерендеров. Массивы он
   * сравнивает поэлементно.
   *
   * Хук стоит ДО любых ранних возвратов: правило useHookAtTopLevel активно.
   */
  const points = useBoardStore(
    useShallow((state): number[] | null =>
      state.document ? connectorPoints(node, state.document) : null,
    ),
  );

  // Конец ссылается на исчезнувший узел — рисовать нечего. Инвариант 4
  // обязан такого не допускать, но падать из-за его нарушения нельзя.
  if (!points || points.length < 4) return null;

  const bezier = isBezier(node, points);
  const dashProps = node.dash ? { dash: node.dash } : {};

  const first: WorldPoint = { x: points[0] as number, y: points[1] as number };
  const last: WorldPoint = {
    x: points[points.length - 2] as number,
    y: points[points.length - 1] as number,
  };

  // Наконечники смотрят по касательной МАРШРУТА, а не по хорде между
  // концами: на ломаной и кривой хорда уводит стрелку вбок.
  const beforeLast = endTangent(points);
  const afterFirst = startTangent(points);

  const handleClick = (event: Konva.KonvaEventObject<MouseEvent>) => {
    event.cancelBubble = true;
    onSelect(node.id, event.evt.shiftKey);
  };

  return (
    <Group id={node.id} name="node" opacity={node.opacity} onClick={handleClick}>
      {/* Полоса захвата. bezier обязателен и здесь, иначе по кривой не попасть. */}
      <Line
        points={points}
        bezier={bezier}
        stroke="transparent"
        strokeWidth={HIT_WIDTH}
        onDblClick={(event) => {
          event.cancelBubble = true;
          onStartEditing(node.id);
        }}
      />

      {selected && (
        <Line
          points={points}
          bezier={bezier}
          stroke={SELECTION_STROKE}
          strokeWidth={node.strokeWidth + 4}
          opacity={0.35}
          lineCap="round"
          listening={false}
        />
      )}

      <Line
        points={points}
        bezier={bezier}
        stroke={node.stroke}
        strokeWidth={node.strokeWidth}
        lineCap="round"
        lineJoin="round"
        {...dashProps}
        listening={false}
      />

      {node.endCap === 'arrow' && (
        <ArrowCap at={last} from={beforeLast} color={node.stroke} size={node.strokeWidth} />
      )}
      {node.startCap === 'arrow' && (
        <ArrowCap at={first} from={afterFirst} color={node.stroke} size={node.strokeWidth} />
      )}
      {node.endCap === 'dot' && (
        <Circle
          x={last.x}
          y={last.y}
          radius={node.strokeWidth * 1.8}
          fill={node.stroke}
          listening={false}
        />
      )}
      {node.startCap === 'dot' && (
        <Circle
          x={first.x}
          y={first.y}
          radius={node.strokeWidth * 1.8}
          fill={node.stroke}
          listening={false}
        />
      )}

      {!editing && <ConnectorLabel node={node} points={points} bezier={bezier} />}
    </Group>
  );
}

/**
 * Мемоизация: при перетаскивании стор обновляется каждый кадр, и без неё
 * перерисовывались бы все линии доски, а не только задетые.
 */
export const ConnectorView = memo(ConnectorViewInner);
