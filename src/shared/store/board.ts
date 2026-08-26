/**
 * Контракт между зонами A и B.
 *
 * B вызывает эти действия из панелей и диалогов.
 * A реализует их внутри features/canvas.
 *
 * Тела — заглушки. Меняется только парой, коммитом с префиксом `contract:`.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createConnector } from '@/features/canvas/connectors/connectorTool';
import type { Rect, Size } from '@/features/canvas/engine/contract';
import {
  fitToBox,
  panBy as panViewportBy,
  zoomAt as zoomViewportAt,
} from '@/features/canvas/engine/viewport';
import {
  sendBackward as reorderBackward,
  bringForward as reorderForward,
  sendToBack as reorderToBack,
  bringToFront as reorderToFront,
} from '@/features/canvas/selection/layerOrder';
import { nodesInBox } from '@/features/canvas/selection/marquee';
import { removeNodes as removeNodesFromDocument } from '@/shared/model/operations';
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

export const useBoardStore = create<BoardState>()(
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
        // Инвариант 4 живёт в operations.removeNode: он отвязывает концы
        // коннекторов, считая координаты ДО удаления узла.
        state.document = removeNodesFromDocument(state.document, ids);

        const doomed = new Set(ids);
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

    // ─── Порядок слоёв: реализовано, зона A ───────────────────────────────
    bringForward: (ids) =>
      set((state) => {
        if (state.document) {
          state.document.order = reorderForward(state.document.order, ids);
        }
      }),

    sendBackward: (ids) =>
      set((state) => {
        if (state.document) {
          state.document.order = reorderBackward(state.document.order, ids);
        }
      }),

    bringToFront: (ids) =>
      set((state) => {
        if (state.document) {
          state.document.order = reorderToFront(state.document.order, ids);
        }
      }),

    sendToBack: (ids) =>
      set((state) => {
        if (state.document) {
          state.document.order = reorderToBack(state.document.order, ids);
        }
      }),

    group: () => notImplemented('group'),
    ungroup: () => notImplemented('ungroup'),

    // ─── Коннекторы: реализовано, зона A ──────────────────────────────────
    connect: (from, to) => {
      const connector = createConnector(from, to);
      set((state) => {
        if (!state.document) return;
        state.document.nodes[connector.id] = connector;
        state.document.order.push(connector.id);
      });
      return connector.id;
    },

    setConnectorRouting: (id, routing) =>
      set((state) => {
        const node = state.document?.nodes[id];
        if (node?.type === 'connector') node.routing = routing;
      }),

    /**
     * Инвариант 3: конец заменяется ЦЕЛИКОМ, а не правится по полям.
     * Дописать nodeId к концу, у которого уже есть point, — самый простой
     * способ получить оба поля разом.
     */
    reattachEndpoint: (connectorId, which, endpoint) =>
      set((state) => {
        const node = state.document?.nodes[connectorId];
        if (node?.type !== 'connector') return;
        node[which] = endpoint.nodeId
          ? { nodeId: endpoint.nodeId, anchor: endpoint.anchor ?? 'auto' }
          : { point: endpoint.point ?? { x: 0, y: 0 } };
      }),

    setEndpointAnchor: (connectorId, which, anchor) =>
      set((state) => {
        const node = state.document?.nodes[connectorId];
        if (node?.type !== 'connector') return;
        // У свободного конца стороны нет — привязки к фигуре не существует.
        if (node[which].nodeId === undefined) return;
        node[which].anchor = anchor;
      }),

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
    selectInBox: (box) =>
      set((state) => {
        state.selection = state.document ? nodesInBox(state.document, box) : [];
      }),

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
);

/** Селекторы, которыми пользуется B, чтобы не лазить в document руками. */
export const selectSelectedNodes = (state: BoardState): Node[] => {
  const doc = state.document;
  if (!doc) return [];
  return state.selection.map((id) => doc.nodes[id]).filter((n): n is Node => n !== undefined);
};

export const selectSelectedBoxNodes = (state: BoardState): BoxNode[] =>
  selectSelectedNodes(state).filter((n): n is BoxNode => n.type !== 'connector');
