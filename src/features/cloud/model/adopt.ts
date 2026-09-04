/**
 * Перенос локальных досок в аккаунт.
 *
 * Молча забирать их нельзя: вход на чужом компьютере утащил бы чужие доски
 * в свой аккаунт. Поэтому один явный вопрос — и запомненный ответ, чтобы
 * не спрашивать при каждом входе.
 */

import { writeSyncState } from '@/features/persistence/syncStore';
import type { Id } from '@/shared/types/document';

import type { LocalBoard } from './merge';

/** Доски, которые никому не принадлежат и от которых ещё не отказались. */
export const adoptable = (local: LocalBoard[]): Id[] =>
  local
    .filter((board) => board.state?.owner === undefined && board.state?.declined !== true)
    .map((board) => board.projectId);

export const adoptBoards = async (ids: Id[], owner: string): Promise<void> => {
  for (const projectId of ids) {
    await writeSyncState({ projectId, owner, dirty: true });
  }
};

export const declineAdoption = async (ids: Id[]): Promise<void> => {
  for (const projectId of ids) {
    await writeSyncState({ projectId, dirty: false, declined: true });
  }
};
