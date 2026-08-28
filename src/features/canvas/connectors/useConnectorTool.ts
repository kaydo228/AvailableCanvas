/**
 * Инструмент «Линия»: протяжка от точки до точки, с прилипанием к якорям фигур.
 *
 * Живёт отдельно от useToolController: там создаются узлы с рамкой по общему
 * шаблону, а у соединителя нет ни рамки, ни размера — общий путь ему не годится.
 */

import type Konva from 'konva';
import { useCallback, useRef, useState } from 'react';

import type { WorldPoint } from '@/features/canvas/engine/contract';
import { toWorld } from '@/features/canvas/engine/viewport';
import { useBoardStore } from '@/shared/store/board';
import type { BoxNode, Endpoint } from '@/shared/types/document';

import { isTooShort } from './connectorTool';
import {
  endpointAt,
  nearestAnchor,
  nodeAtPoint,
  pointEndpoint,
  referencePoint,
  resolveEndpoint,
  type SideAnchor,
} from './geometry';

export interface ConnectorDraft {
  from: WorldPoint;
  to: WorldPoint;
}

export interface AnchorHint {
  node: BoxNode;
  /** Якорь под курсором, если курсор к нему достаточно близко. */
  active: SideAnchor | null;
}

export function useConnectorTool() {
  const activeTool = useBoardStore((s) => s.activeTool);
  const connect = useBoardStore((s) => s.connect);
  const select = useBoardStore((s) => s.select);
  const setTool = useBoardStore((s) => s.setTool);

  const start = useRef<Endpoint | null>(null);
  const startPoint = useRef<WorldPoint | null>(null);
  const [draft, setDraft] = useState<ConnectorDraft | null>(null);
  const [hint, setHint] = useState<AnchorHint | null>(null);

  const active = activeTool === 'connector';

  const pointerWorld = useCallback((stage: Konva.Stage | null): WorldPoint | null => {
    const pointer = stage?.getPointerPosition();
    const viewport = useBoardStore.getState().document?.viewport;
    if (!pointer || !viewport) return null;
    return toWorld(pointer, viewport);
  }, []);

  /** Подсветка якорей: показываем, как только курсор оказался над фигурой. */
  const updateHint = useCallback((point: WorldPoint) => {
    const state = useBoardStore.getState();
    const document = state.document;
    if (!document) return setHint(null);

    const node = nodeAtPoint(document, point);
    if (!node) return setHint(null);

    const zoom = document.viewport.zoom;
    const { anchor, distance } = nearestAnchor(node, point);
    const snap = 18 / Math.max(zoom, 1e-6);

    setHint({ node, active: distance <= snap ? anchor : null });
  }, []);

  const onMouseDown = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (!active) return;
      const point = pointerWorld(event.target.getStage());
      const document = useBoardStore.getState().document;
      if (!point || !document) return;

      start.current = endpointAt(document, point, document.viewport.zoom);
      startPoint.current = point;
      setDraft({ from: point, to: point });
    },
    [active, pointerWorld],
  );

  const onMouseMove = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (!active) return;
      const point = pointerWorld(event.target.getStage());
      if (!point) return;

      updateHint(point);

      const from = startPoint.current;
      if (from) setDraft({ from, to: point });
    },
    [active, pointerWorld, updateHint],
  );

  const onMouseUp = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      const from = start.current;
      const fromPoint = startPoint.current;
      start.current = null;
      startPoint.current = null;
      setDraft(null);
      setHint(null);

      if (!active || !from || !fromPoint) return;

      const point = pointerWorld(event.target.getStage());
      const document = useBoardStore.getState().document;
      if (!point || !document) return;

      // Промах вместо линии: клик без протяжки не должен оставлять
      // нулевой соединитель, который потом не поймать мышью.
      if (isTooShort(fromPoint, point, document.viewport.zoom)) return;

      const to = endpointAt(document, point, document.viewport.zoom);
      const safe = (endpoint: Endpoint, fallback: WorldPoint): Endpoint =>
        endpoint.nodeId !== undefined && document.nodes[endpoint.nodeId] === undefined
          ? pointEndpoint(fallback)
          : endpoint;
      const safeFrom = safe(from, fromPoint);
      const safeTo = safe(to, point);

      // Линия из фигуры в неё же саму — этап 1 и 2 её не рисуют осмысленно.
      if (safeFrom.nodeId && safeFrom.nodeId === safeTo.nodeId) return;
      if (
        safeFrom.point !== undefined &&
        safeTo.point !== undefined &&
        safeFrom.point.x === safeTo.point.x &&
        safeFrom.point.y === safeTo.point.y
      )
        return;

      const id = connect(safeFrom, safeTo);
      select([id]);
      setTool('select');
    },
    [active, connect, pointerWorld, select, setTool],
  );

  /**
   * Черновик в мировых точках. Привязанный конец показываем не там, где
   * нажали, а на якоре: иначе линия «отскакивает» в момент отпускания.
   */
  const resolvedDraft = useCallback((): ConnectorDraft | null => {
    if (!draft) return null;
    const document = useBoardStore.getState().document;
    const endpoint = start.current;
    if (!document || !endpoint) return draft;

    const toward = draft.to;
    const from = resolveEndpoint(endpoint, document, toward) ?? draft.from;
    return { from, to: draft.to };
  }, [draft]);

  return {
    active,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    draft: resolvedDraft(),
    hint,
  };
}

export { referencePoint };
