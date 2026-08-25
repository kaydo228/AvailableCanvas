/**
 * Рендерер стикера (FR-05 раздела 4 ТЗ).
 *
 * Компонент не знает про стор: узел приходит пропсом, наружу — колбэки
 * из `NodeViewProps`. Координаты МИРОВЫЕ, слой уже масштабирован вьюпортом,
 * внутри в экранные ничего не пересчитывается.
 */

import type Konva from 'konva';
import { useMemo } from 'react';
import { Group, Rect, Text } from 'react-konva';

import type { NodeViewProps } from '@/features/canvas/nodes/contract';
import { fitFontSize, measureWithCanvas } from '@/features/canvas/nodes/fitText';
import type { StickyNode } from '@/shared/types/document';

/** Отступ текста от краёв, в мировых единицах. Тот же, что у TextOverlay. */
export const STICKY_PADDING = 12;

const CORNER_RADIUS = 4;
const SELECTION_STROKE = '#2f6fed';
const SELECTION_STROKE_WIDTH = 1.5;

export function StickyView({
  node,
  selected,
  editing,
  onSelect,
  onStartEditing,
  onDragEnd,
}: NodeViewProps<StickyNode>) {
  const innerWidth = Math.max(0, node.width - STICKY_PADDING * 2);
  const innerHeight = Math.max(0, node.height - STICKY_PADDING * 2);

  // Кегль подбирается под рамку: текст на стикере не должен вылезать
  // за его границы — это первое, что бросается в глаза на чужой доске.
  const fitted = useMemo(
    () =>
      fitFontSize({
        text: node.text.value,
        maxWidth: innerWidth,
        maxHeight: innerHeight,
        fontSize: node.text.fontSize,
        measure: measureWithCanvas,
      }),
    [node.text.value, node.text.fontSize, innerWidth, innerHeight],
  );

  const handleClick = (event: Konva.KonvaEventObject<MouseEvent>) => {
    // Иначе Stage примет этот же клик за клик по пустому месту
    // и сбросит выделение, которое узел только что поставил.
    event.cancelBubble = true;
    onSelect(node.id, event.evt.shiftKey);
  };

  return (
    <Group
      id={node.id}
      name="node"
      x={node.x}
      y={node.y}
      rotation={node.rotation}
      opacity={node.opacity}
      draggable={!node.locked}
      onClick={handleClick}
      onDblClick={(event) => {
        event.cancelBubble = true;
        onStartEditing(node.id);
      }}
      onDragEnd={(event) => onDragEnd(node.id, event.target.x(), event.target.y())}
    >
      <Rect
        width={node.width}
        height={node.height}
        fill={node.fill}
        cornerRadius={CORNER_RADIUS}
        shadowColor="#000000"
        shadowOpacity={0.16}
        shadowBlur={6}
        shadowOffsetY={2}
        perfectDrawEnabled={false}
      />

      {!editing && node.text.value.length > 0 && (
        <Text
          x={STICKY_PADDING}
          y={STICKY_PADDING}
          width={innerWidth}
          height={innerHeight}
          text={node.text.value}
          fontSize={fitted.fontSize}
          fontFamily="Inter, system-ui, sans-serif"
          fill={node.text.color}
          align={node.text.align}
          verticalAlign="middle"
          lineHeight={node.text.lineHeight ?? 1.3}
          fontStyle={node.text.bold ? 'bold' : 'normal'}
          wrap="word"
          // Не влезло даже на минимальном кегле — обрезаем многоточием,
          // а не выпускаем текст за границы стикера.
          ellipsis={fitted.overflow}
          listening={false}
        />
      )}

      {selected && (
        <Rect
          width={node.width}
          height={node.height}
          cornerRadius={CORNER_RADIUS}
          stroke={SELECTION_STROKE}
          strokeWidth={SELECTION_STROKE_WIDTH}
          strokeScaleEnabled={false}
          listening={false}
        />
      )}
    </Group>
  );
}
