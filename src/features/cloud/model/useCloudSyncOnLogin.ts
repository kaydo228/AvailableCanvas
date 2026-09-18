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
 *
 * Два круга ОБЯЗАНЫ идти по очереди, не параллельно: `AdoptQuestion.cycle` —
 * промис первого круга, положенный в вопрос при его открытии. Диалог
 * дожидается именно его, прежде чем начать второй (см. `AdoptDialog.tsx`).
 * Без этого — раунд правок 1: на медленной сети человек успевает ответить
 * раньше, чем первый круг вообще дочитает список локальных досок, запись
 * владельца попадает в его снимок, и оба круга независимо решают выгружать
 * одну и ту же доску — двойной `upsert` и повторная выгрузка картинок.
 * `upsert` идемпотентен и данные это не портит, но круги обязаны быть
 * сериализованы, а не полагаться на удачное совпадение по времени.
 */

import { useEffect, useRef } from 'react';
import { create } from 'zustand';

import { useProjectDialogs } from '@/features/projects/dialogsStore';
import type { Id } from '@/shared/types/document';

import { adoptable } from './adopt';
import { localBoards, syncNow } from './pull';
import { useSession } from './session';

export interface AdoptQuestion {
  ids: Id[];
  owner: string;
  email: string;
  /** Промис первого круга — второй круг (в `AdoptDialog`) обязан его дождаться. */
  cycle: Promise<void>;
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
    if (!userId) {
      syncedFor.current = null;
      return;
    }
    if (syncedFor.current === userId) return;
    syncedFor.current = userId;

    void (async () => {
      const ids = adoptable(await localBoards());
      // Круг стартует независимо от того, есть ли вопрос — считать его
      // здесь, а не внутри `if`, чтобы промис существовал ДО того, как
      // диалог (если он появится) сможет на него подписаться.
      const cycle = runSyncCycle(userId);
      if (ids.length > 0) {
        // Диалог не блокирует круг выше: он сам вызовет adoptBoards/declineAdoption
        // и следом дождётся `cycle`, прежде чем запустить второй runSyncCycle —
        // круги идут по очереди, не параллельно (раунд правок 1).
        useAdoptQuestion.getState().ask({
          ids,
          owner: userId,
          email: useSession.getState().email ?? '',
          cycle,
        });
      }
      await cycle;
    })();
  }, [userId]);
};
