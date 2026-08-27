/**
 * Контракт между зонами A и B.
 *
 * B вызывает эти действия из панелей и диалогов.
 * A реализует их внутри features/canvas.
 *
 * Тела — заглушки. Меняется только парой, коммитом с префиксом `contract:`.
 */

import { nanoid } from 'nanoid';
import { temporal } from 'zundo';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createConnector } from '@/features/canvas/connectors/connectorTool';
import { connectorEnds, nodeEndpoint, pointEndpoint } from '@/features/canvas/connectors/geometry';
import type { Rect, Size } from '@/features/canvas/engine/contract';
import { DEFAULT_GRID_STEP } from '@/features/canvas/engine/grid';
import {
  fitToBox,
  panBy as panViewportBy,
  zoomAt as zoomViewportAt,
} from '@/features/canvas/engine/viewport';
import { expandSelection } from '@/features/canvas/selection/groupSelection';
import {
  sendBackward as reorderBackward,
  bringForward as reorderForward,
  sendToBack as reorderToBack,
  bringToFront as reorderToFront,
} from '@/features/canvas/selection/layerOrder';
import { nodesInBox } from '@/features/canvas/selection/marquee';
import { clampSize } from '@/features/canvas/selection/resize';
import { normalizeAngle, rotatePoint } from '@/features/canvas/selection/rotate';
import { boardHistory } from '@/features/history/model/temporal';
import {
  clampOpacity,
  groupBounds,
  removeNodes as removeNodesFromDocument,
  topmostGroup,
  withGroupDescendants,
} from '@/shared/model/operations';
import type {
  Anchor,
  BoardDocument,
  BoxNode,
  ConnectorNode,
  Endpoint,
  GroupNode,
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
  | 'hexagon'
  | 'heptagon'
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

/**
 * Пересчитывает рамки групп, которых коснулось перемещение узлов.
 *
 * Рамка группы — производная от содержимого, но хранится в модели полем:
 * так её видят инспектор, экспорт и `zoomToFit`, не пересчитывая каждый раз.
 * Плата — держать её в актуальном состоянии здесь, на каждом изменении
 * геометрии участника. Обход идёт вверх по `groupId`, поэтому вложенные
 * группы обновляются от внутренней к внешней.
 */
function resyncGroups(document: BoardDocument, touched: Iterable<Id>): void {
  const pending = new Set<Id>();

  for (const id of touched) {
    const node = document.nodes[id];
    const parent = node && node.type !== 'connector' ? node.groupId : undefined;
    if (parent !== undefined) pending.add(parent);
  }

  const done = new Set<Id>();
  while (pending.size > 0) {
    const groupId = pending.values().next().value as Id;
    pending.delete(groupId);
    if (done.has(groupId)) continue;
    done.add(groupId);

    const group = document.nodes[groupId];
    if (group?.type !== 'group') continue;

    const box = groupBounds(document, groupId);
    if (box) Object.assign(group, box);

    if (group.groupId !== undefined) pending.add(group.groupId);
  }
}

/**
 * Смещение копии от оригинала в мировых единицах.
 *
 * Ровно шаг сетки: копия видна как отдельный объект, а не как утолщённый
 * контур поверх оригинала, и при этом остаётся на сетке — выравнивание,
 * ради которого объект ставили по узлам, не рассыпается от дублирования.
 */
const DUPLICATE_OFFSET = DEFAULT_GRID_STEP;

/**
 * Копия одного узла: новый id, смещение, перевязанные внутрь копии ссылки.
 *
 * `clones` — карта «оригинал → копия», собранная ДО обхода. Без неё связи
 * не перевязать: ребёнку нужен id копии его группы, которая может ещё не
 * существовать, а группе — id копий детей.
 *
 * `document` — исходный документ, из него берутся координаты концов линии
 * на момент дублирования.
 */
function duplicateNode(
  source: Node,
  document: BoardDocument,
  clones: ReadonlyMap<Id, Id>,
  id: Id,
): Node {
  if (source.type === 'connector') {
    const copy = structuredClone(source);
    copy.id = id;
    const ends = connectorEnds(source, document);

    /**
     * Конец копии. Скопирован узел на том конце — копия смотрит на копию.
     * Не скопирован — конец отвязывается в точку, где он был, плюс то же
     * смещение. Так же ведёт себя удаление узла (инвариант 4), и по той же
     * причине: линия, оставшаяся привязанной к оригиналу, легла бы одним
     * концом на исходную и тянула бы за собой чужой узел, а копия обязана
     * быть самостоятельной.
     */
    const endOf = (which: 'from' | 'to'): Endpoint => {
      const end = source[which];
      if (end.nodeId !== undefined) {
        const twin = clones.get(end.nodeId);
        if (twin !== undefined) return nodeEndpoint(twin, end.anchor ?? 'auto');
      }
      const point = end.point ?? ends?.[which] ?? { x: 0, y: 0 };
      return pointEndpoint({ x: point.x + DUPLICATE_OFFSET, y: point.y + DUPLICATE_OFFSET });
    };

    copy.from = endOf('from');
    copy.to = endOf('to');
    // Инвариант 2: у линии не бывает groupId. По типам его нет вовсе,
    // но документ мог прийти извне — в копию такое не пускаем.
    delete (copy as { groupId?: Id }).groupId;
    return copy;
  }

  const copy = structuredClone(source);
  copy.id = id;
  copy.x += DUPLICATE_OFFSET;
  copy.y += DUPLICATE_OFFSET;

  // Группа скопирована вместе с узлом — копия входит в копию группы.
  // Нет — копия выходит из группы: приписать её оригинальной группы нельзя,
  // та о новом ребёнке не знает, и связь получилась бы односторонней.
  const twinGroup = copy.groupId === undefined ? undefined : clones.get(copy.groupId);
  // exactOptionalPropertyTypes: undefined не присвоить, поле убирают.
  if (twinGroup === undefined) delete copy.groupId;
  else copy.groupId = twinGroup;

  if (copy.type === 'group') {
    copy.children = copy.children
      .map((child) => clones.get(child))
      .filter((child): child is Id => child !== undefined);
  }

  return copy;
}

/**
 * Угол из патча. Через `in`, а не `patch.rotation`: у коннектора поля
 * `rotation` нет вовсе, и на союзе точечный доступ не проходит по типам.
 */
const rotationOf = (patch: NodePatch): number | undefined =>
  'rotation' in patch ? patch.rotation : undefined;

/** Приводит патч к тому, что модель считает допустимым. */
const sanitize = (patch: NodePatch): NodePatch => {
  const opacity = patch.opacity === undefined ? {} : { opacity: clampOpacity(patch.opacity) };

  // Угол нормализуется и здесь, хотя за него отвечает rotateNode: панель
  // свойств правит его обычным патчем, и «370» из поля ввода дошло бы
  // до модели как есть — мимо единственного места, где угол приводится.
  const angle = rotationOf(patch);
  const rotation = angle === undefined ? {} : { rotation: normalizeAngle(angle) };

  return { ...patch, ...opacity, ...rotation };
};

/**
 * Приводит рамку к тому, что модель считает рамкой.
 *
 * Нечисловое поле откатывается к ТЕКУЩЕМУ значению узла, а не в ноль: NaN
 * приходит из деления на нулевой масштаб в трансформере, и узел, прыгнувший
 * в начало координат, выглядит как потерянный. Оставить его на месте —
 * единственный безобидный исход.
 *
 * Минимальный размер зажимает `clampSize` из зоны выделения: константа
 * MIN_NODE_SIDE там уже есть, вторая разъехалась бы с `boundBoxFunc`
 * трансформера. Отрицательная ширина попадает под тот же зажим — рамка,
 * вывернутая наизнанку, в модели не существует.
 */
const sanitizeBox = (box: Box, current: Box): Box =>
  clampSize({
    x: Number.isFinite(box.x) ? box.x : current.x,
    y: Number.isFinite(box.y) ? box.y : current.y,
    width: Number.isFinite(box.width) ? box.width : current.width,
    height: Number.isFinite(box.height) ? box.height : current.height,
  });

/**
 * Отмена и возврат (FR-10) — middleware zundo поверх immer. Что попадает
 * в историю и как склеиваются шаги, описано в `features/history/model/temporal`:
 * это правила оболочки, контракта зон они не касаются.
 */
export const useBoardStore = create<BoardState>()(
  temporal(
    immer((set, get) => ({
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
          // Удаление группы уносит её содержимое: на экране это один объект,
          // и оставить после него россыпь узлов без группы значит соврать
          // пользователю про то, что он удалил.
          const expanded = withGroupDescendants(state.document, ids);

          // Инвариант 4 живёт в operations.removeNode: он отвязывает концы
          // коннекторов, считая координаты ДО удаления узла.
          state.document = removeNodesFromDocument(state.document, expanded);

          // Ссылки на удалённое из уцелевших групп надо вычистить, иначе
          // остаётся висячий id в children — нарушение инварианта 1 по духу.
          const gone = new Set(expanded);
          for (const node of Object.values(state.document.nodes)) {
            if (node.type !== 'group') continue;
            const kept = node.children.filter((child) => !gone.has(child));
            if (kept.length !== node.children.length) node.children = kept;
          }
          resyncGroups(state.document, expanded);

          const doomed = new Set(expanded);
          state.selection = state.selection.filter((id) => !doomed.has(id));
          if (state.editingNodeId && doomed.has(state.editingNodeId)) {
            state.editingNodeId = null;
          }
        }),

      /**
       * Прозрачность зажимается здесь, а не у вызывающего: `updateNode` зовут
       * и панель свойств, и инструменты холста, и проверять в каждом месте
       * — верный способ однажды забыть. Значение вне 0..1 роняет отрисовку
       * Konva на каждом кадре.
       */
      updateNode: (id, patch) =>
        set((state) => {
          const node = state.document?.nodes[id];
          if (!node) return;
          Object.assign(node, sanitize(patch));
          // Перетаскивание узла идёт через updateNode на каждом кадре —
          // рамка группы обязана ехать вместе с ним.
          if (state.document) resyncGroups(state.document, [id]);
        }),

      updateNodes: (ids, patch) =>
        set((state) => {
          if (!state.document) return;
          const clean = sanitize(patch);
          for (const id of ids) {
            const node = state.document.nodes[id];
            if (node) Object.assign(node, clean);
          }
          resyncGroups(state.document, ids);
        }),

      /**
       * Двигает и содержимое групп. Без этого рамка группы уезжала отдельно
       * от детей: `children` про сдвиг не знали, и группа расходилась
       * с тем, что в ней лежит.
       *
       * `withGroupDescendants` заодно снимает двойной сдвиг: в выделении
       * могли оказаться и группа, и её ребёнок (например, после «Выделить
       * всё»), и наивный обход сдвинул бы ребёнка дважды.
       */
      moveNodes: (ids, dx, dy) =>
        set((state) => {
          if (!state.document) return;
          for (const id of withGroupDescendants(state.document, ids)) {
            const node = state.document.nodes[id];
            if (node && node.type !== 'connector') {
              node.x += dx;
              node.y += dy;
            }
          }
          // Рамки внешних групп, если двигали что-то изнутри.
          resyncGroups(state.document, ids);
        }),
      /**
       * Изменение рамки узла. Единственное место, где размер уезжает
       * в модель: трансформер зовёт именно это действие, а не `updateNode`
       * с четырьмя полями, — иначе правило про минимальный размер
       * и про группы пришлось бы повторять на каждом вызывающем.
       *
       * ГРУППА растягивается вместе с содержимым. Своей геометрии у неё нет:
       * рамка производная от состава, и записать в неё новый размер, не тронув
       * детей, значит соврать — рамка станет больше того, что в ней лежит,
       * и первый же `resyncGroups` вернёт её обратно.
       */
      resizeNode: (id, box) =>
        set((state) => {
          const document = state.document;
          if (!document) return;

          const node = document.nodes[id];
          // У коннектора рамки нет вовсе (ConnectorNode не наследует BaseNode) —
          // менять нечего. Молча выходим, а не бросаем: действие зовут по всему
          // выделению разом, и линия в наборе — обычное дело.
          if (!node || node.type === 'connector') return;

          if (node.type !== 'group') {
            Object.assign(node, sanitizeBox(box, node));
            // Рамка группы-родителя обязана поехать за участником.
            resyncGroups(document, [id]);
            return;
          }

          /*
           * Считаем от РЕАЛЬНЫХ границ содержимого, а не от хранимого поля:
           * поле производное и могло устареть (например, документ пришёл
           * из файла), а масштаб от устаревшей рамки увёл бы состав в сторону.
           */
          const before = groupBounds(document, id) ?? {
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
          };
          const after = sanitizeBox(box, before);

          // Нулевая сторона: масштаб от неё — деление на ноль. Тогда группа
          // только переезжает, размер содержимого остаётся прежним.
          const scaleX = before.width > 0 ? after.width / before.width : 1;
          const scaleY = before.height > 0 ? after.height / before.height : 1;

          // Пустая группа: пересчитывать её будет не по чему, поэтому рамку
          // ставим сразу. Если содержимое есть, resyncGroups ниже её уточнит.
          Object.assign(node, after);

          for (const childId of withGroupDescendants(document, node.children)) {
            const child = document.nodes[childId];
            if (!child) continue;
            // Коннектор едет за фигурами сам, концами; вложенная группа —
            // производная, её пересчитает resyncGroups по её же детям.
            if (child.type === 'connector' || child.type === 'group') continue;

            /*
             * Положение внутри группы масштабируется вместе с размером:
             * иначе состав разъехался бы относительно рамки — фигуры выросли,
             * а промежутки между ними остались прежними.
             *
             * clampSize на каждом ребёнке отдельно: при сильном сжатии
             * пропорция мелкой фигуры важнее, чем то, что её нельзя поймать
             * мышью. Рамка группы после этого может оказаться чуть больше
             * запрошенной — потому и пересчитывается по факту, ниже.
             */
            Object.assign(
              child,
              clampSize({
                x: after.x + (child.x - before.x) * scaleX,
                y: after.y + (child.y - before.y) * scaleY,
                width: child.width * scaleX,
                height: child.height * scaleY,
              }),
            );
          }

          // По факту получившегося состава — и вверх, до внешних групп.
          resyncGroups(document, withGroupDescendants(document, node.children));
        }),
      /**
       * Ставит узлу АБСОЛЮТНЫЙ угол, а не докручивает на дельту: так же
       * устроены соседи по контракту (`resizeNode` принимает готовую рамку,
       * а не приращение), и так же приходит значение от трансформера —
       * Konva отдаёт итоговый угол ручки, а не поворот за кадр.
       *
       * ГРУППА поворачивается вместе с содержимым — вокруг центра своей
       * рамки. Причина та же, что у `moveNodes`: на экране группа один
       * объект, и повернуть его, оставив состав на месте, значит соврать
       * пользователю про то, что он повернул. Запретить поворот группы —
       * второй возможный ответ, и он отвергнут: рамкой уже можно выделить
       * несколько узлов и провернуть их трансформером как целое, так что
       * запрет означал бы, что сгруппированное вращается ХУЖЕ
       * несгруппированного.
       *
       * Детям прибавляется дельта `угол − текущий угол группы`, а сама
       * группа помнит свой угол. Поэтому повторный вызов с тем же значением
       * ничего не делает: без этой памяти каждый кадр перетаскивания ручки
       * докручивал бы состав заново.
       *
       * Рамка группы после поворота остаётся ОСЕВОЙ, но охватывает
       * повёрнутое содержимое честно: `groupBounds` считает по четырём углам
       * каждого ребёнка с учётом его угла. Без этого центр рамки уезжал,
       * и поворот переставал быть обратимым — `rotate(90)` и следом
       * `rotate(0)` не возвращали состав на место.
       *
       * Коннектор молча пропускается: у него нет ни рамки, ни поля
       * `rotation` (см. `ConnectorNode`), поворачивать нечего. Привязанные
       * концы поедут сами — маршрут считается от фигур каждый кадр.
       */
      rotateNode: (id, degrees) =>
        set((state) => {
          if (!state.document) return;
          const node = state.document.nodes[id];
          if (!node || node.type === 'connector') return;

          const angle = normalizeAngle(degrees);

          if (node.type !== 'group') {
            node.rotation = angle;
            // Угол не двигает x/y, но рамка родителя — производная от
            // содержимого: пересчёт держит её верной, если groupBounds
            // однажды научится учитывать поворот.
            resyncGroups(state.document, [id]);
            return;
          }

          const delta = normalizeAngle(angle - normalizeAngle(node.rotation));
          const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };

          // Вложенные группы разворачиваем: поворот обязан дойти до листьев,
          // иначе состав внутренней группы останется стоять.
          const touched = withGroupDescendants(state.document, node.children);

          for (const childId of touched) {
            const child = state.document.nodes[childId];
            if (!child || child.type === 'connector') continue;

            if (child.type !== 'group') {
              const moved = rotatePoint({ x: child.x, y: child.y }, center, delta);
              child.x = moved.x;
              child.y = moved.y;
            }

            // Вложенной группе двигаем только угол: её рамку всё равно
            // пересчитает resyncGroups по уже повёрнутым детям.
            child.rotation = normalizeAngle(normalizeAngle(child.rotation) + delta);
          }

          node.rotation = angle;
          resyncGroups(state.document, [...touched, id]);
        }),
      /**
       * Дублирует выделенное со смещением.
       *
       * Группа копируется вместе с содержимым: копия рамки без детей — пустое
       * место, а не копия. Заблокированные узлы дублируются как есть: замок
       * защищает оригинал от правки, а копию он не касается — и в копии
       * сохраняется, чтобы дублирование не работало обходом замка.
       */
      duplicateNodes: (ids) => {
        const document = get().document;
        if (!document) return [];

        const sources = withGroupDescendants(document, ids).filter((id) => document.nodes[id]);
        if (sources.length === 0) return [];

        // id копий выдаются заранее, до сборки узлов: перевязка ссылок
        // требует знать, во что превратился каждый оригинал.
        const clones = new Map<Id, Id>(sources.map((id) => [id, nanoid()]));

        set((state) => {
          if (!state.document) return;

          for (const id of sources) {
            const source = document.nodes[id];
            const copyId = clones.get(id);
            if (!source || copyId === undefined) continue;

            const copy = duplicateNode(source, document, clones, copyId);
            // Инвариант 1: узел обязан попасть И в nodes, И в order.
            // В конец: копия ложится поверх оригинала, как её и ждут увидеть.
            state.document.nodes[copyId] = copy;
            state.document.order.push(copyId);
          }

          const created = [...clones.values()];
          // Рамки копий групп считались от смещённых детей и уже верны;
          // пересчёт нужен на случай, когда рамка оригинала была устаревшей.
          resyncGroups(state.document, created);
          // Выделение переезжает на копии — как после group(): дальше человек
          // работает с тем, что только что создал, а не с оригиналом.
          state.selection = created;
        });

        return [...clones.values()];
      },

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

      /**
       * Собирает группу из выделенного.
       *
       * Коннекторы в группу не берутся — инвариант 2. Причина не формальная:
       * у линии нет рамки, двигать у неё нечего, и поехав за группой концами,
       * она отвязалась бы от фигур, к которым привязана.
       *
       * Уже сгруппированные узлы входят своей верхней группой целиком:
       * иначе выделение «группа плюс её сосед» разорвало бы первую группу
       * пополам, чего пользователь не просил.
       *
       * `null` — группировать нечего: меньше двух участников группой не
       * является, это просто узел.
       */
      group: (ids) => {
        const document = get().document;
        if (!document) return null;

        const members: Id[] = [];
        const seen = new Set<Id>();
        for (const id of ids) {
          const top = topmostGroup(document, id);
          const node = document.nodes[top];
          if (!node || node.type === 'connector' || seen.has(top)) continue;
          seen.add(top);
          members.push(top);
        }
        if (members.length < 2) return null;

        const groupId = nanoid();
        set((state) => {
          if (!state.document) return;

          const node: GroupNode = {
            id: groupId,
            type: 'group',
            // Рамка считается сразу после появления children — до этого
            // считать не от чего.
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            rotation: 0,
            opacity: 1,
            locked: false,
            children: members,
          };

          state.document.nodes[groupId] = node;
          // Инвариант 1: узел обязан попасть И в nodes, И в order.
          // Наверх: группа появляется поверх того, из чего собрана.
          state.document.order.push(groupId);

          for (const id of members) {
            const member = state.document.nodes[id];
            if (member && member.type !== 'connector') member.groupId = groupId;
          }

          const box = groupBounds(state.document, groupId);
          if (box) Object.assign(node, box);

          // Тот же вид выделения, что даёт клик по участнику: группа плюс её
          // содержимое. Одной группы мало — перетаскивание набора требует
          // видеть в выделении сами узлы, у рамки группы своего узла Konva нет.
          state.selection = [groupId, ...withGroupDescendants(state.document, members)];
        });

        return groupId;
      },

      /**
       * Распускает группу: узлы остаются на месте и на своих слоях, исчезает
       * только сама группа. Содержимое переходит выделением — так видно,
       * что именно было в группе.
       */
      ungroup: (groupId) =>
        set((state) => {
          if (!state.document) return;
          const group = state.document.nodes[groupId];
          if (group?.type !== 'group') return;

          const children = [...group.children];
          const parent = group.groupId;

          for (const id of children) {
            const child = state.document.nodes[id];
            if (!child || child.type === 'connector') continue;
            // exactOptionalPropertyTypes: поле либо задают, либо убирают.
            // Присвоить undefined нельзя, поэтому delete.
            if (parent === undefined) delete child.groupId;
            else child.groupId = parent;
          }

          // Вложенная группа: её содержимое переходит внешней, иначе узлы
          // выпали бы из неё заодно.
          if (parent !== undefined) {
            const outer = state.document.nodes[parent];
            if (outer?.type === 'group') {
              outer.children = outer.children
                .filter((id) => id !== groupId)
                .concat(children.filter((id) => !outer.children.includes(id)));
            }
          }

          delete state.document.nodes[groupId];
          state.document.order = state.document.order.filter((id) => id !== groupId);
          state.selection = children;
        }),

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
          // Рамка задела участника группы — берём группу целиком: разорвать
          // её протяжкой пользователь не просил.
          state.selection = state.document
            ? expandSelection(state.document, nodesInBox(state.document, box))
            : [];
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
