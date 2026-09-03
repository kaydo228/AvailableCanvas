/**
 * Кто вошёл, в шапке списка проектов.
 *
 * Без переменных окружения `cloudEnabled()` ложно, и компонент не рисует
 * ничего — приложение остаётся полностью локальным, каким и было до
 * синхронизации (см. constraints.md, критерий 12 ТЗ).
 */

import { useState } from 'react';

import { cloudEnabled } from '@/features/cloud/model/client';
import { signOut, useSession } from '@/features/cloud/model/session';
import { AuthDialog } from '@/features/cloud/ui/AuthDialog';

const BTN =
  'rounded-md px-3.5 py-2 text-sm font-medium text-pencil transition-colors ' +
  'hover:bg-well hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-accent';

export function AccountMenu() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const email = useSession((s) => s.email);
  const ready = useSession((s) => s.ready);

  if (!cloudEnabled()) return null;
  // До первого ответа auth.getSession() ещё не знаем, вошли или нет —
  // кнопка «Войти» на мгновение мигнула бы тому, кто уже вошёл.
  if (!ready) return null;

  if (email) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-faint text-micro sm:inline">{email}</span>
        <button type="button" className={BTN} onClick={() => void signOut()}>
          Выйти
        </button>
      </div>
    );
  }

  return (
    <>
      <button type="button" className={BTN} onClick={() => setDialogOpen(true)}>
        Войти
      </button>
      <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
