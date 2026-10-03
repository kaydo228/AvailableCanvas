/**
 * Рендерер узла-фигуры: прямоугольник, скруглённый прямоугольник, эллипс,
 * треугольник, ромб, шестиугольник, семиугольник (FR-03 раздела 4 ТЗ).
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
import { memo } from 'react';
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
 * Вершины правильного n-угольника, вписанного в рамку `width × height`.
 *
 * Считается на единичной окружности, потом bounding box многоугольника
 * растягивается на всю рамку. Именно растягивается, а не вписывается
 * в эллипс: у семиугольника нет вершины ровно на «три часа», и при
 * простом вписывании фигура не доставала бы до правого края рамки —
 * между ней и рамкой выделения оставалась бы щель, разная для разных n.
 *
 * `startAngle` задаёт ориентацию: 0 — вершина справа (у шестиугольника это
 * даёт плоский верх), −π/2 — вершина сверху.
 *
 * Округление до микрона убирает мусор плавающей точки: `cos(π/3)` даёт
 * 0.5000000000000001, и без него симметричные вершины переставали быть
 * симметричными в шестом знаке.
 */
function regularPolygon(
  sides: number,
  width: number,
  height: number,
  startAngle: number,
): number[] {
  const unit: Array<[number, number]> = [];
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (2 * Math.PI * i) / sides;
    unit.push([Math.cos(angle), Math.sin(angle)]);
  }

  const xs = unit.map(([x]) => x);
  const ys = unit.map(([, y]) => y);
  const minX = Math.min(...xs);
  const spanX = Math.max(...xs) - minX;
  const minY = Math.min(...ys);
  const spanY = Math.max(...ys) - minY;

  const round = (value: number) => Math.round(value * 1e6) / 1e6;

  return unit.flatMap(([x, y]) => [
    round(((x - minX) / spanX) * width),
    round(((y - minY) / spanY) * height),
  ]);
}

/**
 * Точки многоугольных форм в локальных координатах рамки.
 * Konva.Line с `closed` замыкает контур сама — отдельная последняя точка
 * не нужна и даёт лишний узел на стыке при толстой обводке.
 *
 * Экспортируется ради тестов: геометрию многоугольника проверяют числами,
 * а поднимать ради этого Konva в jsdom незачем.
 *
 * Треугольник и ромб заданы явно: правильными они не бывают — их вершины
 * привязаны к серединам и углам рамки, а не к окружности.
 */
export function polygonPoints(
  shape: 'triangle' | 'diamond' | 'hexagon' | 'heptagon',
  width: number,
  height: number,
): number[] {
  if (shape === 'triangle') {
    return [width / 2, 0, width, height, 0, height];
  }
  if (shape === 'hexagon') {
    // Плоский верх: вершина справа, и тогда две стороны ложатся
    // горизонтально сверху и снизу.
    return regularPolygon(6, width, height, 0);
  }
  if (shape === 'heptagon') {
    // Острый верх: у нечётного числа сторон плоского верха не бывает,
    // а вершина сверху — та ориентация, в которой семиугольник узнаётся.
    return regularPolygon(7, width, height, -Math.PI / 2);
  }
  return [width / 2, 0, width, height / 2, width / 2, height, 0, height / 2];
}

function ShapeViewInner({
  node,
  selected,
  readOnly,
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

  // Общая часть всех семи форм. Сама форма рисуется в локальных координатах
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
    ) : node.shape === 'triangle' ||
      node.shape === 'diamond' ||
      node.shape === 'hexagon' ||
      node.shape === 'heptagon' ? (
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
      draggable={!readOnly && !node.locked}
      onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
        // Гасим всплытие: обработчик на Stage считает клик по пустому месту
        // и сбросил бы выделение, которое мы только что поставили.
        event.cancelBubble = true;
        onSelect(node.id, event.evt.shiftKey);
      }}
      onDblClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
        event.cancelBubble = true;
        if (readOnly) return;
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
          fontFamily="Golos Text, system-ui, sans-serif"
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

/**
 * Мемоизация: при перетаскивании стор обновляется каждый кадр,
 * и без неё перерисовывались бы все узлы доски, а не только сдвинутый.
 */
export const ShapeView = memo(ShapeViewInner);
