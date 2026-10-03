import type Konva from 'konva';
import { memo } from 'react';
import { Group, Rect, Text } from 'react-konva';
import { CARD_TYPES, DESIGN_STATUSES, type DesignCard } from '@/shared/types/design';
import type { ShapeNode } from '@/shared/types/document';
import type { NodeViewProps } from './contract';
import { FONT_STACKS } from './textStyle';

const STATUS_COLORS = {
  idea: '#64748b',
  testing: '#b7791f',
  validated: '#2f6953',
  deferred: '#8b697b',
};

type Props = NodeViewProps<ShapeNode> & {
  title: string;
  card: DesignCard | null;
  onToggleSection: (id: string) => void;
};

/** Compact Konva representation; the full document is edited in the inspector. */
export const DesignNodeView = memo(function DesignNodeView({
  node,
  title,
  card,
  selected,
  readOnly,
  onSelect,
  onStartEditing,
  onDragEnd,
  onToggleSection,
}: Props) {
  const design = node.design;
  if (!design) return null;
  const section = design.kind === 'section' ? design : null;
  const width = section?.collapsed ? Math.min(node.width, 320) : node.width;
  const height = section?.collapsed ? 64 : node.height;
  const accent = card ? STATUS_COLORS[card.status] : '#527166';
  const click = (event: Konva.KonvaEventObject<MouseEvent>) => {
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
      draggable={!readOnly && !node.locked}
      onClick={click}
      onDblClick={(event) => {
        event.cancelBubble = true;
        if (!readOnly) onStartEditing(node.id);
      }}
      onDragEnd={(event) => onDragEnd(node.id, event.target.x(), event.target.y())}
    >
      <Rect
        width={width}
        height={height}
        cornerRadius={section ? 12 : 10}
        fill={section ? '#527166' : '#fbfcfa'}
        fillEnabled={!section || section.collapsed}
        opacity={section && !section.collapsed ? 0.6 : 1}
        stroke={selected ? '#2f6fed' : section ? '#78978a' : '#cbd5cf'}
        strokeWidth={selected ? 2 : 1}
        strokeScaleEnabled={false}
        dash={section && !section.collapsed ? [7, 5] : []}
        listening={!section || section.collapsed}
      />
      {section ? (
        <>
          <Rect width={width} height={44} cornerRadius={[12, 12, 0, 0]} fill="#527166" />
          <Text
            x={16}
            y={14}
            width={Math.max(0, width - 65)}
            height={22}
            text={title}
            fill="#fff"
            fontSize={16}
            fontStyle="bold"
            fontFamily={FONT_STACKS.sans}
            ellipsis
            wrap="none"
            listening={false}
          />
          <Group
            x={width - 38}
            y={8}
            onMouseDown={(event) => {
              event.cancelBubble = true;
            }}
            onClick={(event) => {
              event.cancelBubble = true;
              if (!readOnly) onToggleSection(node.id);
            }}
          >
            <Rect width={28} height={28} fill="#ffffff" opacity={0.14} cornerRadius={6} />
            <Text
              width={28}
              height={28}
              align="center"
              verticalAlign="middle"
              text={section.collapsed ? '+' : '−'}
              fontSize={20}
              fill="#fff"
              listening={false}
            />
          </Group>
          {section.collapsed && (
            <Text
              x={16}
              y={45}
              text={`${section.children.length} объектов`}
              fill="#e2eae5"
              fontSize={11}
              listening={false}
            />
          )}
        </>
      ) : (
        <Group clipX={0} clipY={0} clipWidth={width} clipHeight={height} listening={false}>
          <Rect width={5} height={height} fill={accent} cornerRadius={[10, 0, 0, 10]} />
          <Text
            x={18}
            y={16}
            width={Math.max(0, width - 36)}
            text={`${design.kind === 'reference' ? '↗  ' : ''}${card ? CARD_TYPES[card.cardType].toLocaleUpperCase('ru') : 'ССЫЛКА НЕДОСТУПНА'}`}
            fontFamily={FONT_STACKS.mono}
            fontSize={10}
            letterSpacing={1}
            fill={accent}
          />
          <Text
            x={18}
            y={39}
            width={Math.max(0, width - 36)}
            height={48}
            text={title}
            fontFamily={FONT_STACKS.sans}
            fontSize={19}
            fontStyle="bold"
            fill="#182b22"
            ellipsis
          />
          <Text
            x={18}
            y={94}
            width={Math.max(0, width - 36)}
            height={Math.max(0, height - 133)}
            text={
              card?.summary ||
              (design.kind === 'reference'
                ? 'Оригинальная карточка удалена.'
                : 'Двойной клик — описать идею')
            }
            fontFamily={FONT_STACKS.sans}
            fontSize={12}
            lineHeight={1.4}
            fill="#65736b"
            ellipsis
          />
          <Rect
            x={18}
            y={height - 29}
            width={Math.min(width - 36, 143)}
            height={19}
            cornerRadius={4}
            fill="#edf1ed"
          />
          <Text
            x={25}
            y={height - 25}
            width={Math.max(0, width - 50)}
            text={card ? DESIGN_STATUSES[card.status] : 'Нет оригинала'}
            fontFamily={FONT_STACKS.sans}
            fontSize={10}
            fill={accent}
          />
        </Group>
      )}
    </Group>
  );
});
