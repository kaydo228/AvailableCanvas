/**
 * Одна база на всё приложение: проекты, документы, картинки.
 *
 * Схема и версия живут здесь, потому что хранилищ стало три и открывать базу
 * из каждого модуля отдельно — верный способ получить два разных `upgrade`
 * и гонку при первом запуске.
 */

import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import type { BoardDocument, Id, Project } from '@/shared/types/document';
import type { SyncState } from './syncStore';

export interface ProstorDB extends DBSchema {
  projects: { key: Id; value: Project; indexes: { updatedAt: number } };
  documents: { key: Id; value: BoardDocument };
  blobs: { key: Id; value: { blobId: Id; blob: Blob } };
  sync: { key: Id; value: SyncState };
}

const DB_NAME = 'prostor';

/** 1 — проекты и документы. 2 — картинки (FR-06). 3 — метаданные синхронизации. */
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<ProstorDB>> | null = null;

const open = (): Promise<IDBPDatabase<ProstorDB>> => {
  dbPromise ??= openDB<ProstorDB>(DB_NAME, DB_VERSION, {
    // oldVersion, а не «создать всё»: у того, кто уже открывал доску,
    // база версии 1 с проектами внутри, и её нельзя пересоздавать.
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('projects', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('documents', { keyPath: 'projectId' });
      }
      if (oldVersion < 2) {
        db.createObjectStore('blobs', { keyPath: 'blobId' });
      }
      if (oldVersion < 3) {
        db.createObjectStore('sync', { keyPath: 'projectId' });
      }
    },

    /**
     * Соседняя вкладка открывает базу с новой версией — надо освободить ей
     * дорогу. Без этого соединение держится вечно: апгрейд там просто не
     * происходит, без ошибки и без единого события, а `deleteDatabase`
     * возвращает `blocked`. Проверено — следующая миграция встала бы намертво
     * у каждого, кто держит две вкладки.
     *
     * Соединение после `close()` непригодно, поэтому сбрасываем и кэш промиса:
     * следующий вызов откроет базу заново, уже новой версии.
     */
    blocking() {
      void dbPromise?.then((db) => db.close());
      dbPromise = null;
    },

    /** Наоборот: это МЫ ждём, пока старая вкладка отпустит базу. */
    blocked() {
      console.warn('База занята другой вкладкой Prostor — обновление схемы ждёт её закрытия.');
    },
  });
  return dbPromise;
};

/** Выполняет операцию над открытой базой. */
export const withDB = async <T>(fn: (db: IDBPDatabase<ProstorDB>) => Promise<T>): Promise<T> =>
  fn(await open());

export const getDB = open;
