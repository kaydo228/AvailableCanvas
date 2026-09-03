/**
 * Когда выгружать доску на сервер.
 *
 * Свой дебаунс — 3000 мс, отдельно от автосохранения (у того 500 мс,
 * `AUTOSAVE_DELAY_MS`): складывать их в один нельзя, иначе выгрузка на каждый
 * штрих съест квоту бесплатного тарифа. Триггер — переход `useSaveStatus`
 * в `saved`: раньше в документе просто нет свежей версии, которую стоило бы
 * везти на сервер.
 *
 * Без входа хук ничего не делает: `pushProject` требует владельца.
 */

import { useEffect } from 'react';
import { useSaveStatus } from '@/features/persistence/autosave';
import type { Id } from '@/shared/types/document';

import { pushProject } from './push';
import { useSession } from './session';

/** Пауза после сохранения в IndexedDB, прежде чем везти доску на сервер. */
export const CLOUD_PUSH_DELAY_MS = 3000;

export const useCloudSync = (projectId: Id | undefined): void => {
  const userId = useSession((s) => s.userId);

  useEffect(() => {
    if (!projectId || !userId) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = useSaveStatus.subscribe((state, previous) => {
      if (state.status !== 'saved' || previous.status === 'saved') return;
      clearTimeout(timer);
      timer = setTimeout(() => void pushProject(projectId, userId), CLOUD_PUSH_DELAY_MS);
    });

    return () => {
      unsubscribe();
      if (timer !== undefined) {
        clearTimeout(timer);
        // Уход с холста внутри окна дебаунса не должен откладывать выгрузку
        // до следующего визита — последняя версия обязана уехать сразу.
        void pushProject(projectId, userId);
      }
    };
  }, [projectId, userId]);
};
