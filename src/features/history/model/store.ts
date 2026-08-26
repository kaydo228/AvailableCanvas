/**
 * Отмена и возврат (FR-10). Стек — zundo поверх общего стора, здесь только
 * то, чего у него нет: сохранение вида и привязка истории к проекту.
 */

import { useEffect } from 'react';

import { useBoardStore } from '@/shared/store/board';
import { dropPendingStep, holdHistory } from './temporal';

const history = () => useBoardStore.temporal.getState();

/**
 * Снимок истории не хранит вьюпорт (см. temporal.ts), поэтому после перемотки
 * его надо вернуть живым — иначе камера уезжает в начало координат.
 *
 * Эта запись сама шагом истории не становится: `sameContent` считает документы,
 * отличающиеся только видом, одинаковыми.
 */
const keepViewport = (rewind: () => void): void => {
  const viewport = useBoardStore.getState().document?.viewport;
  rewind();
  if (!viewport) return;
  useBoardStore.setState((state) => {
    if (state.document) state.document.viewport = viewport;
  });
};

export const undo = (): void => keepViewport(() => history().undo());
export const redo = (): void => keepViewport(() => history().redo());

export const canUndo = (): boolean => history().pastStates.length > 0;
export const canRedo = (): boolean => history().futureStates.length > 0;

/** История своя у каждого проекта: и на входе, и на выходе стек пуст. */
export const clearHistory = (): void => {
  dropPendingStep();
  history().clear();
};

/**
 * Привязывает историю к открытому проекту. Зовётся один раз с экрана холста.
 *
 * Подписка на стор, а не эффект по `projectId`: документ приезжает из IndexedDB
 * асинхронно, и чистить историю надо в момент подмены документа, а не рендера.
 */
export const useHistorySession = (): void => {
  useEffect(() => {
    const unsubscribe = useBoardStore.subscribe((state, previous) => {
      if (state.editingNodeId !== previous.editingNodeId) {
        holdHistory(state.editingNodeId !== null);
      }
      if (state.document?.projectId !== previous.document?.projectId) {
        clearHistory();
      }
    });

    return () => {
      unsubscribe();
      clearHistory();
    };
  }, []);
};
