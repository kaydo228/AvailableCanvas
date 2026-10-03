import { ArrowRight, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

import {
  acceptMyProjectInvites,
  runSyncCycle,
  setInvitePassword,
  useSession,
} from '@/features/cloud';

const INPUT =
  'mt-2 w-full rounded-md border border-rule-strong bg-paper px-3.5 py-3 text-sm text-ink ' +
  'outline-none transition-colors focus:border-accent focus:bg-sheet';
const BUTTON =
  'mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 ' +
  'text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export function InviteScreen() {
  const navigate = useNavigate();
  const ready = useSession((state) => state.ready);
  const userId = useSession((state) => state.userId);
  const email = useSession((state) => state.email);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <div className="min-h-screen bg-paper" />;

  if (!userId) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-5 py-12">
        <section className="w-full max-w-md rounded-xl border border-rule bg-sheet p-7 shadow-pop sm:p-9">
          <p className="text-accent text-xs uppercase tracking-[0.18em]">Доступ к проекту</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
            Ссылка недействительна или истекла
          </h1>
          <p className="mt-3 text-pencil text-sm leading-relaxed">
            Попросите владельца проекта отправить новое приглашение.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-ink underline underline-offset-4"
          >
            Вернуться к проектам
          </Link>
        </section>
      </main>
    );
  }

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const passwordError = await setInvitePassword(password);
    if (passwordError) {
      setError(passwordError);
      setBusy(false);
      return;
    }

    const projectIds = await acceptMyProjectInvites();
    await runSyncCycle(userId);
    toast.success('Приглашение принято');
    navigate(projectIds[0] ? `/p/${encodeURIComponent(projectIds[0])}` : '/', { replace: true });
  };

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5 py-12">
      <section className="relative w-full max-w-md overflow-hidden rounded-xl border border-rule bg-sheet p-7 shadow-pop sm:p-9">
        <div className="absolute inset-x-0 top-0 h-1 bg-accent" aria-hidden="true" />
        <KeyRound className="h-6 w-6 text-accent" aria-hidden="true" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">Принять приглашение</h1>
        <p className="mt-3 text-pencil text-sm leading-relaxed">
          Задайте пароль для аккаунта
          {email ? (
            <>
              {' '}
              <strong className="text-ink">{email}</strong>
            </>
          ) : null}
          . После этого общий проект появится в вашем списке.
        </p>

        <form
          className="mt-7"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="block text-sm font-medium text-pencil" htmlFor="invite-password">
            Новый пароль
          </label>
          <input
            id="invite-password"
            className={INPUT}
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="mt-2 text-faint text-xs">Минимум 6 символов</p>
          <p className="mt-3 min-h-5 text-signal text-sm" aria-live="polite">
            {error}
          </p>
          <button className={BUTTON} type="submit" disabled={busy}>
            {busy ? 'Принимаем…' : 'Принять и открыть проект'}
            {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        </form>
      </section>
    </main>
  );
}
