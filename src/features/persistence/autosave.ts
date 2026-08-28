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
 *
 * Сессия проекта (П3, П4 из docs/nightly/shell/01-план-починки.md). Вкладка
 * помнит `updatedAt`, с которым открыла проект, и отдаёт его каждой записи.
 * Разошлось — документ переписала другая вкладка, и писать поверх нельзя:
 * до этого последняя запись побеждала молча, а обе вкладки показывали
 * «Все изменения сохранены». Слияния здесь нет и не будет — сливать доски
 * автоматически хуже, чем честно сказать, что вкладка устарела.
 */

import { useEffect } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';

import { saveDocument } from '@/features/persistence/projectsRepo';
import { useBoardStore } from '@/shared/store/board';
import type { Id } from '@/shared/types/document';
import { subscribe } from './sync';

export type SaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'
  /** Документ переписан другой вкладкой — эта устарела. */
  | 'conflict'
  /** Проект удалён, писать некуда. */
  | 'deleted';

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
 * Что вкладка знает о проекте, который держит открытым.
 *
 * Модульная переменная, а не состояние React: её читает `flush` из таймера,
 * и она обязана быть свежей в момент записи, а не в момент рендера.
 */
let session: { projectId: Id; updatedAt: number } | null = null;

/**
 * Объявляет, с каким `updatedAt` вкладка открыла проект. Зовётся с экрана
 * холста сразу после чтения проекта из базы.
 */
export const beginSaveSession = (projectId: Id, updatedAt: number): void => {
  session = { projectId, updatedAt };
  useSaveStatus.getState().setStatus('idle');
};

export const endSaveSession = (): void => {
  session = null;
};

/** Устарела ли вкладка. В этих состояниях писать больше не пытаемся. */
const stale = (status: SaveStatus): boolean => status === 'conflict' || status === 'deleted';

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

    /** Сообщаем один раз на состояние: тост на каждую попытку записи — спам. */
    const announce = (status: 'conflict' | 'deleted') => {
      if (stale(useSaveStatus.getState().status)) return;
      setStatus(status);
      toast.error(
        status === 'conflict'
          ? 'Доска изменена в другой вкладке'
          : 'Проект удалён в другой вкладке',
        {
          description:
            status === 'conflict'
              ? 'Обновите страницу — иначе ваши правки не сохранятся.'
              : 'Сохранять больше некуда. Выгрузите доску через «Экспорт», если она нужна.',
          duration: Number.POSITIVE_INFINITY,
        },
      );
    };

    const flush = async () => {
      const document = useBoardStore.getState().document;
      if (!document) return;
      // Вкладка уже знает, что устарела: продолжать долбиться в базу незачем.
      if (stale(useSaveStatus.getState().status)) return;

      try {
        const outcome = await saveDocument(document, session?.updatedAt);
        if (outcome.ok) {
          if (session) session.updatedAt = outcome.updatedAt;
          setStatus('saved');
          return;
        }
        announce(outcome.reason);
      } catch (error) {
        setStatus('error');
        toast.error('Не удалось сохранить доску', {
          description: 'Проверьте, есть ли место на диске. Изменения пока только в этой вкладке.',
          // Отказ записи — это про потерю данных: тост не должен исчезнуть,
          // пока человек его не увидел.
          duration: Number.POSITIVE_INFINITY,
          id: 'autosave-error',
        });
        console.error('Не удалось сохранить доску', error);
      }
    };

    const unsubscribeStore = useBoardStore.subscribe((state, previous) => {
      const document = state.document;
      if (!document || document === previous.document) return;

      // Открытие проекта — это не правка. Без этой проверки каждый заход на
      // холст перезаписывал бы документ и двигал updatedAt, переставляя
      // проект в начало списка просто потому, что его открыли.
      const opened = !previous.document || previous.document.projectId !== document.projectId;
      if (opened) return;

      if (stale(useSaveStatus.getState().status)) return;

      setStatus('saving');
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    });

    // Чужая запись видна сразу, а не при следующей попытке сохранить: иначе
    // вкладка узнаёт о том, что устарела, только когда её правки уже потеряны.
    const unsubscribeTabs = subscribe((event) => {
      if (!session) return;
      if (event.kind === 'deleted' && event.projectId === session.projectId) {
        announce('deleted');
      }
      if (
        event.kind === 'saved' &&
        event.projectId === session.projectId &&
        event.updatedAt !== session.updatedAt
      ) {
        announce('conflict');
      }
    });

    return () => {
      unsubscribeStore();
      unsubscribeTabs();
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
