/**
 * Контракт между зонами A и B.
 *
 * B вызывает эти действия из панелей и диалогов.
 * A реализует их внутри features/canvas.
 *
 * Тела — заглушки. Меняется только парой, коммитом с префиксом `contract:`.
 */

import { temporal } from 'zundo';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Rect, Size } from '@/features/canvas/engine/contract';
import {
  fitToBox,
  panBy as panViewportBy,
  zoomAt as zoomViewportAt,
} from '@/features/canvas/engine/viewport';
import { boardHistory } from '@/features/history/model/temporal';
import type {
  Anchor,
  BoardDocument,
  BoxNode,
  ConnectorNode,
  Endpoint,
  Id,
  Node,
  Viewport,
} from '@/shared/types/document';

/** Инструменты из раздела 6.2 ТЗ. */
export type Tool =
  | 'select'
  | 'hand'
  | 'sticky'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'diamond'
  | 'connector'
  | 'pen'
  | 'image';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Частичное изменение узла. id и type менять нельзя. */
export type NodePatch = Partial<DistributiveOmit<Node, 'id' | 'type'>>;

/** Прямоугольник в мировых координатах. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardState {
  // ─── Состояние ──────────────────────────────────────────────────────────
  document: BoardDocument | null;
  selection: Id[];
  activeTool: Tool;
  /** Узел, текст которого сейчас редактируется оверлеем. */
  editingNodeId: Id | null;
  /**
   * Размер канваса в экранных пикселях. Пишет CanvasStage через ResizeObserver.
   * Нужен zoomToFit и zoomToSelection — без него «вписать» не посчитать.
   */
  canvasSize: Size;
  setCanvasSize(size: Size): void;

  // ─── Документ ───────────────────────────────────────────────────────────
  loadDocument(document: BoardDocument): void;
  closeDocument(): void;
  setBackground(patch: Partial<BoardDocument['background']>): void;

  // ─── Узлы ───────────────────────────────────────────────────────────────
  addNode(node: Node): void;
  removeNodes(ids: Id[]): void;
  /** Инспектор B вызывает это на каждое изменение поля. */
  updateNode(id: Id, patch: NodePatch): void;
  /** Множественное выделение: один патч на все выбранные узлы. */
  updateNodes(ids: Id[], patch: NodePatch): void;
  moveNodes(ids: Id[], dx: number, dy: number): void;
  resizeNode(id: Id, box: Box): void;
  rotateNode(id: Id, degrees: number): void;
  duplicateNodes(ids: Id[]): Id[];

  // ─── Порядок слоёв ──────────────────────────────────────────────────────
  bringForward(ids: Id[]): void;
  sendBackward(ids: Id[]): void;
  bringToFront(ids: Id[]): void;
  sendToBack(ids: Id[]): void;

  // ─── Группы ─────────────────────────────────────────────────────────────
  group(ids: Id[]): Id | null;
  ungroup(groupId: Id): void;

  // ─── Коннекторы ─────────────────────────────────────────────────────────
  connect(from: Endpoint, to: Endpoint): Id;
  setConnectorRouting(id: Id, routing: ConnectorNode['routing']): void;
  /** Перевесить конец линии на другую фигуру или отвязать в точку. */
  reattachEndpoint(connectorId: Id, which: 'from' | 'to', endpoint: Endpoint): void;
  setEndpointAnchor(connectorId: Id, which: 'from' | 'to', anchor: Anchor): void;

  // ─── Выделение ──────────────────────────────────────────────────────────
  select(ids: Id[]): void;
  addToSelection(ids: Id[]): void;
  clearSelection(): void;
  selectAll(): void;
  /** Рамкой выделения. Реализует A, зовёт тоже A. */
  selectInBox(box: Box): void;

  // ─── Инструменты и ввод текста ──────────────────────────────────────────
  setTool(tool: Tool): void;
  startEditing(id: Id): void;
  stopEditing(): void;

  // ─── Вид ────────────────────────────────────────────────────────────────
  setViewport(viewport: Viewport): void;
  panBy(dx: number, dy: number): void;
  /** Зум к точке экрана, а не к центру. */
  zoomAt(screenPoint: { x: number; y: number }, delta: number): void;
  zoomToFit(): void;
  zoomToSelection(): void;
  resetZoom(): void;
}

/**
 * Объединяющая рамка узлов в мировых координатах.
 * Коннекторы пропускаются — у них нет рамки (см. ConnectorNode в types).
 */
function boundsOf(document: BoardDocument, ids: Id[]): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of ids) {
    const node = document.nodes[id];
    if (!node || node.type === 'connector') continue;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const notImplemented = (what: string): never => {
  throw new Error(`не реализовано: ${what}`);
};

/**
 * Отмена и возврат (FR-10) — middleware zundo поверх immer. Что попадает
 * в историю и как склеиваются шаги, описано в `features/history/model/temporal`:
 * это правила оболочки, контракта зон они не касаются.
 */
export const useBoardStore = create<BoardState>()(
  temporal(
    immer((set) => ({
      document: null,
      selection: [],
      activeTool: 'select' as Tool,
      editingNodeId: null,
      canvasSize: { width: 0, height: 0 },

      setCanvasSize: (size) =>
        set((state) => {
          state.canvasSize = size;
        }),

      loadDocument: (document) =>
        set((state) => {
          state.document = document;
          state.selection = [];
          state.editingNodeId = null;
        }),

      closeDocument: () =>
        set((state) => {
          state.document = null;
          state.selection = [];
          state.editingNodeId = null;
        }),

      setBackground: (patch) =>
        set((state) => {
          if (state.document) Object.assign(state.document.background, patch);
        }),

      // ─── Узлы: реализовано, зона A ────────────────────────────────────────
      addNode: (node) =>
        set((state) => {
          if (!state.document) return;
          // Инвариант 1: узел обязан попасть И в nodes, И в order.
          // Только в nodes — он сохранится и не отрисуется, отлаживать тяжело.
          state.document.nodes[node.id] = node;
          state.document.order.push(node.id);
        }),

      removeNodes: (ids) =>
        set((state) => {
          if (!state.document) return;
          const doomed = new Set(ids);
          for (const id of doomed) delete state.document.nodes[id];
          state.document.order = state.document.order.filter((id) => !doomed.has(id));
          state.selection = state.selection.filter((id) => !doomed.has(id));
          if (state.editingNodeId && doomed.has(state.editingNodeId)) {
            state.editingNodeId = null;
          }
        }),

      updateNode: (id, patch) =>
        set((state) => {
          const node = state.document?.nodes[id];
          if (node) Object.assign(node, patch);
        }),

      updateNodes: (ids, patch) =>
        set((state) => {
          if (!state.document) return;
          for (const id of ids) {
            const node = state.document.nodes[id];
            if (node) Object.assign(node, patch);
          }
        }),

      moveNodes: (ids, dx, dy) =>
        set((state) => {
          if (!state.document) return;
          for (const id of ids) {
            const node = state.document.nodes[id];
            if (node && node.type !== 'connector') {
              node.x += dx;
              node.y += dy;
            }
          }
        }),
      resizeNode: () => notImplemented('resizeNode'),
      rotateNode: () => notImplemented('rotateNode'),
      duplicateNodes: () => notImplemented('duplicateNodes'),

      bringForward: () => notImplemented('bringForward'),
      sendBackward: () => notImplemented('sendBackward'),
      bringToFront: () => notImplemented('bringToFront'),
      sendToBack: () => notImplemented('sendToBack'),

      group: () => notImplemented('group'),
      ungroup: () => notImplemented('ungroup'),

      connect: () => notImplemented('connect'),
      setConnectorRouting: () => notImplemented('setConnectorRouting'),
      reattachEndpoint: () => notImplemented('reattachEndpoint'),
      setEndpointAnchor: () => notImplemented('setEndpointAnchor'),

      select: (ids) =>
        set((state) => {
          state.selection = [...ids];
        }),

      addToSelection: (ids) =>
        set((state) => {
          state.selection = [...new Set([...state.selection, ...ids])];
        }),

      clearSelection: () =>
        set((state) => {
          state.selection = [];
        }),

      selectAll: () =>
        set((state) => {
          state.selection = state.document ? [...state.document.order] : [];
        }),
      selectInBox: () => notImplemented('selectInBox'),

      setTool: (tool) =>
        set((state) => {
          state.activeTool = tool;
          // Смена инструмента гасит ввод текста: иначе оверлей остаётся висеть.
          state.editingNodeId = null;
        }),

      startEditing: (id) =>
        set((state) => {
          state.editingNodeId = id;
        }),

      stopEditing: () =>
        set((state) => {
          state.editingNodeId = null;
        }),

      // ─── Вид: реализовано, зона A ─────────────────────────────────────────
      setViewport: (viewport) =>
        set((state) => {
          if (state.document) state.document.viewport = viewport;
        }),

      panBy: (dx, dy) =>
        set((state) => {
          if (state.document) {
            state.document.viewport = panViewportBy(state.document.viewport, dx, dy);
          }
        }),

      zoomAt: (screenPoint, factor) =>
        set((state) => {
          if (state.document) {
            state.document.viewport = zoomViewportAt(state.document.viewport, screenPoint, factor);
          }
        }),

      zoomToFit: () =>
        set((state) => {
          if (!state.document) return;
          const box = boundsOf(state.document, state.document.order);
          state.document.viewport = box ? fitToBox(box, state.canvasSize) : { x: 0, y: 0, zoom: 1 };
        }),

      zoomToSelection: () =>
        set((state) => {
          if (!state.document) return;
          const box = boundsOf(state.document, state.selection);
          if (box) state.document.viewport = fitToBox(box, state.canvasSize);
        }),

      resetZoom: () =>
        set((state) => {
          if (state.document) state.document.viewport.zoom = 1;
        }),
    })),
    boardHistory,
  ),
);

/** Селекторы, которыми пользуется B, чтобы не лазить в document руками. */
export const selectSelectedNodes = (state: BoardState): Node[] => {
  const doc = state.document;
  if (!doc) return [];
  return state.selection.map((id) => doc.nodes[id]).filter((n): n is Node => n !== undefined);
};

export const selectSelectedBoxNodes = (state: BoardState): BoxNode[] =>
  selectSelectedNodes(state).filter((n): n is BoxNode => n.type !== 'connector');
