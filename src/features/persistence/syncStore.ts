/**
 * Что вкладка знает о синхронизации каждой доски.
 *
 * Живёт отдельно от `Project` намеренно: `Project` — общий шов (зона A и B
 * договорились о нём в shared/types), и расширять его ради облака значило бы
 * менять контракт из-за детали одной зоны.
 */

import type { Id } from '@/shared/types/document';
import { getDB as db } from './db';

export interface SyncState {
  projectId: Id;
  /** Владелец, за которым закреплена доска. Нет — доска ничья, локальная. */
  owner?: string;
  /** `updatedAt` версии, которая точно доехала до сервера. */
  remoteUpdatedAt?: number;
  /** Есть локальные правки, не уехавшие на сервер. */
  dirty: boolean;
  /** Опубликована ли доска по ссылке. Хранится здесь, чтобы выгрузка
   *  не ходила за флагом в сеть на каждый круг. */
  isPublic?: boolean;
}

export const readSyncState = async (projectId: Id): Promise<SyncState | undefined> =>
  (await db()).get('sync', projectId);

export const writeSyncState = async (state: SyncState): Promise<void> => {
  await (await db()).put('sync', state);
};

export const allSyncStates = async (): Promise<SyncState[]> => (await db()).getAll('sync');

export const forgetSyncState = async (projectId: Id): Promise<void> => {
  await (await db()).delete('sync', projectId);
};
