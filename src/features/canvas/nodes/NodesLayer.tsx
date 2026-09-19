/**
 * Слой узлов: карта «тип → рендерер» и прикрутка к стору.
 *
 * Здесь единственное место, где узлы встречаются со стором. Сами рендереры
 * про него не знают — так они остаются тестируемыми, а слой не разрастается
 * цепочкой if по типам.
 */

import { type ComponentType, useCallback } from 'react';
import { Group } from 'react-konva';
import { ConnectorView } from '@/features/canvas/connectors/ConnectorView';
import { selectionForClick } from '@/features/canvas/selection/groupSelection';
import { useGroupDrag } from '@/features/canvas/selection/useGroupDrag';
import { useBoardStore } from '@/shared/store/board';
import type { Node } from '@/shared/types/document';
import type { NodeViewProps } from './contract';
import { DrawView } from './DrawView';
import { GroupView } from './GroupView';
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
  draw: DrawView,
  connector: ConnectorView,
  group: GroupView,
} as unknown as Partial<Record<Node['type'], ComponentType<NodeViewProps>>>;

export function NodesLayer({ readOnly = false }: { readOnly?: boolean }) {
  const document = useBoardStore((s) => s.document);
  const selection = useBoardStore((s) => s.selection);
  const editingNodeId = useBoardStore((s) => s.editingNodeId);
  const select = useBoardStore((s) => s.select);
  const addToSelection = useBoardStore((s) => s.addToSelection);
  const startEditing = useBoardStore((s) => s.startEditing);
  const updateNode = useBoardStore((s) => s.updateNode);
  const groupDrag = useGroupDrag();
  const activeTool = useBoardStore((s) => s.activeTool);

  /*
   * Колбэки стабильные: без этого memo на рендерерах бесполезен —
   * новая функция на каждый рендер слоя считается изменившимся пропом,
   * и перерисовываются все узлы разом.
   */
  /*
   * Щелчок по участнику группы выделяет всю группу: попасть в неё саму мышью
   * нельзя, у рамки нет хит-теста. Разворачивание живёт в selection/groupSelection,
   * рендереры про группы не знают и знать не должны.
   */
  const handleSelect = useCallback(
    (nodeId: string, additive: boolean) => {
      const board = useBoardStore.getState();
      const doc = board.document;
      const ids = doc ? selectionForClick(doc, nodeId) : [nodeId];
      return additive ? addToSelection(ids) : select(ids);
    },
    [addToSelection, select],
  );

  const handleDragEnd = useCallback(
    (nodeId: string, x: number, y: number) => {
      if (!readOnly) updateNode(nodeId, { x, y });
    },
    [readOnly, updateNode],
  );

  if (!document) return null;

  const selected = new Set(selection);

  return (
    // Обёртка нужна, чтобы поймать всплывающие события перетаскивания
    // от любого узла: рендереры про выделение не знают.
    <Group
      /*
       * Узлы слушают мышь только под «Выбором». Иначе протяжка инструментом
       * «Линия», начатая на фигуре, тянет саму фигуру: Konva видит нажатие
       * на draggable-узле раньше, чем до события доходит инструмент.
       * Поймано вживую — линия рисовалась, но фигура при этом уезжала.
       */
      listening={activeTool === 'select'}
      {...(readOnly
        ? {}
        : {
            onDragStart: groupDrag.onDragStart,
            onDragMove: groupDrag.onDragMove,
            onDragEnd: groupDrag.onDragEnd,
          })}
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
            readOnly={readOnly}
            editing={editingNodeId === id}
            onSelect={handleSelect}
            onStartEditing={startEditing}
            onDragEnd={handleDragEnd}
          />
        );
      })}
    </Group>
  );
}
