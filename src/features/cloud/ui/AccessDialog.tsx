import { Copy, Trash2, UserPlus, Users } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { MemberRole } from '@/features/cloud/model/access';
import {
  changeMemberRole,
  inviteMember,
  listProjectAccess,
  type MemberEntry,
  type PendingInvite,
  removeMember,
} from '@/features/cloud/model/members';
import { publicUrl, setPublic } from '@/features/cloud/model/share';
import type { Id } from '@/shared/types/document';

const OVERLAY = 'fixed inset-0 z-40 bg-scrim backdrop-blur-[1px]';
const CONTENT =
  'fixed left-1/2 top-1/2 z-50 max-h-[min(44rem,calc(100vh-2rem))] w-[min(38rem,calc(100vw-2rem))] ' +
  '-translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-rule bg-sheet p-6 shadow-pop ' +
  'focus:outline-none sm:p-7';
const INPUT =
  'min-h-10 rounded-md border border-rule-strong bg-paper px-3 text-sm text-ink outline-none ' +
  'transition-colors focus:border-accent focus:bg-sheet disabled:opacity-50';
const BUTTON =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium ' +
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY = `${BUTTON} bg-accent text-accent-ink hover:bg-accent-hover`;
const GHOST = `${BUTTON} text-pencil hover:bg-well hover:text-ink`;

interface AccessDialogProps {
  projectId: Id;
  isPublic: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function AccessDialog({ projectId, isPublic, open, onOpenChange }: AccessDialogProps) {
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('editor');
  const [error, setError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [publicBusy, setPublicBusy] = useState(false);
  const [publicEnabled, setPublicEnabled] = useState(isPublic);

  const refresh = useCallback(async () => {
    const access = await listProjectAccess(projectId);
    if (!access) return;
    setMembers(access.members);
    setInvites(access.invites);
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    setPublicEnabled(isPublic);
    void refresh();
  }, [isPublic, open, refresh]);

  const submitInvite = async () => {
    if (inviteBusy) return;
    setInviteBusy(true);
    setError(null);
    const result = await inviteMember(projectId, email, role);
    if (result.ok) {
      setEmail('');
      toast.success(result.status === 'invite-sent' ? 'Приглашение отправлено' : 'Доступ добавлен');
      await refresh();
    } else {
      setError(result.error);
      if (result.network) toast.error(result.error);
    }
    setInviteBusy(false);
  };

  const changeRole = async (member: MemberEntry, nextRole: MemberRole) => {
    setMemberBusy(member.userId);
    if (await changeMemberRole(projectId, member.userId, nextRole)) {
      toast.success('Роль обновлена');
      await refresh();
    } else toast.error('Не удалось изменить роль');
    setMemberBusy(null);
  };

  const remove = async (member: MemberEntry) => {
    setMemberBusy(member.userId);
    if (await removeMember(projectId, member.userId)) {
      toast.success('Участник удалён');
      await refresh();
    } else toast.error('Не удалось удалить участника');
    setMemberBusy(null);
  };

  const copyPublicLink = async () => {
    await navigator.clipboard.writeText(publicUrl(projectId));
    toast.success('Ссылка скопирована');
  };

  const changePublic = async (next: boolean) => {
    if (publicBusy) return;
    setPublicBusy(true);
    if (await setPublic(projectId, next)) {
      setPublicEnabled(next);
      if (next) await copyPublicLink();
      else toast.success('Публичный доступ закрыт');
    } else toast.error(next ? 'Не удалось открыть доступ' : 'Не удалось закрыть доступ');
    setPublicBusy(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={OVERLAY} />
        <Dialog.Content className={CONTENT}>
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-well text-accent">
              <Users className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <Dialog.Title className="font-semibold text-base text-ink tracking-tight">
                Доступ к проекту
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-pencil text-sm">
                Приглашайте по почте и назначайте права участникам.
              </Dialog.Description>
            </div>
          </div>

          <form
            className="mt-6 grid gap-3 rounded-lg border border-rule bg-paper p-4 sm:grid-cols-[1fr_10rem_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void submitInvite();
            }}
          >
            <label className="grid gap-1.5 text-pencil text-xs" htmlFor="access-email">
              Почта
              <input
                id="access-email"
                className={INPUT}
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-pencil text-xs" htmlFor="access-role">
              Роль
              <select
                id="access-role"
                className={INPUT}
                value={role}
                onChange={(event) => setRole(event.target.value as MemberRole)}
              >
                <option value="editor">Редактор</option>
                <option value="viewer">Только просмотр</option>
              </select>
            </label>
            <button className={`${PRIMARY} self-end`} type="submit" disabled={inviteBusy}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Пригласить
            </button>
            {error && (
              <p className="text-signal text-sm sm:col-span-3" aria-live="polite">
                {error}
              </p>
            )}
          </form>

          <section className="mt-7" aria-labelledby="access-members-title">
            <h2 id="access-members-title" className="font-medium text-ink text-sm">
              Участники
            </h2>
            <div className="mt-2 divide-y divide-rule rounded-lg border border-rule">
              {members.length === 0 && (
                <p className="px-4 py-3 text-faint text-sm">Пока никого нет</p>
              )}
              {members.map((member) => (
                <div key={member.userId} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-ink text-sm">{member.email}</span>
                  <select
                    aria-label={`Роль для ${member.email}`}
                    className={`${INPUT} min-h-9`}
                    value={member.role}
                    disabled={memberBusy === member.userId}
                    onChange={(event) => void changeRole(member, event.target.value as MemberRole)}
                  >
                    <option value="editor">Редактор</option>
                    <option value="viewer">Только просмотр</option>
                  </select>
                  <button
                    type="button"
                    className={`${GHOST} min-h-9 px-2.5 text-signal`}
                    aria-label={`Удалить ${member.email}`}
                    disabled={memberBusy === member.userId}
                    onClick={() => void remove(member)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {invites.length > 0 && (
            <section className="mt-5" aria-labelledby="access-pending-title">
              <h2 id="access-pending-title" className="font-medium text-ink text-sm">
                Ожидают подтверждения
              </h2>
              <div className="mt-2 divide-y divide-rule rounded-lg border border-rule">
                {invites.map((invite) => (
                  <div key={invite.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-pencil">{invite.email}</span>
                    <span className="text-faint">
                      {invite.role === 'editor' ? 'Редактор' : 'Только просмотр'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mt-7 border-rule border-t pt-5" aria-labelledby="access-public-title">
            <h2 id="access-public-title" className="font-medium text-ink text-sm">
              Публичная ссылка
            </h2>
            <p className="mt-1 text-faint text-xs leading-relaxed">
              Любой, у кого есть ссылка, сможет посмотреть проект без регистрации.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {publicEnabled ? (
                <>
                  <button type="button" className={GHOST} onClick={() => void copyPublicLink()}>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Скопировать публичную ссылку
                  </button>
                  <button
                    type="button"
                    className={`${GHOST} text-signal`}
                    disabled={publicBusy}
                    onClick={() => void changePublic(false)}
                  >
                    Закрыть публичный доступ
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={GHOST}
                  disabled={publicBusy}
                  onClick={() => void changePublic(true)}
                >
                  Открыть публичный доступ
                </button>
              )}
            </div>
          </section>

          <div className="mt-7 flex justify-end">
            <Dialog.Close className={GHOST}>Готово</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
