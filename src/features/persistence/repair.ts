/**
 * Починка документа на входе (П1 из docs/nightly/shell/01-план-починки.md).
 *
 * Документ попадает в стор двумя путями — из файла при импорте и из IndexedDB
 * при открытии проекта, — и ни на одном из них до сих пор не было ни единой
 * проверки. Через это достижимы битые данные: `zoom: 0`, дубли в `order`,
 * `Endpoint` без единого поля, `opacity: 42`. Всё это уезжает в хранилище,
 * переживает перезагрузку и экспортируется обратно файлом, который проходит
 * собственную валидацию.
 *
 * Решение (docs/DECISIONS.md, 2026-08-27): чинить то, что чинится однозначно,
 * и отказывать только там, где починка была бы гаданием. Отказ живёт в схеме
 * `features/export/lib/fileFormat.ts` и работает на импорте; здесь — починка,
 * и она работает на обоих входах. Поэтому чтение из IndexedDB задним числом
 * лечит доски, испорченные до этого фикса.
 *
 * Функция чистая: ни React, ни стора, ни базы. Проверяется vitest'ом напрямую.
 *
 * Временная дубликация: то же самое обязан уметь `shared/model/invariants.ts`,
 * но его шапка отдаёт реализацию зоне A. Запрос отправлен
 * (docs/CONTRACT-REQUESTS.md, 2026-08-27 B → A). Когда `validateDocument`
 * появится, здесь останется только починка, а поиск нарушений уедет туда.
 */

import type { BoardDocument, BoxNode, Endpoint, Id, Node } from '@/shared/types/document';

/** Нарушение, которое пришлось исправить. `rule` — номер инварианта из ТЗ, раздел 5. */
export interface Repair {
  rule: 1 | 2 | 3 | 4 | 5;
  what: string;
}

export interface RepairResult {
  document: BoardDocument;
  repairs: Repair[];
}

/** Инвариант 5. Держится `clampZoom` в движке, но импорт мимо движка. */
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;

/** Размер меньше единицы Konva рисует нулевым холстом и роняет отрисовку. */
const MIN_SIDE = 1;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Конечное число или запасное: NaN и Infinity в модели дороже неточного значения. */
const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const isBox = (node: Node): node is BoxNode => node.type !== 'connector';

/** Центр рамки. Нужен, чтобы отвязанный конец не улетал в начало координат. */
const centerOf = (node: BoxNode): { x: number; y: number } => ({
  x: node.x + node.width / 2,
  y: node.y + node.height / 2,
});

/**
 * Числовые поля узла.
 *
 * `width`/`height` зажимаются снизу единицей, а не приводятся к модулю:
 * `-500` — это мусор, а не «500 в другую сторону», и угадывать намерение
 * тут не из чего.
 */
function repairNumbers(node: Node, repairs: Repair[]): Node {
  const opacity = clamp(finite(node.opacity, 1), 0, 1);
  if (opacity !== node.opacity) {
    repairs.push({ rule: 5, what: `узел ${node.id}: прозрачность ${node.opacity} → ${opacity}` });
  }

  if (!isBox(node)) {
    return opacity === node.opacity ? node : { ...node, opacity };
  }

  const x = finite(node.x, 0);
  const y = finite(node.y, 0);
  const rotation = finite(node.rotation, 0);
  const width = Math.max(MIN_SIDE, finite(node.width, MIN_SIDE));
  const height = Math.max(MIN_SIDE, finite(node.height, MIN_SIDE));

  if (x !== node.x || y !== node.y || rotation !== node.rotation) {
    repairs.push({ rule: 5, what: `узел ${node.id}: нечисловые координаты обнулены` });
  }
  if (width !== node.width || height !== node.height) {
    repairs.push({
      rule: 5,
      what: `узел ${node.id}: размер ${node.width}×${node.height} → ${width}×${height}`,
    });
  }

  return { ...node, x, y, rotation, width, height, opacity };
}

/**
 * Инвариант 3: у `Endpoint` задан ровно один из `nodeId` и `point`.
 *
 * Оба разом — оставляем `nodeId`: привязка к фигуре сильнее координаты, она
 * переживает перемещение фигуры, а координата — нет.
 * Ни одного — ставим точку, иначе линию нечем нарисовать вовсе.
 */
function repairEndpoint(
  endpoint: Endpoint,
  connectorId: Id,
  which: 'from' | 'to',
  nodes: Record<Id, Node>,
  fallback: { x: number; y: number },
  repairs: Repair[],
): Endpoint {
  const hasNode = endpoint.nodeId !== undefined;
  const hasPoint = endpoint.point !== undefined;

  if (hasNode && hasPoint) {
    repairs.push({
      rule: 3,
      what: `линия ${connectorId}, конец «${which}»: заданы и узел, и точка — оставлен узел`,
    });
    return { nodeId: endpoint.nodeId as Id, anchor: endpoint.anchor ?? 'auto' };
  }

  if (hasNode && !nodes[endpoint.nodeId as Id]) {
    repairs.push({
      rule: 3,
      what: `линия ${connectorId}, конец «${which}»: узел ${endpoint.nodeId} не существует — конец отвязан`,
    });
    return { point: fallback };
  }

  if (!hasNode && !hasPoint) {
    repairs.push({
      rule: 3,
      what: `линия ${connectorId}, конец «${which}»: не задано ничего — конец поставлен в точку`,
    });
    return { point: fallback };
  }

  if (hasPoint) {
    const point = endpoint.point as { x: number; y: number };
    const x = finite(point.x, 0);
    const y = finite(point.y, 0);
    if (x !== point.x || y !== point.y) {
      repairs.push({
        rule: 3,
        what: `линия ${connectorId}, конец «${which}»: нечисловая координата обнулена`,
      });
      return { point: { x, y } };
    }
  }

  return endpoint;
}

/**
 * Куда поставить отвязанный конец. Тянемся к противоположному концу, чтобы
 * линия осталась рядом со своим местом, а не улетела в начало координат:
 * доска бесконечная, и найти там линию потом невозможно.
 */
function fallbackPoint(other: Endpoint, nodes: Record<Id, Node>): { x: number; y: number } {
  if (other.nodeId !== undefined) {
    const node = nodes[other.nodeId];
    if (node && isBox(node)) return centerOf(node);
  }
  if (other.point) {
    return { x: finite(other.point.x, 0), y: finite(other.point.y, 0) };
  }
  return { x: 0, y: 0 };
}

/**
 * Инвариант 1: `order` и `nodes` соответствуют один к одному.
 *
 * Дубль оставляем первым вхождением: порядок снизу вверх, и первое вхождение
 * — то место, где узел оказался изначально.
 */
function repairOrder(nodes: Record<Id, Node>, order: Id[], repairs: Repair[]): Id[] {
  const seen = new Set<Id>();
  const result: Id[] = [];

  for (const id of order) {
    if (seen.has(id)) {
      repairs.push({ rule: 1, what: `узел ${id} стоит в order дважды — лишнее вхождение убрано` });
      continue;
    }
    if (!nodes[id]) {
      repairs.push({ rule: 1, what: `в order есть ${id}, которого нет в nodes — запись убрана` });
      continue;
    }
    seen.add(id);
    result.push(id);
  }

  for (const id of Object.keys(nodes)) {
    if (seen.has(id)) continue;
    repairs.push({ rule: 1, what: `узел ${id} есть в nodes, но не в order — дописан наверх` });
    result.push(id);
  }

  return result;
}

/**
 * Чинит документ. Возвращает исправленную копию и список того, что пришлось
 * поправить: пустой список означает, что документ был в порядке.
 *
 * Исходный документ не мутируется — он может лежать в сторе под immer.
 */
export function repairDocument(document: BoardDocument): RepairResult {
  const repairs: Repair[] = [];

  /*
   * Object.create(null), а не {}: узел с id `__proto__` при обычном
   * присваивании уходит в сеттер прототипа и молча пропадает, оставаясь
   * в order висячей ссылкой. Ровно так же сделано в shared/model/operations.
   */
  const nodes = Object.create(null) as Record<Id, Node>;

  for (const [key, node] of Object.entries(document.nodes)) {
    if (!node) continue;

    // Ключ — источник правды: на него ссылаются order и концы линий,
    // а node.id больше нигде не используется как адрес.
    let fixed = node.id === key ? node : { ...node, id: key };
    if (node.id !== key) {
      repairs.push({ rule: 1, what: `узел под ключом ${key} звался ${node.id} — id выправлен` });
    }

    fixed = repairNumbers(fixed, repairs);

    // Инвариант 2: коннектор не участвует в группе.
    if (fixed.type === 'connector' && 'groupId' in fixed) {
      const { groupId: _groupId, ...rest } = fixed as typeof fixed & { groupId?: Id };
      repairs.push({ rule: 2, what: `линия ${key}: groupId у коннектора не бывает — убран` });
      fixed = rest as Node;
    }

    nodes[key] = fixed;
  }

  // Концы линий и дети групп — вторым проходом: обоим нужен полный набор узлов.
  for (const [id, node] of Object.entries(nodes)) {
    if (node.type === 'connector') {
      const from = repairEndpoint(
        node.from,
        id,
        'from',
        nodes,
        fallbackPoint(node.to, nodes),
        repairs,
      );
      const to = repairEndpoint(node.to, id, 'to', nodes, fallbackPoint(node.from, nodes), repairs);
      if (from !== node.from || to !== node.to) nodes[id] = { ...node, from, to };
      continue;
    }

    if (node.type === 'group') {
      const children = node.children.filter((child) => nodes[child] !== undefined);
      if (children.length !== node.children.length) {
        repairs.push({
          rule: 1,
          what: `группа ${id}: ${node.children.length - children.length} детей не существует — убраны`,
        });
        nodes[id] = { ...node, children };
      }
    }
  }

  const order = repairOrder(nodes, document.order, repairs);

  const zoom = clamp(finite(document.viewport.zoom, 1), ZOOM_MIN, ZOOM_MAX);
  if (zoom !== document.viewport.zoom) {
    repairs.push({ rule: 5, what: `масштаб ${document.viewport.zoom} → ${zoom}` });
  }
  const viewportX = finite(document.viewport.x, 0);
  const viewportY = finite(document.viewport.y, 0);
  if (viewportX !== document.viewport.x || viewportY !== document.viewport.y) {
    repairs.push({ rule: 5, what: 'положение вида нечисловое — обнулено' });
  }

  return {
    document: {
      ...document,
      // Обратно в обычный объект: Object.create(null) ломает структурное
      // клонирование в IndexedDB и сравнение в тестах.
      nodes: { ...nodes },
      order,
      viewport: { x: viewportX, y: viewportY, zoom },
    },
    repairs,
  };
}

/** Короткий человеческий отчёт для тоста. Список на сорок строк никто не читает. */
export const describeRepairs = (repairs: Repair[], limit = 3): string => {
  const shown = repairs
    .slice(0, limit)
    .map((r) => r.what)
    .join('; ');
  const rest = repairs.length > limit ? ` и ещё ${repairs.length - limit}` : '';
  return `${shown}${rest}`;
};
