/**
 * Рендерер узла-фигуры: прямоугольник, скруглённый прямоугольник, эллипс,
 * треугольник, ромб (FR-03 раздела 4 ТЗ).
 *
 * Компонент ничего не знает про стор: узел приходит пропсом, наружу уходят
 * только колбэки из `NodeViewProps` (см. `nodes/contract.ts`). Стор
 * прикручивается на уровне слоя, а не здесь.
 *
 * Координаты узла — МИРОВЫЕ. Слой содержимого уже масштабирован вьюпортом
 * (`<Layer scaleX={zoom} scaleY={zoom} x={vp.x} y={vp.y}>`), поэтому здесь
 * ничего не пересчитывается в экранные пиксели: любое умножение на зум внутри
 * рендерера даст двойной масштаб.
 */

import type Konva from 'konva';
import { Ellipse, Group, Line, Rect, Text } from 'react-konva';

import type { NodeViewProps } from '@/features/canvas/nodes/contract';
import type { ShapeNode } from '@/shared/types/document';

/** Скругление `roundRect`, когда узел его не задал явно. */
export const DEFAULT_CORNER_RADIUS = 8;

/** Отступ подписи от краёв рамки, в мировых единицах. Тот же, что у TextOverlay. */
export const LABEL_PADDING = 8;

/** Цвет рамки выделения. Визуальный намёк, трансформер придёт позже. */
const SELECTION_STROKE = '#2f6fed';

/** Толщина рамки выделения в ЭКРАННЫХ пикселях — см. strokeScaleEnabled ниже. */
const SELECTION_STROKE_WIDTH = 1.5;

/**
 * Точки треугольника и ромба в локальных координатах рамки.
 * Konva.Line с `closed` замыкает контур сама — отдельная последняя точка
 * не нужна и даёт лишний узел на стыке при толстой обводке.
 */
function polygonPoints(shape: 'triangle' | 'diamond', width: number, height: number): number[] {
  if (shape === 'triangle') {
    return [width / 2, 0, width, height, 0, height];
  }
  return [width / 2, 0, width, height / 2, width / 2, height, 0, height / 2];
}

export function ShapeView({
  node,
  selected,
  editing,
  onSelect,
  onStartEditing,
  onDragEnd,
}: NodeViewProps<ShapeNode>) {
  const { width, height, label } = node;

  // Пунктир необязателен, а в проекте включён exactOptionalPropertyTypes:
  // передать `dash={undefined}` в необязательный проп нельзя, поэтому проп
  // либо есть, либо его нет вовсе.
  const dashProps = node.dash ? { dash: node.dash } : {};

  // Общая часть всех пяти форм. Сама форма рисуется в локальных координатах
  // (0,0)–(width,height): позицию и поворот держит Group.
  const paint = {
    fill: node.fill,
    stroke: node.stroke,
    strokeWidth: node.strokeWidth,
    ...dashProps,
  };

  const body =
    node.shape === 'ellipse' ? (
      // У Konva.Ellipse начало координат в центре, у остальных — в углу.
      <Ellipse x={width / 2} y={height / 2} radiusX={width / 2} radiusY={height / 2} {...paint} />
    ) : node.shape === 'triangle' || node.shape === 'diamond' ? (
      <Line points={polygonPoints(node.shape, width, height)} closed {...paint} />
    ) : (
      <Rect
        width={width}
        height={height}
        {...(node.shape === 'roundRect'
          ? { cornerRadius: node.cornerRadius ?? DEFAULT_CORNER_RADIUS }
          : {})}
        {...paint}
      />
    );

  // Подпись рисуем, только когда она есть и непуста. Во время редактирования
  // поверх узла висит <textarea> оверлея — свой Text в этот момент рисовать
  // нельзя, иначе текст двоится и «дрожит» при вводе.
  const showLabel = !editing && label !== undefined && label.value !== '';

  return (
    <Group
      id={node.id}
      name="node"
      x={node.x}
      y={node.y}
      rotation={node.rotation}
      opacity={node.opacity}
      draggable={!node.locked}
      onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
        // Гасим всплытие: обработчик на Stage считает клик по пустому месту
        // и сбросил бы выделение, которое мы только что поставили.
        event.cancelBubble = true;
        onSelect(node.id, event.evt.shiftKey);
      }}
      onDblClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
        event.cancelBubble = true;
        onStartEditing(node.id);
      }}
      onDragEnd={(event: Konva.KonvaEventObject<DragEvent>) => {
        // target.x()/y() — координаты в системе родителя, то есть слоя,
        // а система слоя и есть мир. Пересчёт через зум тут не нужен.
        onDragEnd(node.id, event.target.x(), event.target.y());
      }}
    >
      {body}

      {showLabel && (
        // listening={false} — подпись не перехватывает клики: тянуть и
        // выделять фигуру нужно и за текст тоже.
        <Text
          listening={false}
          x={LABEL_PADDING}
          y={LABEL_PADDING}
          width={Math.max(0, width - LABEL_PADDING * 2)}
          height={Math.max(0, height - LABEL_PADDING * 2)}
          text={label.value}
          fontSize={label.fontSize}
          fontFamily="Inter, system-ui, sans-serif"
          fontStyle={fontStyleOf(label)}
          lineHeight={label.lineHeight ?? 1.3}
          fill={label.color}
          // По вертикали — всегда центр: этого требует FR-03 («текст
          // центрируется»), и от него зависит читаемость подписи в ромбе.
          verticalAlign="middle"
          // По горизонтали — то, что задано в TextStyle.align (по умолчанию
          // подпись создаётся с 'center'). Жёсткий 'center' здесь означал бы
          // прыжок текста при входе в редактирование: TextOverlay берёт
          // выравнивание из того же поля, и два источника разъехались бы.
          align={label.align}
          // Перенос по ширине рамки — вторая половина требования FR-03.
          wrap="word"
        />
      )}

      {selected && (
        // Рамка по габаритам узла, а не по контуру: у треугольника и ромба
        // обводка по контуру читается хуже, чем привычный прямоугольник.
        // strokeScaleEnabled={false} — толщина рамки в экранных пикселях,
        // иначе на зуме 4× выделение превращается в жирную полосу,
        // а на 10 % исчезает.
        <Rect
          listening={false}
          width={width}
          height={height}
          stroke={SELECTION_STROKE}
          strokeWidth={SELECTION_STROKE_WIDTH}
          strokeScaleEnabled={false}
          fillEnabled={false}
        />
      )}
    </Group>
  );
}

/** Konva принимает начертание одной строкой, а не парой булевых флагов. */
function fontStyleOf(label: NonNullable<ShapeNode['label']>): string {
  if (label.bold && label.italic) return 'italic bold';
  if (label.bold) return 'bold';
  if (label.italic) return 'italic';
  return 'normal';
}
