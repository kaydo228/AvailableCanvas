/**
 * Хранилище проектов в IndexedDB.
 *
 * Общий фундамент экрана проектов: список, диалоги и маршруты ходят сюда,
 * а не каждый в своё хранилище. Документ доски лежит в отдельном сторе,
 * чтобы список проектов не тянул в память все доски целиком ради имён.
 *
 * Автосохранение документа (FR-11) здесь намеренно не реализовано — это
 * отдельная задача. Тут только то, без чего не существует список проектов.
 */

import { nanoid } from 'nanoid';

import type { BoardDocument, Id, Project } from '@/shared/types/document';
import { sweepBlobs } from './blobStore';
import { getDB as db } from './db';
import { publish } from './sync';

/** Пустой документ новой доски. Вид в начале координат, зум 1:1. */
export const emptyDocument = (projectId: Id): BoardDocument => ({
  projectId,
  schemaVersion: 1,
  nodes: {},
  order: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  background: { color: '#fbfbfd', grid: 'dots' },
});

/** Список проектов, свежие сверху. */
export const listProjects = async (): Promise<Project[]> => {
  const all = await (await db()).getAllFromIndex('projects', 'updatedAt');
  return all.reverse();
};

export const getProject = async (id: Id): Promise<Project | undefined> =>
  (await db()).get('projects', id);

export const getDocument = async (projectId: Id): Promise<BoardDocument | undefined> =>
  (await db()).get('documents', projectId);

/** Создаёт проект вместе с пустым документом. Возвращает проект — id нужен для перехода на холст. */
export const createProject = async (name: string): Promise<Project> => {
  const now = Date.now();
  const project: Project = {
    id: nanoid(),
    name: name.trim() || 'Новый проект',
    createdAt: now,
    updatedAt: now,
  };

  const tx = (await db()).transaction(['projects', 'documents'], 'readwrite');
  await Promise.all([
    tx.objectStore('projects').put(project),
    tx.objectStore('documents').put(emptyDocument(project.id)),
    tx.done,
  ]);
  publish({ kind: 'projects-changed' });
  return project;
};

export const renameProject = async (id: Id, name: string): Promise<void> => {
  const database = await db();
  const project = await database.get('projects', id);
  if (!project) return;
  await database.put('projects', {
    ...project,
    name: name.trim() || project.name,
    updatedAt: Date.now(),
  });
  publish({ kind: 'projects-changed' });
};

/** Копия проекта вместе с содержимым доски. Возвращает новый проект. */
export const duplicateProject = async (id: Id): Promise<Project | undefined> => {
  const database = await db();
  const source = await database.get('projects', id);
  if (!source) return undefined;

  const document = (await database.get('documents', id)) ?? emptyDocument(id);
  const now = Date.now();
  const copy: Project = {
    ...source,
    id: nanoid(),
    name: `${source.name} — копия`,
    createdAt: now,
    updatedAt: now,
  };

  const tx = database.transaction(['projects', 'documents'], 'readwrite');
  await Promise.all([
    tx.objectStore('projects').put(copy),
    tx.objectStore('documents').put({ ...structuredClone(document), projectId: copy.id }),
    tx.done,
  ]);
  publish({ kind: 'projects-changed' });
  return copy;
};

/**
 * Необратимо. Документ удаляется вместе с проектом, иначе он останется сиротой
 * навсегда, а следом — картинки доски: на них уже некому ссылаться.
 *
 * Картинки сносятся ПОСЛЕ транзакции и по всей базе разом, а не по списку из
 * удаляемого документа: одна и та же картинка могла попасть в две доски
 * дублированием проекта, и удалять её по факту «была в этом документе» значит
 * пробить дыру в копии.
 */
export const deleteProject = async (id: Id): Promise<void> => {
  const tx = (await db()).transaction(['projects', 'documents'], 'readwrite');
  await Promise.all([
    tx.objectStore('projects').delete(id),
    tx.objectStore('documents').delete(id),
    tx.done,
  ]);
  await sweepBlobs();
  publish({ kind: 'deleted', projectId: id });
};

export type SaveOutcome =
  | { ok: true; updatedAt: number }
  /** Проект удалён — писать документ некуда, он остался бы сиротой. */
  | { ok: false; reason: 'deleted' }
  /** Документ переписан другой вкладкой: наша запись затёрла бы чужую работу. */
  | { ok: false; reason: 'conflict'; updatedAt: number };

/**
 * Сохраняет документ и двигает updatedAt проекта — от него зависит порядок
 * в списке.
 *
 * `expectedUpdatedAt` — то значение, которое вкладка видела, когда открывала
 * проект. Разошлось с базой — документ переписала другая вкладка, и слепая
 * запись поверх стёрла бы её работу молча. Без этого аргумента проверки нет:
 * импорт и починка пишут в проект, который только что создали сами.
 *
 * Проект исчез — документ не пишем вовсе. Раньше запись всё равно проходила,
 * и в базе оставался документ, на который не ссылается ни один проект.
 * Чтение и запись в одной транзакции: между ними не должна влезть чужая.
 */
export const saveDocument = async (
  document: BoardDocument,
  expectedUpdatedAt?: number,
): Promise<SaveOutcome> => {
  const database = await db();
  const tx = database.transaction(['projects', 'documents'], 'readwrite');
  const projects = tx.objectStore('projects');
  const project = await projects.get(document.projectId);

  if (!project) {
    await tx.done;
    return { ok: false, reason: 'deleted' };
  }
  if (expectedUpdatedAt !== undefined && project.updatedAt !== expectedUpdatedAt) {
    await tx.done;
    return { ok: false, reason: 'conflict', updatedAt: project.updatedAt };
  }

  const updatedAt = Date.now();
  await Promise.all([
    tx.objectStore('documents').put(document),
    projects.put({ ...project, updatedAt }),
    tx.done,
  ]);

  publish({ kind: 'saved', projectId: document.projectId, updatedAt });
  return { ok: true, updatedAt };
};
