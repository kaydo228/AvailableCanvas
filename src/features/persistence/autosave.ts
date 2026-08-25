/**
 * Автосохранение доски (FR-11, NFR-03).
 *
 * Дебаунс 500 мс после последнего изменения. Вьюпорт отдельно сохранять не надо:
 * он лежит внутри `document.viewport`, и панорамирование с зумом пишут его туда
 * же — сохраняя документ, мы сохраняем и положение вида.
 *
 * NFR-03: ввод не должен подвисать. Дебаунс гарантирует, что во время набора
 * записи не происходит вовсе, а сама запись — один `put` без предварительного
 * клонирования документа: `idb` сериализует его сам, копировать дважды незачем.
 */

import { useEffect } from 'react';
import { create } from 'zustand';

import { saveDocument } from '@/features/persistence/projectsRepo';
import { useBoardStore } from '@/shared/store/board';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveState {
  status: SaveStatus;
  setStatus(status: SaveStatus): void;
}

export const useSaveStatus = create<SaveState>()((set) => ({
  status: 'idle',
  setStatus: (status) => set({ status }),
}));

/** Пауза после последнего изменения, ТЗ FR-11. */
export const AUTOSAVE_DELAY_MS = 500;

/**
 * Вешает автосохранение на текущий документ. Зовётся один раз с экрана холста.
 *
 * Возврат из хука не нужен: состояние индикатора читается через `useSaveStatus`,
 * иначе каждый рендер холста тянул бы за собой перерисовку индикатора.
 */
export const useAutosave = (): void => {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const setStatus = useSaveStatus.getState().setStatus;

    const flush = async () => {
      const document = useBoardStore.getState().document;
      if (!document) return;
      try {
        await saveDocument(document);
        setStatus('saved');
      } catch (error) {
        setStatus('error');
        console.error('Не удалось сохранить доску', error);
      }
    };

    const unsubscribe = useBoardStore.subscribe((state, previous) => {
      const document = state.document;
      if (!document || document === previous.document) return;

      // Открытие проекта — это не правка. Без этой проверки каждый заход на
      // холст перезаписывал бы документ и двигал updatedAt, переставляя
      // проект в начало списка просто потому, что его открыли.
      const opened = !previous.document || previous.document.projectId !== document.projectId;
      if (opened) return;

      setStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      // Уход с холста внутри окна дебаунса потерял бы последние правки,
      // поэтому дописываем немедленно.
      if (timer !== undefined) {
        clearTimeout(timer);
        void flush();
      }
      useSaveStatus.getState().setStatus('idle');
    };
  }, []);
};
