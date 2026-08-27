/**
 * Модель документа доски.
 *
 * Перенос раздела 5 docs/SPEC.md один в один. Ничего не «улучшено»:
 * если тип кажется странным — смотри спецификацию, а не правь здесь.
 * Изменения только парой, коммитом с префиксом `contract:`.
 */

export type Id = string;

export interface Project {
  id: Id;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string; // dataURL, обновляется при выходе из проекта
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface BoardDocument {
  projectId: Id;
  schemaVersion: 1; // для миграций при смене формата
  nodes: Record<Id, Node>;
  order: Id[]; // порядок отрисовки снизу вверх
  viewport: Viewport;
  background: { color: string; grid: 'dots' | 'lines' | 'none' };
}

/**
 * Внутри этого модуля `Node` перекрывает одноимённый глобальный тип DOM.
 * Так в спецификации, менять не стал. В файлах, где нужен DOM-узел,
 * импортируй его как `globalThis.Node`.
 */
export type Node =
  | ShapeNode
  | TextNode
  | StickyNode
  | ImageNode
  | ConnectorNode
  | DrawNode
  | GroupNode;

export interface BaseNode {
  id: Id;
  x: number;
  y: number; // мировые координаты левого верхнего угла
  width: number;
  height: number;
  rotation: number; // градусы
  opacity: number; // 0..1
  locked: boolean;
  groupId?: Id;
}

export interface TextStyle {
  value: string;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  lineHeight?: number;
}

export interface ShapeNode extends BaseNode {
  type: 'shape';
  shape: 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'diamond' | 'hexagon';
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: number[];
  cornerRadius?: number;
  label?: TextStyle; // подпись внутри фигуры
}

export interface TextNode extends BaseNode {
  type: 'text';
  text: TextStyle;
  autoWidth: boolean;
}

export interface StickyNode extends BaseNode {
  type: 'sticky';
  fill: string;
  text: TextStyle;
}

export interface ImageNode extends BaseNode {
  type: 'image';
  blobId: Id; // ключ в IndexedDB, не сам файл
  naturalWidth: number;
  naturalHeight: number;
}

export interface DrawNode extends BaseNode {
  type: 'draw';
  points: number[]; // [x1,y1,x2,y2,...] в локальных координатах
  stroke: string;
  strokeWidth: number;
}

export interface GroupNode extends BaseNode {
  type: 'group';
  children: Id[];
}

export type Anchor = 'top' | 'right' | 'bottom' | 'left' | 'auto';

export interface Endpoint {
  nodeId?: Id; // задан — конец привязан к фигуре
  anchor?: Anchor; // 'auto' — сторона выбирается по взаимному положению
  point?: { x: number; y: number }; // задан — конец свободный
}

/**
 * Внимание: ConnectorNode НЕ наследует BaseNode — у линии нет рамки.
 * Поэтому `node.x` по типу `Node` не проходит без сужения по `type`.
 * Так в спецификации; это осознанное следствие, а не пропуск.
 */
export interface ConnectorNode {
  id: Id;
  type: 'connector';
  from: Endpoint;
  to: Endpoint;
  routing: 'straight' | 'elbow' | 'curve';
  stroke: string;
  strokeWidth: number;
  dash?: number[];
  startCap: 'none' | 'arrow' | 'dot';
  endCap: 'none' | 'arrow' | 'dot';
  label?: TextStyle;
  locked: boolean;
  opacity: number;
}

/** Границы зума из инварианта 5. */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;

/** Узел с рамкой — всё, кроме коннектора. Нужен для трансформаций. */
export type BoxNode = Exclude<Node, ConnectorNode>;

export const isConnector = (node: Node): node is ConnectorNode => node.type === 'connector';

export const isBoxNode = (node: Node): node is BoxNode => node.type !== 'connector';
