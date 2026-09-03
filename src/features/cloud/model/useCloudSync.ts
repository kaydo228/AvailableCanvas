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
 *
 * Отдельно от выгрузки — круг слияния при входе (`syncNow`): появился
 * `userId`, значит стоит сверить локальный список досок со списком на
 * сервере. `syncedFor` держит того, для кого круг уже запущен, и не пускает
 * второй: React 18 StrictMode в dev нарочно вызывает эффект без cleanup дважды
 * подряд на одном и том же значении зависимости, а повторный вход тем же
 * пользователем не должен второй раз пробегать по всем доскам.
 */

import { useEffect, useRef } from 'react';
import { useSaveStatus } from '@/features/persistence/autosave';
import type { Id } from '@/shared/types/document';

import { syncNow } from './pull';
import { pushProject } from './push';
import { useSession } from './session';

/** Пауза после сохранения в IndexedDB, прежде чем везти доску на сервер. */
export const CLOUD_PUSH_DELAY_MS = 3000;

export const useCloudSync = (projectId: Id | undefined): void => {
  const userId = useSession((s) => s.userId);

  const syncedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || syncedFor.current === userId) return;
    syncedFor.current = userId;
    void syncNow(userId);
  }, [userId]);

  useEffect(() => {
    if (!projectId || !userId) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = useSaveStatus.subscribe((state, previous) => {
      if (state.status !== 'saved' || previous.status === 'saved') return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Обнуляем до вызова: иначе cleanup ниже не отличит «таймер уже
        // сработал» от «ещё висит» и после каждой ушедшей выгрузки будет
        // слать лишнюю при любом следующем уходе с холста.
        timer = undefined;
        void pushProject(projectId, userId);
      }, CLOUD_PUSH_DELAY_MS);
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
