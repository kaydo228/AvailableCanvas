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

import { deleteBlob, getBlob, putImage } from '@/features/persistence/blobStore';
import { createProject, saveDocument } from '@/features/persistence/projectsRepo';
import { type Repair, repairDocument } from '@/features/persistence/repair';
import { useBoardStore } from '@/shared/store/board';
import type { BoardDocument, Id, Node, Project } from '@/shared/types/document';
import { downloadUrl, ExportFailed, safeFilename } from '../lib/download';
import {
  BadFile,
  type BoardFile,
  FILE_FORMAT,
  FILE_VERSION,
  parseBoardFile,
} from '../lib/fileFormat';

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

/**
 * Читает картинку из файла.
 *
 * Проверка префикса — не формальность. `fetch` берёт любую строку, и без неё
 * файл с `images: {"x": "http://чужой.хост/beacon"}` заставлял приложение
 * сходить по этому адресу при открытии доски: маячок «файл открыт» плюс запрос
 * по адресу, доступному из сети того, кто открыл. Ни один узел на такую запись
 * ссылаться не обязан — старый цикл шёл по `images`, а не по узлам.
 */
const blobFromDataUrl = async (blobId: Id, dataUrl: string): Promise<Blob> => {
  if (!dataUrl.startsWith('data:image/')) {
    throw new BadFile(
      `Картинка ${blobId} записана в файле не как data-URL картинки — прочитать нечем.`,
    );
  }
  try {
    return await (await fetch(dataUrl)).blob();
  } catch {
    throw new BadFile(`Картинка ${blobId} записана в файле не как data-URL — прочитать нечем.`);
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

export interface ImportResult {
  project: Project;
  /** Что пришлось поправить в документе. Пусто — файл был в порядке. */
  repairs: Repair[];
}

/**
 * Импортирует файл в НОВЫЙ проект. Существующие доски не трогает: импорт,
 * который молча перезаписывает открытую доску, теряет чужую работу.
 *
 * Документ проходит через `repairDocument`: схема ловит структуру, но не
 * инварианты модели, и файл с `zoom: 0` или дублями в `order` до этого
 * уезжал в хранилище как есть. Список починок возвращается наружу — молча
 * править чужой файл нельзя, человек должен знать, что получил не то,
 * что отдавали.
 *
 * @throws BadFile — файл не прошёл проверку, текст показывать пользователю.
 * @throws ImageRejected — картинка внутри файла не проходит по формату или размеру.
 */
export const importJson = async (file: File): Promise<ImportResult> => {
  const parsed = parseBoardFile(await file.text());

  // Перекладываем только те картинки, на которые ссылается хоть один узел.
  // Обход по всему `images` означал, что запись, не нужную ни одному узлу,
  // приложение всё равно пойдёт читать — этим и пользовался маячок.
  const needed = new Set<Id>();
  for (const node of Object.values(parsed.document.nodes)) {
    if (node.type === 'image') needed.add(node.blobId);
  }

  // Картинки перекладываются ДО создания проекта: если одна из них не пройдёт
  // проверку putImage, лучше не оставлять после себя пустой проект в списке.
  // Уже записанные при этом сносятся — иначе каждая повторная попытка
  // импорта того же файла добавляла бы в базу ещё один осиротевший блоб.
  const remap = new Map<Id, Id>();
  try {
    for (const [blobId, dataUrl] of Object.entries(parsed.images)) {
      if (!needed.has(blobId)) continue;
      const blob = await blobFromDataUrl(blobId, dataUrl);
      const stored = await putImage(blob);
      remap.set(blobId, stored.blobId);
    }
  } catch (error) {
    await Promise.all([...remap.values()].map((id) => deleteBlob(id)));
    throw error;
  }

  const project = await createProject(parsed.name);

  const { document, repairs } = repairDocument({
    ...parsed.document,
    projectId: project.id,
    nodes: remapImages(parsed.document.nodes as Record<Id, Node>, remap),
  } as BoardDocument);

  await saveDocument(document);
  return { project, repairs };
};
