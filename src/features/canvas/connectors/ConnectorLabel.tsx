/**
 * Подпись на линии. Садится на середину МАРШРУТА, а не отрезка между
 * концами: у ломаной середина отрезка легко оказывается вне линии.
 */

import { Group, Rect, Text } from 'react-konva';

import type { ConnectorNode } from '@/shared/types/document';

import { routeMidpoint } from './labelPosition';

const PADDING_X = 6;
const PADDING_Y = 2;
/** Цвет подложки — фон доски по умолчанию: линия не должна перечёркивать буквы. */
const BACKDROP = '#fbfbfd';

export function ConnectorLabel({
  node,
  points,
  bezier,
}: {
  node: ConnectorNode;
  points: number[];
  bezier: boolean;
}) {
  const label = node.label;
  // Пустая подпись не рисуется вовсе и не оставляет подложку.
  if (!label || label.value.trim() === '') return null;

  const at = routeMidpoint(points, bezier);
  const fontSize = label.fontSize;
  // Ширину меряем грубо: точное измерение здесь стоит дороже, чем даёт.
  const width = label.value.length * fontSize * 0.6 + PADDING_X * 2;
  const height = fontSize * 1.3 + PADDING_Y * 2;

  return (
    <Group x={at.x - width / 2} y={at.y - height / 2} listening={false}>
      <Rect width={width} height={height} fill={BACKDROP} cornerRadius={3} />
      <Text
        x={PADDING_X}
        y={PADDING_Y}
        width={width - PADDING_X * 2}
        height={height - PADDING_Y * 2}
        text={label.value}
        fontSize={fontSize}
        fontFamily="Inter, system-ui, sans-serif"
        fill={label.color}
        align="center"
        verticalAlign="middle"
        fontStyle={label.bold ? 'bold' : 'normal'}
      />
    </Group>
  );
}
