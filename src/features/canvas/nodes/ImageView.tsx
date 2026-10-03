/**
 * Рендерер картинки (FR-06).
 *
 * В документе лежит только blobId — сам файл в IndexedDB. Элемент <img>
 * достаётся из кэша blobStore: Konva.Image нужен именно элемент, а не URL.
 */

import type Konva from 'konva';
import { memo, useEffect, useState } from 'react';
import { Group, Image as KonvaImage, Rect } from 'react-konva';

import type { NodeViewProps } from '@/features/canvas/nodes/contract';
import { getImageElement } from '@/features/persistence';
import type { ImageNode } from '@/shared/types/document';

const SELECTION_STROKE = '#2f6fed';
const SELECTION_STROKE_WIDTH = 1.5;
const PLACEHOLDER_FILL = '#eef0f3';

function ImageViewInner({
  node,
  selected,
  readOnly,
  onSelect,
  onStartEditing,
  onDragEnd,
}: NodeViewProps<ImageNode>) {
  const [element, setElement] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let alive = true;
    void getImageElement(node.blobId).then((image) => {
      if (alive) setElement(image ?? null);
    });
    return () => {
      alive = false;
    };
  }, [node.blobId]);

  const handleClick = (event: Konva.KonvaEventObject<MouseEvent>) => {
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
      onClick={handleClick}
      onDblClick={(event) => {
        event.cancelBubble = true;
        if (readOnly) return;
        onStartEditing(node.id);
      }}
      onDragEnd={(event) => onDragEnd(node.id, event.target.x(), event.target.y())}
    >
      {element ? (
        <KonvaImage
          image={element}
          width={node.width}
          height={node.height}
          perfectDrawEnabled={false}
        />
      ) : (
        // Пока файл достаётся из IndexedDB, место под картинку уже занято:
        // иначе доска дёргается, когда картинка появляется и раздвигает вид.
        <Rect width={node.width} height={node.height} fill={PLACEHOLDER_FILL} cornerRadius={2} />
      )}

      {selected && (
        <Rect
          width={node.width}
          height={node.height}
          stroke={SELECTION_STROKE}
          strokeWidth={SELECTION_STROKE_WIDTH}
          strokeScaleEnabled={false}
          listening={false}
        />
      )}
    </Group>
  );
}

/**
 * Мемоизация: при перетаскивании стор обновляется каждый кадр,
 * и без неё перерисовывались бы все узлы доски, а не только сдвинутый.
 */
export const ImageView = memo(ImageViewInner);
