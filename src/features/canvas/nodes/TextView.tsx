/**
 * Рендерер текстового узла.
 *
 * Про стор не знает: узел приходит пропсом, наружу уходят только колбэки
 * `NodeViewProps` (см. ./contract). Координаты мировые — слой содержимого
 * уже масштабирован вьюпортом, второй раз на зум здесь не умножаем.
 *
 * Ввод текста делает общий оверлей `TextOverlay`, а не Konva: редактируемого
 * текста в Konva нет. Пока оверлей висит (`editing === true`), собственный
 * `Text` не рисуется вовсе — иначе строка задваивается: одна на канвасе,
 * вторая в textarea поверх неё.
 *
 * Как встраивать оверлей, чтобы текст не прыгал при входе в правку:
 *
 *   <TextOverlay
 *     box={{ x: node.x, y: node.y, width: node.width, height: node.height }}
 *     style={node.text}
 *     verticalAlign="top"
 *     padding={TEXT_PADDING}
 *     ...
 *   />
 *
 * `verticalAlign="top"` — у текстового узла строка идёт от верхней кромки,
 * по центру выравнивается только подпись фигуры.
 */

import type { Text as KonvaText } from 'konva/lib/shapes/Text';
import { useLayoutEffect, useRef, useState } from 'react';
import { Group, Rect, Text } from 'react-konva';

import type { Size } from '@/features/canvas/engine/contract';
import type { TextNode } from '@/shared/types/document';

import type { NodeViewProps } from './contract';

/**
 * Поле между рамкой узла и текстом, в мировых единицах.
 * Совпадает со значением `padding` по умолчанию в `TextOverlay` — при входе
 * в правку и выходе из неё текст обязан остаться на том же месте.
 */
export const TEXT_PADDING = 8;

/** Тот же стек, что и у textarea в TextOverlay: иначе метрики разъедутся. */
const FONT_FAMILY = 'Inter, system-ui, sans-serif';

/** Запасной межстрочный — как в TextOverlay, поле в TextStyle необязательное. */
const FALLBACK_LINE_HEIGHT = 1.3;

/**
 * Минимальная ширина области попадания в мировых единицах.
 *
 * У пустого текста нулевая ширина, а hit-канвас Konva для `Text` рисуется
 * по самим глифам: в только что созданный блок нечем попасть мышью — его
 * нельзя ни выделить, ни удалить, и выглядит это как «текст не создался».
 */
const MIN_HIT_WIDTH = 24;

const SELECTION_STROKE = '#2563eb';

export function TextView({
  node,
  selected,
  onSelect,
  onStartEditing,
  onDragEnd,
  editing,
}: NodeViewProps<TextNode>) {
  const textRef = useRef<KonvaText | null>(null);

  /**
   * Фактическая рамка текста. При `autoWidth` ширина известна только после
   * измерения Konva, а `node.width` остаётся тем, что положил инструмент.
   * До первого измерения (и всё время, пока висит оверлей) берём рамку узла.
   */
  const [frame, setFrame] = useState<Size>({
    width: node.width,
    height: node.height,
  });

  const style = node.text;
  const lineHeight = style.lineHeight ?? FALLBACK_LINE_HEIGHT;

  // Порядок как в сокращённой записи CSS font: сначала начертание, потом
  // насыщенность. 'bold italic' холст не разбирает, 'italic bold' — разбирает.
  const fontStyle =
    `${style.italic ? 'italic ' : ''}${style.bold ? 'bold' : ''}`.trim() || 'normal';

  // Высота одной строки с полями — нижняя граница области попадания.
  const lineBox = style.fontSize * lineHeight + TEXT_PADDING * 2;

  // Без списка зависимостей намеренно: размер меняется от любого поля стиля,
  // а перечислять их все — значит однажды забыть одно. Лишних рендеров нет,
  // состояние пишется только при фактическом изменении размера.
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text) return;
    const measured = { width: text.width(), height: text.height() };
    setFrame((prev) =>
      prev.width === measured.width && prev.height === measured.height ? prev : measured,
    );
  });

  const hitWidth = Math.max(frame.width, MIN_HIT_WIDTH);
  const hitHeight = Math.max(frame.height, lineBox);

  // Ширина у autoWidth не задаётся вовсе — Konva считает её по содержимому.
  // Присвоение width={undefined} запрещено (exactOptionalPropertyTypes),
  // поэтому пропс не пишется, а подмешивается.
  const sizing = node.autoWidth ? {} : { width: node.width, wrap: 'word' as const };

  return (
    <Group
      id={node.id}
      x={node.x}
      y={node.y}
      rotation={node.rotation}
      opacity={node.opacity}
      draggable={!node.locked && !editing}
      onDragEnd={(event) => onDragEnd(node.id, event.target.x(), event.target.y())}
      onClick={(event) => onSelect(node.id, event.evt.shiftKey)}
      onDblClick={() => onStartEditing(node.id)}
    >
      {/*
        Прозрачный прямоугольник — единственная область попадания узла.
        Сам `Text` из hit-теста выключен: попасть в него можно только по
        глифам, и клик в просвет между словами промахивается мимо узла.
        Прозрачная заливка на hit-канвасе рисуется цветовым ключом, так что
        область работает, оставаясь невидимой.
      */}
      <Rect width={hitWidth} height={hitHeight} fill="transparent" />

      {!editing && (
        <Text
          ref={textRef}
          listening={false}
          perfectDrawEnabled={false}
          text={style.value}
          fontSize={style.fontSize}
          fontFamily={FONT_FAMILY}
          fontStyle={fontStyle}
          lineHeight={lineHeight}
          align={style.align}
          fill={style.color}
          padding={TEXT_PADDING}
          {...sizing}
        />
      )}

      {selected && (
        <Rect
          listening={false}
          width={hitWidth}
          height={hitHeight}
          stroke={SELECTION_STROKE}
          strokeWidth={1}
          // Обводка выделения — элемент интерфейса, а не часть картинки:
          // её толщина не должна расти вместе с зумом слоя.
          strokeScaleEnabled={false}
        />
      )}
    </Group>
  );
}
