/**
 * Форма входа и регистрации, radix `Dialog`. Классы — те же, что у
 * `features/projects/dialogs/ProjectDialogs.tsx`: новых стилей на один
 * диалог не заводим.
 *
 * Один компонент на оба режима: переключатель «Вход / Регистрация» меняет
 * только заголовок, подпись формы и то, какую функцию слайса вызвать —
 * поля и обработка ошибок одни и те же.
 */

import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { toast } from 'sonner';

import { signIn, signUp } from '@/features/cloud/model/session';

const OVERLAY = 'fixed inset-0 z-40 bg-scrim backdrop-blur-[1px]';
const CONTENT =
  'fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 ' +
  '-translate-y-1/2 rounded-lg border border-rule bg-sheet p-6 shadow-pop focus:outline-none';
const TITLE = 'text-[0.9375rem] font-semibold tracking-tight text-ink';
const DESCRIPTION = 'mt-2 text-sm leading-relaxed text-pencil';
const FOOTER = 'mt-7 flex items-center justify-between gap-2';
const LABEL = 'mt-4 block text-sm text-pencil';
const INPUT =
  'mt-1.5 w-full rounded-md border border-rule-strong bg-paper px-3 py-2 text-sm text-ink ' +
  'outline-none transition-colors focus:border-accent focus:bg-sheet';

const BTN =
  'rounded-md px-4 py-2 text-sm font-medium transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50';
const BTN_GHOST = `${BTN} text-pencil hover:bg-well hover:text-ink`;
const BTN_PRIMARY = `${BTN} bg-accent text-accent-ink hover:bg-accent-hover`;
const BTN_LINK = 'text-sm text-pencil underline underline-offset-2 hover:text-ink';

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMode('signIn');
    setEmail('');
    setPassword('');
    setError(null);
    setBusy(false);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result =
      mode === 'signIn' ? await signIn(email, password) : await signUp(email, password);
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    onOpenChange(false);
    reset();
    if (mode === 'signIn') toast.success('Вход выполнен');
    else if (result.needsConfirmation) {
      toast.success('Проверьте почту и перейдите по ссылке — затем вы войдёте автоматически.');
    } else toast.success('Регистрация завершена');
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={OVERLAY} />
        <Dialog.Content className={CONTENT}>
          <Dialog.Title className={TITLE}>
            {mode === 'signIn' ? 'Вход' : 'Регистрация'}
          </Dialog.Title>
          <Dialog.Description className={DESCRIPTION}>
            {mode === 'signIn'
              ? 'Доски синхронизируются между устройствами после входа.'
              : 'Новый аккаунт для синхронизации досок между устройствами.'}
          </Dialog.Description>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (busy) return;
              void submit();
            }}
          >
            <label className={LABEL} htmlFor="cloud-auth-email">
              Почта
              <input
                id="cloud-auth-email"
                className={INPUT}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className={LABEL} htmlFor="cloud-auth-password">
              Пароль
              <input
                id="cloud-auth-password"
                className={INPUT}
                type="password"
                required
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {error && <p className="mt-3 text-signal text-sm">{error}</p>}

            <div className={FOOTER}>
              <button
                type="button"
                className={BTN_LINK}
                onClick={() => {
                  setMode(mode === 'signIn' ? 'signUp' : 'signIn');
                  setError(null);
                }}
              >
                {mode === 'signIn' ? 'Ещё нет аккаунта? Регистрация' : 'Уже есть аккаунт? Вход'}
              </button>
              <div className="flex gap-2">
                <button type="button" className={BTN_GHOST} onClick={() => onOpenChange(false)}>
                  Отмена
                </button>
                <button type="submit" className={BTN_PRIMARY} disabled={busy}>
                  {mode === 'signIn' ? 'Войти' : 'Зарегистрироваться'}
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
