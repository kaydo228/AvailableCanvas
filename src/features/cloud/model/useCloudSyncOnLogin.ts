/**
 * Круг синхронизации при входе — на уровне приложения, а не экрана холста.
 *
 * Кнопка «Войти» стоит в шапке списка проектов (`ProjectsHeader`), а не на
 * холсте: человек, вошедший на новом устройстве, первым делом видит список,
 * и именно там должны появиться его доски — без захода на каждую вручную.
 * Поэтому хук ставится в `Router` (см. `src/app/router.tsx`) и смонтирован
 * всегда, независимо от маршрута.
 *
 * `syncedFor` держит того, для кого круг уже запущен — защита от двойного
 * вызова эффекта в React 18 StrictMode (dev вызывает эффект без cleanup
 * дважды подряд на одном и том же значении зависимости). Но, в отличие от
 * `useCloudSync` на холсте, этот хук не размонтируется вместе с экраном —
 * значит, выход из аккаунта обязан сбрасывать `syncedFor` сам: без этого
 * повторный вход тем же человеком в той же вкладке не завёл бы второй круг
 * никогда.
 *
 * После круга — `bumpRevision()`. `overwriteProject`/`deleteProject` внутри
 * `syncNow` шлют `projects-changed` через `BroadcastChannel`, а он по
 * стандарту не доставляет сообщение своему же отправителю (см. комментарий
 * в `features/persistence/sync.ts`) — это межвкладочный канал, не внутривкла-
 * дочный. Экран списка перечитывает себя по `revision` из `useProjectDialogs`
 * (тот же приём, что и диалоги создания/переименования/удаления), поэтому
 * без явного bump список, открытый в момент входа, не увидел бы результат
 * этого же круга синхронизации до перезахода.
 *
 * Перенос локальных досок (задача 9): вопрос читается и, если есть что
 * предложить, открывается ПЕРЕД кругом синхронизации — круг для доски без
 * владельца всё равно решает `nothing` (см. `merge.ts`), так что первый
 * круг такую доску не трогает независимо от того, успел ли человек ответить.
 * Круг при входе НЕ ждёт ответа: `e2e/cloud-pull.spec.ts` держит инвариант
 * «один вход — один вызов `syncNow`», и блокировка круга диалогом без
 * гарантированного срока ответа сломала бы именно его. Вместо ожидания —
 * диалог сам вызывает `runSyncCycle` повторно после ответа: перенесённая
 * доска уезжает на сервер в тот же вход, вторым кругом, а не ждёт следующего.
 */

import { useEffect, useRef } from 'react';
import { create } from 'zustand';

import { useProjectDialogs } from '@/features/projects/dialogsStore';
import type { Id } from '@/shared/types/document';

import { adoptable } from './adopt';
import { connectRemoteImages } from './images';
import { localBoards, syncNow } from './pull';
import { useSession } from './session';

export interface AdoptQuestion {
  ids: Id[];
  owner: string;
  email: string;
}

interface AdoptQuestionState {
  /** null — вопрос не открыт. */
  question: AdoptQuestion | null;
  ask(question: AdoptQuestion): void;
  close(): void;
}

/**
 * Открытый вопрос «перенести доски» — крошечный стор, а не React state
 * внутри хука: хук ставится в `Router` и не рисует JSX, диалог смонтирован
 * рядом с ним отдельным компонентом (`AdoptDialog`), им обоим нужно общее
 * состояние.
 */
export const useAdoptQuestion = create<AdoptQuestionState>()((set) => ({
  question: null,
  ask: (question) => set({ question }),
  close: () => set({ question: null }),
}));

/**
 * Круг синхронизации плюс перечитывание списка проектов после него.
 * Экспортирован: `AdoptDialog` зовёт его же сам после ответа на вопрос —
 * круг был отложен ради него и должен наконец пройти.
 */
export const runSyncCycle = (owner: string): Promise<void> =>
  syncNow(owner).then(() => useProjectDialogs.getState().bumpRevision());

export const useCloudSyncOnLogin = (): void => {
  const userId = useSession((s) => s.userId);
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    // Фолбэк на картинки, которых нет локально: этот хук — единственное
    // место уровня приложения, которое всегда знает текущего userId, и он же
    // должен сбросить источник в null при выходе — иначе после логаута
    // хранилище продолжало бы ходить в сеть от имени уже вышедшего.
    connectRemoteImages(userId);

    if (!userId) {
      syncedFor.current = null;
      return;
    }
    if (syncedFor.current === userId) return;
    syncedFor.current = userId;

    void (async () => {
      const ids = adoptable(await localBoards());
      if (ids.length > 0) {
        // Диалог не блокирует круг ниже: он сам вызовет adoptBoards/declineAdoption
        // и следом ещё раз runSyncCycle, когда человек ответит.
        useAdoptQuestion
          .getState()
          .ask({ ids, owner: userId, email: useSession.getState().email ?? '' });
      }
      await runSyncCycle(userId);
    })();
  }, [userId]);
};
