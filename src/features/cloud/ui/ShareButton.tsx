/**
 * Кнопка «Поделиться» в шапке холста.
 *
 * Видна только когда есть кому делиться: облако настроено, человек вошёл,
 * и доска закреплена за ним на сервере (`SyncState.owner === userId`).
 * Доска, ни разу не уехавшая на сервер, ссылки иметь не может — `setPublic`
 * пишет `is_public` в уже существующую строку.
 *
 * `is_public` читаем и пишем только через `share.ts` — здесь не дублируем
 * проверку, её делает правило доступа в базе (см. шапку `share.ts`).
 */

import { Link2 } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { cloudEnabled } from '@/features/cloud/model/client';
import { useSession } from '@/features/cloud/model/session';
import { publicUrl, setPublic } from '@/features/cloud/model/share';
import { readSyncState } from '@/features/persistence/syncStore';
import type { Id } from '@/shared/types/document';

const BTN =
  'inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-pencil text-sm transition-colors ' +
  'hover:bg-well hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-accent disabled:opacity-50';
const CONTENT =
  'z-50 min-w-52 rounded-md border border-rule bg-sheet p-1 shadow-pop focus:outline-none';
const ITEM =
  'flex cursor-pointer select-none items-center rounded-sm px-2.5 py-2 text-sm text-ink ' +
  'outline-none data-[highlighted]:bg-well';

export function ShareButton({ projectId }: { projectId: Id }) {
  const userId = useSession((s) => s.userId);
  // undefined — ещё не прочитали sync-состояние; до этого момента ничего
  // не рисуем, иначе кнопка на кадр мигнёт тому, чья это не доска.
  const [owner, setOwner] = useState<string | undefined>();
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setOwner(undefined);
    void readSyncState(projectId).then((state) => {
      if (!alive) return;
      setOwner(state?.owner ?? '');
      setIsPublic(state?.isPublic ?? false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (!cloudEnabled() || !userId || owner !== userId) return null;

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl(projectId));
    toast.success('Ссылка скопирована');
  };

  const run = (what: () => Promise<boolean>, onOk: () => void, failMessage: string) => {
    if (busy) return;
    setBusy(true);
    void what()
      .then((ok) => {
        if (ok) onOk();
        else toast.error(failMessage);
      })
      .finally(() => setBusy(false));
  };

  const share = () =>
    run(
      () => setPublic(projectId, true),
      () => {
        setIsPublic(true);
        void copyLink();
      },
      'Не удалось открыть доступ',
    );

  const revoke = () =>
    run(
      () => setPublic(projectId, false),
      () => setIsPublic(false),
      'Не удалось закрыть доступ',
    );

  if (!isPublic) {
    return (
      <button type="button" disabled={busy} className={BTN} onClick={share}>
        <Link2 size={16} aria-hidden />
        Поделиться
      </button>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" disabled={busy} className={BTN}>
          <Link2 size={16} aria-hidden />
          Поделиться
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={CONTENT} sideOffset={6} align="start">
          <DropdownMenu.Item className={ITEM} onSelect={() => void copyLink()}>
            Скопировать ссылку
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM} onSelect={revoke}>
            Закрыть доступ
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
