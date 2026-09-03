/**
 * Что делать с каждой доской. Чистая функция: ни сети, ни базы, ни времени —
 * поэтому её можно прогнать таблицей случаев, а не ловить их руками.
 *
 * Правило конфликта простое и объявленное: побеждает версия с более поздним
 * `updatedAt`, целиком. Слияние по узлам здесь было бы догадкой о намерении.
 */

import type { SyncState } from '@/features/persistence/syncStore';
import type { Id } from '@/shared/types/document';

export interface LocalBoard {
  projectId: Id;
  updatedAt: number;
  state?: SyncState;
}

export interface RemoteBoard {
  id: Id;
  updatedAt: number;
}

export type Decision =
  | { kind: 'push'; projectId: Id }
  | { kind: 'pull'; projectId: Id }
  | { kind: 'delete-local'; projectId: Id }
  | { kind: 'nothing'; projectId: Id };

export function decide(local: LocalBoard[], remote: RemoteBoard[], owner: string): Decision[] {
  const remoteById = new Map(remote.map((board) => [board.id, board]));
  const decisions: Decision[] = [];

  for (const board of local) {
    const { projectId, state } = board;
    const mine = state?.owner === undefined || state.owner === owner;
    // Доска другого пользователя на этом же устройстве — не наша забота.
    if (!mine) {
      decisions.push({ kind: 'nothing', projectId });
      continue;
    }

    const twin = remoteById.get(projectId);
    if (twin) {
      remoteById.delete(projectId);
      if (board.updatedAt > twin.updatedAt) decisions.push({ kind: 'push', projectId });
      else if (board.updatedAt < twin.updatedAt) decisions.push({ kind: 'pull', projectId });
      else decisions.push({ kind: state?.dirty ? 'push' : 'nothing', projectId });
      continue;
    }

    // На сервере доски нет. Была ли она там когда-нибудь — вот весь вопрос.
    if (state?.remoteUpdatedAt !== undefined) {
      decisions.push({ kind: 'delete-local', projectId });
    } else if (state?.owner === owner) {
      decisions.push({ kind: 'push', projectId });
    } else {
      // Нарисована до входа и в аккаунт не переносилась — не трогаем.
      decisions.push({ kind: 'nothing', projectId });
    }
  }

  for (const board of remoteById.values()) {
    decisions.push({ kind: 'pull', projectId: board.id });
  }

  return decisions;
}
