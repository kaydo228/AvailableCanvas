/**
 * Прикрутка общего TextOverlay к стору: находит редактируемый узел,
 * отдаёт оверлею его рамку и стиль, по завершении пишет значение обратно.
 *
 * Пустой текстовый блок при потере фокуса удаляется — иначе доска
 * зарастает невидимыми узлами (см. shouldRemoveOnBlur в textTool).
 */

import { routeMidpoint } from '@/features/canvas/connectors/labelPosition';
import { connectorPoints, isBezier } from '@/features/canvas/connectors/routing';
import { STICKY_PADDING } from '@/features/canvas/nodes/StickyView';
import { TextOverlay } from '@/features/canvas/nodes/TextOverlay';
import { shouldRemoveOnBlur } from '@/features/canvas/tools/textTool';
import { useBoardStore } from '@/shared/store/board';

/** Искусственная рамка под ввод подписи коннектора, в мировых единицах. */
const LABEL_WIDTH = 160;
const LABEL_HEIGHT = 28;

export function EditingOverlay({ readOnly = false }: { readOnly?: boolean }) {
  const editingNodeId = useBoardStore((s) => s.editingNodeId);
  const document = useBoardStore((s) => s.document);
  const updateNode = useBoardStore((s) => s.updateNode);
  const removeNodes = useBoardStore((s) => s.removeNodes);
  const stopEditing = useBoardStore((s) => s.stopEditing);

  if (readOnly || !editingNodeId || !document) return null;

  const node = document.nodes[editingNodeId];
  if (!node) return null;

  // У картинки нет текста — оверлею нечего показывать.
  if (node.type === 'image' || node.type === 'draw') return null;

  /*
   * Коннектор идёт отдельной веткой: у него нет рамки, он единственный
   * не наследует BaseNode. Оверлею подсовывается искусственная рамка
   * вокруг середины маршрута — TextOverlay использует box только для
   * позиции и размера поля и «настоящести» не требует.
   */
  if (node.type === 'connector') {
    const points = connectorPoints(node, document);
    if (!points) return null;

    const at = routeMidpoint(points, isBezier(node, points));
    const style = node.label ?? {
      value: '',
      fontSize: 14,
      color: '#111827',
      align: 'center' as const,
    };

    return (
      <TextOverlay
        box={{
          x: at.x - LABEL_WIDTH / 2,
          y: at.y - LABEL_HEIGHT / 2,
          width: LABEL_WIDTH,
          height: LABEL_HEIGHT,
        }}
        viewport={document.viewport}
        style={style}
        verticalAlign="center"
        padding={0}
        onCommit={(value) => {
          // Пустое значение НЕ удаляет ключ: exactOptionalPropertyTypes
          // и решение зоны B «панель никогда не удаляет ключ». Пустая
          // подпись просто не рисуется — см. ConnectorLabel.
          updateNode(node.id, { label: { ...style, value } });
          stopEditing();
        }}
        onCancel={stopEditing}
      />
    );
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
