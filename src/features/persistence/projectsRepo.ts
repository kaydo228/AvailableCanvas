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
import { forgetSyncState } from './syncStore';

/**
 * Предел длины имени проекта.
 *
 * Поле в диалоге ограничено им же, но одного поля мало: `duplicateProject`
 * дописывает « — копия» мимо всякого поля, и шесть дублирований подряд давали
 * имя на 163 символа без всякого предела.
 */
export const MAX_PROJECT_NAME = 120;

/** Обрезает имя по пределу, не оставляя висящего пробела на срезе. */
const capName = (name: string): string =>
  name.length <= MAX_PROJECT_NAME ? name : name.slice(0, MAX_PROJECT_NAME).trimEnd();

/**
 * Есть ли в имени хоть один видимый символ.
 *
 * `trim()` мало: он не трогает ни форматирующие символы (`\p{Cf}` — сюда
 * попадают zero-width space и метки направления письма), ни экзотические
 * пробелы. Имя из них проходило проверку и давало карточку без подписи,
 * которую в списке не отличить от соседних.
 */
const INVISIBLE = /[\p{Cf}\p{Zs}\s]/gu;
export const isBlankName = (name: string): boolean => name.replace(INVISIBLE, '') === '';

/** Имя для записи: пустое по существу — значит пустое. */
const cleanName = (name: string): string => (isBlankName(name) ? '' : capName(name.trim()));

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

/** Превью не меняет updatedAt: это снимок уже сохранённой доски, а не правка. */
export const saveProjectThumbnail = async (id: Id, thumbnail: string): Promise<void> => {
  const database = await db();
  const project = await database.get('projects', id);
  if (!project) return;
  await database.put('projects', { ...project, thumbnail });
  publish({ kind: 'projects-changed' });
};

/** Создаёт проект вместе с пустым документом. Возвращает проект — id нужен для перехода на холст. */
export const createProject = async (name: string): Promise<Project> => {
  const now = Date.now();
  const project: Project = {
    id: nanoid(),
    name: cleanName(name) || 'Новый проект',
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

/**
 * Возвращает `false`, если проекта уже нет. Раньше функция молча выходила,
 * диалог закрывался, и человек оставался уверен, что переименовал доску —
 * а её удалили в соседней вкладке.
 */
export const renameProject = async (id: Id, name: string): Promise<boolean> => {
  const database = await db();
  const project = await database.get('projects', id);
  if (!project) return false;
  await database.put('projects', {
    ...project,
    name: cleanName(name) || project.name,
    updatedAt: Date.now(),
  });
  publish({ kind: 'projects-changed' });
  return true;
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
    name: capName(`${source.name} — копия`),
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
  // Метаданные синхронизации — тоже локальное состояние проекта: без этого
  // они переживают удаление и выдают себя за доску, которая когда-то была.
  await forgetSyncState(id);
  publish({ kind: 'deleted', projectId: id });
};

/**
 * Запись проекта и документа как есть — для того, что пришло с сервера.
 *
 * `updatedAt` НЕ сдвигается и проверка сессии вкладки не делается: это не
 * правка пользователя, а другая версия той же доски. Подвинуть время здесь —
 * значит на следующем круге синхронизации выгрузить её обратно и зациклиться.
 */
export const overwriteProject = async (
  project: Project,
  document: BoardDocument,
): Promise<void> => {
  const database = await db();
  const tx = database.transaction(['projects', 'documents'], 'readwrite');
  await Promise.all([
    tx.objectStore('projects').put(project),
    tx.objectStore('documents').put(document),
    tx.done,
  ]);
  publish({ kind: 'projects-changed' });
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
