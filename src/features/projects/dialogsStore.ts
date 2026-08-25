/**
 * Шов между тремя частями экрана проектов.
 *
 * Кнопку «Создать проект» жмут из шапки и из пустого состояния, пункты
 * «переименовать / дублировать / удалить» — из карточки, а рисует диалоги
 * отдельный модуль. Прокидывать колбэки через три слоя не хочется, поэтому
 * намерение лежит в сторе: кто угодно открывает, диалоги слушают.
 */

import { create } from 'zustand';

import type { Id } from '@/shared/types/document';

export type ProjectDialog = 'create' | 'rename' | 'duplicate' | 'delete';

interface DialogsState {
  /** null — ни один диалог не открыт. */
  kind: ProjectDialog | null;
  /** Проект, к которому относится диалог. У 'create' его нет. */
  projectId: Id | null;

  openCreate(): void;
  openRename(projectId: Id): void;
  openDuplicate(projectId: Id): void;
  openDelete(projectId: Id): void;
  close(): void;

  /**
   * Счётчик успешных изменений данных. Диалоги увеличивают его после записи
   * в IndexedDB, список перечитывает себя при смене значения. Без этого
   * переименование не видно, пока не перезагрузишь страницу.
   */
  revision: number;
  bumpRevision(): void;
}

export const useProjectDialogs = create<DialogsState>()((set) => ({
  kind: null,
  projectId: null,

  openCreate: () => set({ kind: 'create', projectId: null }),
  openRename: (projectId) => set({ kind: 'rename', projectId }),
  openDuplicate: (projectId) => set({ kind: 'duplicate', projectId }),
  openDelete: (projectId) => set({ kind: 'delete', projectId }),
  close: () => set({ kind: null, projectId: null }),

  revision: 0,
  bumpRevision: () => set((state) => ({ revision: state.revision + 1 })),
}));
