/**
 * Формат файла `.prostor.json` и его проверка (FR-12).
 *
 * Файл приходит извне — с другой машины, из другой версии приложения, из-под
 * чужого редактора. Это граница доверия: всё, что за ней, проверяется схемой,
 * а не «ну там же должен быть документ». Схема повторяет `shared/types/document`
 * и живёт здесь намеренно: она нужна импорту, а не модели.
 *
 * Картинки лежат в файле целиком, data-URL строкой на `blobId`. Иначе файл
 * открывается только на той машине, где картинки уже лежат в IndexedDB, —
 * то есть ровно там, где он и так не нужен.
 */

import { z } from 'zod';

export const FILE_FORMAT = 'prostor-board';

/** Версия обёртки файла. Документ внутри версионируется своим schemaVersion. */
export const FILE_VERSION = 1;

/** Версия модели документа, которую понимает это приложение. */
export const DOCUMENT_VERSION = 1;

const textStyle = z.object({
  value: z.string(),
  fontSize: z.number(),
  color: z.string(),
  align: z.enum(['left', 'center', 'right']),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  lineHeight: z.number().optional(),
});

const box = {
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number(),
  opacity: z.number(),
  locked: z.boolean(),
  groupId: z.string().optional(),
};

// Инвариант 3 из модели: у конца задан РОВНО один из nodeId и point.
// Без этой проверки конец без обоих проезжает импорт, connectorPoints не может
// посчитать маршрут, и ConnectorView просто ничего не рисует: узел в документе
// есть, на доске его нет, сказать об этом некому.
const endpoint = z
  .object({
    nodeId: z.string().optional(),
    anchor: z.enum(['top', 'right', 'bottom', 'left', 'auto']).optional(),
    point: z.object({ x: z.number(), y: z.number() }).optional(),
  })
  .refine((value) => (value.nodeId === undefined) !== (value.point === undefined), {
    message: 'у конца линии должен быть ровно один из nodeId и point',
  });

const node = z.discriminatedUnion('type', [
  z.object({
    ...box,
    type: z.literal('shape'),
    shape: z.enum(['rect', 'roundRect', 'ellipse', 'triangle', 'diamond']),
    fill: z.string(),
    stroke: z.string(),
    strokeWidth: z.number(),
    dash: z.array(z.number()).optional(),
    cornerRadius: z.number().optional(),
    label: textStyle.optional(),
  }),
  z.object({ ...box, type: z.literal('text'), text: textStyle, autoWidth: z.boolean() }),
  z.object({ ...box, type: z.literal('sticky'), fill: z.string(), text: textStyle }),
  z.object({
    ...box,
    type: z.literal('image'),
    blobId: z.string(),
    naturalWidth: z.number(),
    naturalHeight: z.number(),
  }),
  z.object({
    ...box,
    type: z.literal('draw'),
    points: z.array(z.number()),
    stroke: z.string(),
    strokeWidth: z.number(),
  }),
  z.object({ ...box, type: z.literal('group'), children: z.array(z.string()) }),
  z.object({
    id: z.string(),
    type: z.literal('connector'),
    from: endpoint,
    to: endpoint,
    routing: z.enum(['straight', 'elbow', 'curve']),
    stroke: z.string(),
    strokeWidth: z.number(),
    dash: z.array(z.number()).optional(),
    startCap: z.enum(['none', 'arrow', 'dot']),
    endCap: z.enum(['none', 'arrow', 'dot']),
    label: textStyle.optional(),
    locked: z.boolean(),
    opacity: z.number(),
  }),
]);

const documentSchema = z
  .object({
    projectId: z.string(),
    schemaVersion: z.literal(DOCUMENT_VERSION),
    nodes: z.record(z.string(), node),
    order: z.array(z.string()),
    viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
    background: z.object({
      color: z.string(),
      grid: z.enum(['dots', 'lines', 'none']),
    }),
  })
  // Инвариант 1 из модели: order и nodes соответствуют один к одному. Схема
  // его проверяет, потому что документ, где они разъехались, откроется пустым
  // или потеряет узлы молча — и виноват будет импорт, а не файл.
  .superRefine((value, ctx) => {
    const inOrder = new Set<string>();
    for (const id of value.order) {
      if (!value.nodes[id]) {
        ctx.addIssue({ code: 'custom', path: ['order'], message: `узла ${id} нет в nodes` });
      }
      // Соответствие взаимно однозначное: дубль в order проходит обе проверки
      // ниже, но рисует узел дважды с одним React-ключом, а после удаления
      // оставляет в order висячий id.
      if (inOrder.has(id)) {
        ctx.addIssue({ code: 'custom', path: ['order'], message: `узел ${id} в order дважды` });
      }
      inOrder.add(id);
    }
    for (const id of Object.keys(value.nodes)) {
      if (!inOrder.has(id)) {
        ctx.addIssue({ code: 'custom', path: ['nodes', id], message: `узла ${id} нет в order` });
      }
    }
  });

export const boardFileSchema = z
  .object({
    format: z.literal(FILE_FORMAT),
    version: z.literal(FILE_VERSION),
    name: z.string(),
    savedAt: z.number().optional(),
    document: documentSchema,
    /** blobId → data-URL картинки. Пусто, если картинок на доске нет. */
    images: z.record(z.string(), z.string()).default({}),
  })
  // Картинка узла обязана лежать в этом же файле. Иначе доска откроется
  // с дырой на месте картинки, и понять почему будет уже невозможно:
  // blobId ссылается в IndexedDB чужой машины.
  .superRefine((file, ctx) => {
    for (const [id, node] of Object.entries(file.document.nodes)) {
      if (node.type === 'image' && file.images[node.blobId] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['images', node.blobId],
          message: `картинки для узла ${id} нет в файле`,
        });
      }
    }
  });

export type BoardFile = z.infer<typeof boardFileSchema>;

/** Отказ с человеческим текстом: его показывают пользователю как есть. */
export class BadFile extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadFile';
  }
}

const RU_TYPES: Record<string, string> = {
  string: 'строка',
  number: 'число',
  boolean: 'да или нет',
  object: 'объект',
  array: 'список',
  undefined: 'ничего',
  null: 'пусто',
};

const ru = (name: unknown): string => RU_TYPES[String(name)] ?? String(name);

/** Что реально лежит по пути ошибки. У zod это в issue не всегда доезжает. */
const valueAt = (root: unknown, path: readonly PropertyKey[]): unknown =>
  path.reduce<unknown>(
    (value, key) =>
      typeof value === 'object' && value !== null
        ? (value as Record<PropertyKey, unknown>)[key]
        : undefined,
    root,
  );

const typeOf = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const describe = (issue: z.core.$ZodIssue, json: unknown): string => {
  const where = issue.path.length > 0 ? issue.path.join('.') : 'корень файла';

  if (issue.code === 'invalid_type') {
    return `${where}: ожидалось ${ru(issue.expected)}, а там ${ru(typeOf(valueAt(json, issue.path)))}`;
  }
  if (issue.code === 'invalid_value' || issue.code === 'invalid_union') {
    return `${where}: недопустимое значение`;
  }
  return `${where}: ${issue.message}`;
};

/** Сколько ошибок показываем: список на сорок строк никто не читает. */
const MAX_REPORTED = 3;

/**
 * Разбирает содержимое файла. Любая проблема — `BadFile` с текстом, который
 * можно показать пользователю: что именно не так и где.
 *
 * @throws BadFile
 */
export const parseBoardFile = (raw: string): BoardFile => {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new BadFile(
      `Файл не читается как JSON — похоже, он повреждён или скачался не полностью. ${
        error instanceof Error ? error.message : ''
      }`.trim(),
    );
  }

  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new BadFile('В файле не объект. Это не доска Prostor.');
  }

  const head = json as Record<string, unknown>;

  if (head.format !== FILE_FORMAT) {
    throw new BadFile(
      'Это не файл доски Prostor: в нём нет отметки формата «prostor-board». ' +
        'Экспорт делается кнопкой «Экспорт → JSON».',
    );
  }

  // Версию проверяем до схемы: «ожидалась единица, получена двойка» — это
  // не ошибка формата, а файл из другой версии, и сказать надо именно это.
  const version = head.version;
  const documentVersion =
    typeof head.document === 'object' && head.document !== null
      ? (head.document as Record<string, unknown>).schemaVersion
      : undefined;

  for (const [got, expected, what] of [
    [version, FILE_VERSION, 'файла'],
    [documentVersion, DOCUMENT_VERSION, 'документа'],
  ] as const) {
    if (typeof got === 'number' && got !== expected) {
      throw new BadFile(
        got > expected
          ? `Файл сделан более новой версией Prostor: версия ${what} ${got}, а здесь понимают ${expected}. Обновите приложение.`
          : `Файл сделан старой версией Prostor: версия ${what} ${got}, а здесь понимают ${expected}. Открыть его нечем.`,
      );
    }
  }

  const result = boardFileSchema.safeParse(json);
  if (result.success) return result.data;

  const issues = result.error.issues;
  const shown = issues
    .slice(0, MAX_REPORTED)
    .map((issue) => describe(issue, json))
    .join('; ');
  const rest = issues.length > MAX_REPORTED ? ` и ещё ${issues.length - MAX_REPORTED}` : '';

  throw new BadFile(`Файл не похож на доску Prostor. Что не так: ${shown}${rest}.`);
};
