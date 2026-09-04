/**
 * Вопрос про локальные доски при первом входе (задача 9 плана cloud-sync).
 *
 * Показывается ровно один раз: `useCloudSyncOnLogin` открывает его, только
 * когда `adoptable(...)` не пуст. Первый круг синхронизации при входе диалог
 * не ждёт (см. комментарий в `useCloudSyncOnLogin.ts` — почему), поэтому
 * ответ здесь сам запускает ещё один круг: без него закреплённая доска
 * дождалась бы выгрузки только следующего входа. Оба ответа закрывают вопрос
 * навсегда: «Перенести» зовёт `adoptBoards`, «Оставить локальными» —
 * `declineAdoption`, оба пишут `sync`-запись, которую `adoptable` при
 * следующем входе больше не найдёт.
 *
 * Классы — те же, что у `ProjectDialogs`/`AuthDialog`: новых стилей на один
 * диалог не заводим.
 */

import { Dialog } from 'radix-ui';
import { useState } from 'react';

import { adoptBoards, declineAdoption } from '../model/adopt';
import { runSyncCycle, useAdoptQuestion } from '../model/useCloudSyncOnLogin';

const OVERLAY = 'fixed inset-0 z-40 bg-scrim backdrop-blur-[1px]';
const CONTENT =
  'fixed left-1/2 top-1/2 z-50 w-[min(27rem,calc(100vw-2rem))] -translate-x-1/2 ' +
  '-translate-y-1/2 rounded-lg border border-rule bg-sheet p-6 shadow-pop focus:outline-none';
const TITLE = 'text-[0.9375rem] font-semibold tracking-tight text-ink';
const DESCRIPTION = 'mt-2 text-sm leading-relaxed text-pencil';
const FOOTER = 'mt-7 flex justify-end gap-2';

const BTN =
  'rounded-md px-4 py-2 text-sm font-medium transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50';
const BTN_GHOST = `${BTN} text-pencil hover:bg-well hover:text-ink`;
const BTN_PRIMARY = `${BTN} bg-accent text-accent-ink hover:bg-accent-hover`;

/**
 * Текст диалога зависит только от числа единственное/множественное — полное
 * русское склонение числительных (1 / 2-4 / 5+) здесь избыточно: N — это
 * штучные доски одного человека, а не список на сотни строк.
 */
const describe = (count: number): string =>
  count === 1
    ? `На этом устройстве 1 доска, не привязанная ни к какому аккаунту. Перенести её`
    : `На этом устройстве ${count} досок, не привязанных ни к какому аккаунту. Перенести их`;

export function AdoptDialog() {
  const question = useAdoptQuestion((s) => s.question);
  const closeQuestion = useAdoptQuestion((s) => s.close);
  const [busy, setBusy] = useState(false);

  if (!question) return null;
  const { ids, owner, email } = question;

  // Оба ответа делают одно и то же после своего действия: закрывают вопрос
  // и наконец запускают круг, отложенный ради него.
  const answer = (write: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    void write().then(() => {
      closeQuestion();
      void runSyncCycle(owner);
    });
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && answer(() => declineAdoption(ids))}>
      <Dialog.Portal>
        <Dialog.Overlay className={OVERLAY} />
        <Dialog.Content className={CONTENT}>
          <Dialog.Title className={TITLE}>Перенести доски в аккаунт?</Dialog.Title>
          <Dialog.Description className={DESCRIPTION}>
            {describe(ids.length)} в {email}?
          </Dialog.Description>

          <div className={FOOTER}>
            <button
              type="button"
              className={BTN_GHOST}
              disabled={busy}
              onClick={() => answer(() => declineAdoption(ids))}
            >
              Оставить локальными
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy}
              onClick={() => answer(() => adoptBoards(ids, owner))}
            >
              Перенести
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
