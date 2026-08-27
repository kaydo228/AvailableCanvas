/**
 * Контроллер инструментов: превращает жест мышью по холсту в новый узел.
 *
 * Живёт между Stage и стором. Сами инструменты (shapeTool, textTool,
 * stickyTool) — чистые функции и про стор не знают.
 */

import type Konva from 'konva';
import { useCallback, useRef, useState } from 'react';

import type { Rect, WorldPoint } from '@/features/canvas/engine/contract';
import { toWorld } from '@/features/canvas/engine/viewport';
import { normalizeRect } from '@/features/canvas/tools/geometry';
import { useBoardStore } from '@/shared/store/board';
import type { Node } from '@/shared/types/document';

import { shapeFromDrag } from './shapeTool';
import { stickyFromDrag } from './stickyTool';
import { textFromDrag } from './textTool';

/** Инструменты, которые создают узлы. Остальные жест не перехватывают. */
const CREATING = new Set(['rect', 'ellipse', 'diamond', 'hexagon', 'heptagon', 'text', 'sticky']);

export function useToolController() {
  const activeTool = useBoardStore((s) => s.activeTool);
  const viewport = useBoardStore((s) => s.document?.viewport);
  const addNode = useBoardStore((s) => s.addNode);
  const select = useBoardStore((s) => s.select);
  const setTool = useBoardStore((s) => s.setTool);
  const startEditing = useBoardStore((s) => s.startEditing);
  const clearSelection = useBoardStore((s) => s.clearSelection);
  const selectInBox = useBoardStore((s) => s.selectInBox);

  const start = useRef<WorldPoint | null>(null);
  const [preview, setPreview] = useState<Node | null>(null);
  // Рамка выделения инструментом «Выбор». Живёт отдельно от preview:
  // это не будущий узел, а временная геометрия.
  const [marquee, setMarquee] = useState<Rect | null>(null);

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
        case 'hexagon':
          return shapeFromDrag(from, to, 'hexagon', shiftKey, zoom);
        case 'heptagon':
          return shapeFromDrag(from, to, 'heptagon', shiftKey, zoom);
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
        // Протяжка по пустому месту — рамка выделения. По узлу — его перетаскивание,
        // рамку начинать нельзя, иначе объект не сдвинуть.
        if (event.target === event.target.getStage()) {
          clearSelection();
          const point = pointerWorld(event.target.getStage());
          if (point && activeTool === 'select') start.current = point;
        }
        return;
      }
      const point = pointerWorld(event.target.getStage());
      if (point) start.current = point;
    },
    [activeTool, clearSelection, creating, pointerWorld],
  );

  const onMouseMove = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (!start.current) return;
      const point = pointerWorld(event.target.getStage());
      if (!point) return;

      if (creating) {
        setPreview(build(start.current, point, event.evt.shiftKey));
        return;
      }

      if (activeTool === 'select') {
        const box = normalizeRect(start.current, point);
        setMarquee(box);
        // Выделяем прямо по ходу протяжки: так видно, что попадёт в набор,
        // до того как отпустил кнопку.
        selectInBox(box);
      }
    },
    [activeTool, build, creating, pointerWorld, selectInBox],
  );

  const onMouseUp = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      const from = start.current;
      start.current = null;
      setPreview(null);
      setMarquee(null);
      if (!from) return;

      if (!creating) {
        // Рамкой уже выделили по ходу движения, на отпускании делать нечего.
        return;
      }

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

  return { onMouseDown, onMouseMove, onMouseUp, preview, marquee, creating };
}
