/**
 * Прикрутка общего TextOverlay к стору: находит редактируемый узел,
 * отдаёт оверлею его рамку и стиль, по завершении пишет значение обратно.
 *
 * Пустой текстовый блок при потере фокуса удаляется — иначе доска
 * зарастает невидимыми узлами (см. shouldRemoveOnBlur в textTool).
 */

import { STICKY_PADDING } from '@/features/canvas/nodes/StickyView';
import { TextOverlay } from '@/features/canvas/nodes/TextOverlay';
import { shouldRemoveOnBlur } from '@/features/canvas/tools/textTool';
import { useBoardStore } from '@/shared/store/board';

export function EditingOverlay() {
  const editingNodeId = useBoardStore((s) => s.editingNodeId);
  const document = useBoardStore((s) => s.document);
  const updateNode = useBoardStore((s) => s.updateNode);
  const removeNodes = useBoardStore((s) => s.removeNodes);
  const stopEditing = useBoardStore((s) => s.stopEditing);

  if (!editingNodeId || !document) return null;

  const node = document.nodes[editingNodeId];
  if (!node) return null;

  // У коннектора нет рамки, а у картинки нет текста — оверлей им не нужен.
  if (node.type === 'connector' || node.type === 'image' || node.type === 'draw') {
    return null;
  }

  const style =
    node.type === 'shape'
      ? (node.label ?? {
          value: '',
          fontSize: 16,
          color: '#111827',
          align: 'center' as const,
        })
      : node.type === 'group'
        ? null
        : node.text;

  if (!style) return null;

  const commit = (value: string) => {
    if (node.type === 'shape') {
      updateNode(node.id, { label: { ...style, value } });
    } else if (node.type === 'text' || node.type === 'sticky') {
      const next = { ...style, value };
      updateNode(node.id, { text: next });
      if (node.type === 'text' && shouldRemoveOnBlur({ ...node, text: next })) {
        removeNodes([node.id]);
      }
    }
    stopEditing();
  };

  return (
    <TextOverlay
      box={{ x: node.x, y: node.y, width: node.width, height: node.height }}
      viewport={document.viewport}
      style={style}
      verticalAlign={node.type === 'text' ? 'top' : 'center'}
      padding={node.type === 'sticky' ? STICKY_PADDING : 8}
      onCommit={commit}
      onCancel={() => {
        // Отмена на только что созданном пустом узле: сам узел не нужен.
        if (node.type === 'text' && shouldRemoveOnBlur(node)) {
          removeNodes([node.id]);
        }
        stopEditing();
      }}
    />
  );
}
