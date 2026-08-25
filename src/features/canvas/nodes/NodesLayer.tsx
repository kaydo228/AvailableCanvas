/**
 * Слой узлов: карта «тип → рендерер» и прикрутка к стору.
 *
 * Здесь единственное место, где узлы встречаются со стором. Сами рендереры
 * про него не знают — так они остаются тестируемыми, а слой не разрастается
 * цепочкой if по типам.
 */

import type { ComponentType } from 'react';
import { Group } from 'react-konva';

import { useGroupDrag } from '@/features/canvas/selection/useGroupDrag';
import { useBoardStore } from '@/shared/store/board';
import type { Node } from '@/shared/types/document';
import type { NodeViewProps } from './contract';
import { ImageView } from './ImageView';
import { ShapeView } from './ShapeView';
import { StickyView } from './StickyView';
import { TextView } from './TextView';

/**
 * Регистрация типов. Приведение через unknown — цена того, что карта
 * гомогенная, а рендереры типизированы каждый своим узлом. Единственное
 * место в проекте, где это приведение допустимо: сразу под ним стоит
 * сужение по node.type, которое и делает его безопасным.
 */
const RENDERERS = {
  shape: ShapeView,
  text: TextView,
  sticky: StickyView,
  image: ImageView,
} as unknown as Partial<Record<Node['type'], ComponentType<NodeViewProps>>>;

export function NodesLayer() {
  const document = useBoardStore((s) => s.document);
  const selection = useBoardStore((s) => s.selection);
  const editingNodeId = useBoardStore((s) => s.editingNodeId);
  const select = useBoardStore((s) => s.select);
  const addToSelection = useBoardStore((s) => s.addToSelection);
  const startEditing = useBoardStore((s) => s.startEditing);
  const updateNode = useBoardStore((s) => s.updateNode);
  const groupDrag = useGroupDrag();

  if (!document) return null;

  const selected = new Set(selection);

  return (
    // Обёртка нужна, чтобы поймать всплывающие события перетаскивания
    // от любого узла: рендереры про выделение не знают.
    <Group
      onDragStart={groupDrag.onDragStart}
      onDragMove={groupDrag.onDragMove}
      onDragEnd={groupDrag.onDragEnd}
    >
      {document.order.map((id) => {
        const node = document.nodes[id];
        if (!node) return null;

        const Renderer = RENDERERS[node.type];
        if (!Renderer) return null;

        return (
          <Renderer
            key={id}
            node={node}
            selected={selected.has(id)}
            editing={editingNodeId === id}
            onSelect={(nodeId, additive) =>
              additive ? addToSelection([nodeId]) : select([nodeId])
            }
            onStartEditing={startEditing}
            onDragEnd={(nodeId, x, y) => updateNode(nodeId, { x, y })}
          />
        );
      })}
    </Group>
  );
}
