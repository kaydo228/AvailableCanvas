/**
 * Контроллер инструментов: превращает жест мышью по холсту в новый узел.
 *
 * Живёт между Stage и стором. Сами инструменты (shapeTool, textTool,
 * stickyTool) — чистые функции и про стор не знают.
 */

import { useCallback, useRef, useState } from 'react';
import type Konva from 'konva';

import type { WorldPoint } from '@/features/canvas/engine/contract';
import { toWorld } from '@/features/canvas/engine/viewport';
import { useBoardStore } from '@/shared/store/board';
import type { Node } from '@/shared/types/document';

import { shapeFromDrag } from './shapeTool';
import { stickyFromDrag } from './stickyTool';
import { textFromDrag } from './textTool';

/** Инструменты, которые создают узлы. Остальные жест не перехватывают. */
const CREATING = new Set(['rect', 'ellipse', 'diamond', 'text', 'sticky']);

export function useToolController() {
  const activeTool = useBoardStore((s) => s.activeTool);
  const viewport = useBoardStore((s) => s.document?.viewport);
  const addNode = useBoardStore((s) => s.addNode);
  const select = useBoardStore((s) => s.select);
  const setTool = useBoardStore((s) => s.setTool);
  const startEditing = useBoardStore((s) => s.startEditing);
  const clearSelection = useBoardStore((s) => s.clearSelection);

  const start = useRef<WorldPoint | null>(null);
  const [preview, setPreview] = useState<Node | null>(null);

  const creating = CREATING.has(activeTool);

  const pointerWorld = useCallback(
    (stage: Konva.Stage | null): WorldPoint | null => {
      const pointer = stage?.getPointerPosition();
      if (!pointer || !viewport) return null;
      return toWorld(pointer, viewport);
    },
    [viewport],
  );

  const build = useCallback(
    (from: WorldPoint, to: WorldPoint, shiftKey: boolean): Node | null => {
      const zoom = viewport?.zoom ?? 1;
      switch (activeTool) {
        case 'rect':
          return shapeFromDrag(from, to, 'rect', shiftKey, zoom);
        case 'ellipse':
          return shapeFromDrag(from, to, 'ellipse', shiftKey, zoom);
        case 'diamond':
          return shapeFromDrag(from, to, 'diamond', shiftKey, zoom);
        case 'text':
          return textFromDrag(from, to, zoom);
        case 'sticky':
          return stickyFromDrag(from, to, shiftKey, zoom);
        default:
          return null;
      }
    },
    [activeTool, viewport?.zoom],
  );

  const onMouseDown = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      // Клик по пустому месту снимает выделение — но только инструментом
      // «Выбор», иначе создание узла заодно гасило бы выделение зря.
      if (!creating) {
        if (event.target === event.target.getStage()) clearSelection();
        return;
      }
      const point = pointerWorld(event.target.getStage());
      if (point) start.current = point;
    },
    [clearSelection, creating, pointerWorld],
  );

  const onMouseMove = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (!creating || !start.current) return;
      const point = pointerWorld(event.target.getStage());
      if (point) setPreview(build(start.current, point, event.evt.shiftKey));
    },
    [build, creating, pointerWorld],
  );

  const onMouseUp = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      const from = start.current;
      start.current = null;
      setPreview(null);
      if (!creating || !from) return;

      const to = pointerWorld(event.target.getStage()) ?? from;
      const node = build(from, to, event.evt.shiftKey);
      if (!node) return;

      addNode(node);
      select([node.id]);

      // Инструмент возвращается к «Выбору»: иначе человек ставит стикер,
      // тянет его подвинуть — и создаёт второй.
      setTool('select');

      // Текст и стикер создаются пустыми, их сразу открываем на ввод —
      // класть пустой стикер и потом целиться в него двойным кликом глупо.
      if (node.type === 'text' || node.type === 'sticky') {
        startEditing(node.id);
      }
    },
    [addNode, build, creating, pointerWorld, select, setTool, startEditing],
  );

  return { onMouseDown, onMouseMove, onMouseUp, preview, creating };
}
