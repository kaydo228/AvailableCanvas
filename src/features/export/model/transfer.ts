/**
 * Экспорт и импорт документа в JSON (FR-12).
 *
 * Картинки уезжают в файл целиком, data-URL строкой: в документе от них лежит
 * только `blobId`, а он ссылается в IndexedDB — на другой машине по нему
 * ничего нет. Файл без картинок внутри открывается дырявым, и понять почему
 * пользователь не сможет.
 *
 * При импорте картинки перекладываются под НОВЫМИ blobId: id из чужого файла
 * может совпасть с уже занятым, и тогда две доски начнут делить одну картинку —
 * удаление на одной сломает другую.
 */

import { getBlob, putImage } from '@/features/persistence/blobStore';
import { createProject, saveDocument } from '@/features/persistence/projectsRepo';
import { useBoardStore } from '@/shared/store/board';
import type { BoardDocument, Id, Node, Project } from '@/shared/types/document';
import {
  BadFile,
  type BoardFile,
  FILE_FORMAT,
  FILE_VERSION,
  parseBoardFile,
} from '../lib/fileFormat';
import { downloadUrl, ExportFailed, safeFilename } from './exportPng';

const toDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ExportFailed('Картинку не удалось прочитать из хранилища.'));
    reader.readAsDataURL(blob);
  });

/**
 * Собирает файл доски: документ как есть плюс картинки внутрь, data-URL'ами.
 *
 * Отдельно от скачивания — результат можно проверить, не открывая диалог
 * сохранения файла.
 *
 * @throws ExportFailed
 */
export const buildBoardFile = async (name: string): Promise<BoardFile> => {
  const document = useBoardStore.getState().document;
  if (!document) throw new ExportFailed('Доска ещё не открыта.');

  const images: Record<Id, string> = {};
  for (const node of Object.values(document.nodes)) {
    if (node.type !== 'image' || images[node.blobId]) continue;
    const blob = await getBlob(node.blobId);
    if (!blob) {
      throw new ExportFailed(
        `Картинка узла ${node.id} потерялась из хранилища — файл вышел бы дырявым.`,
      );
    }
    images[node.blobId] = await toDataUrl(blob);
  }

  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    name,
    savedAt: Date.now(),
    document,
    images,
  };
};

/** Собирает файл и отдаёт браузеру на скачивание. */
export const exportJson = async (name: string): Promise<void> => {
  const file = await buildBoardFile(name);

  // Blob, а не data-URL: документ на тысячу узлов — это мегабайты, а длинные
  // data-URL Safari режет.
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
  try {
    downloadUrl(url, `${safeFilename(name)}.prostor.json`);
  } finally {
    // Отзывать сразу нельзя — скачивание не успеет стартовать.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
};

const blobFromDataUrl = async (blobId: Id, dataUrl: string): Promise<Blob> => {
  // Схема проверяется ДО fetch, и это не придирка к формату: fetch по строке
  // из чужого файла сходит на любой адрес, который там написан. Файл с
  // `images: {"x": "https://чужой.сайт/пиксель.gif"}` превратил бы импорт
  // в маячок с IP пользователя — при том что бэкенда у нас нет вовсе.
  const unreadable = new BadFile(
    `Картинка ${blobId} записана в файле не как data-URL — прочитать нечем.`,
  );
  if (!dataUrl.startsWith('data:image/')) throw unreadable;
  try {
    return await (await fetch(dataUrl)).blob();
  } catch {
    throw unreadable;
  }
};

/** Меняет blobId у картинок на новые. Остальные узлы отдаются как есть. */
const remapImages = (nodes: Record<Id, Node>, remap: Map<Id, Id>): Record<Id, Node> =>
  Object.fromEntries(
    Object.entries(nodes).map(([id, node]) => [
      id,
      node.type === 'image' ? { ...node, blobId: remap.get(node.blobId) ?? node.blobId } : node,
    ]),
  );

/**
 * Импортирует файл в НОВЫЙ проект. Существующие доски не трогает: импорт,
 * который молча перезаписывает открытую доску, теряет чужую работу.
 *
 * @throws BadFile — файл не прошёл проверку, текст показывать пользователю.
 * @throws ImageRejected — картинка внутри файла не проходит по формату или размеру.
 */
export const importJson = async (file: File): Promise<Project> => {
  const parsed = parseBoardFile(await file.text());

  // Картинки перекладываются ДО создания проекта: если одна из них не пройдёт
  // проверку putImage, лучше не оставлять после себя пустой проект в списке.
  const remap = new Map<Id, Id>();
  for (const [blobId, dataUrl] of Object.entries(parsed.images)) {
    const blob = await blobFromDataUrl(blobId, dataUrl);
    const stored = await putImage(blob);
    remap.set(blobId, stored.blobId);
  }

  const project = await createProject(parsed.name);

  const document: BoardDocument = {
    ...parsed.document,
    projectId: project.id,
    nodes: remapImages(parsed.document.nodes as Record<Id, Node>, remap),
  };

  await saveDocument(document);
  return project;
};
