export type InviteRole = 'editor' | 'viewer';

export interface InviteInput {
  projectId: string;
  email: string;
  role: InviteRole;
}

export type InviteOutcome = { status: 'member-added' | 'invite-sent' };

export interface InviteDependencies {
  actorId: string;
  actorEmail: string;
  isOwner(projectId: string, actorId: string): Promise<boolean>;
  lookupUser(email: string): Promise<{ userId: string; confirmed: boolean } | null>;
  upsertMember(projectId: string, userId: string, role: InviteRole): Promise<void>;
  upsertInvite(
    projectId: string,
    email: string,
    role: InviteRole,
  ): Promise<{ created: boolean }>;
  deleteInvite(projectId: string, email: string): Promise<void>;
  sendInvite(email: string, resend: boolean): Promise<void>;
}

export class InviteError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 503,
    message: string,
  ) {
    super(message);
    this.name = 'InviteError';
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set<InviteRole>(['editor', 'viewer']);

export async function inviteProjectMember(
  input: InviteInput,
  deps: InviteDependencies,
): Promise<InviteOutcome> {
  const projectId = input.projectId.trim();
  const email = input.email.trim().toLowerCase();
  if (!projectId || !EMAIL.test(email) || !ROLES.has(input.role)) {
    throw new InviteError(400, 'Проверьте email и выбранную роль');
  }

  if (!(await deps.isOwner(projectId, deps.actorId))) {
    throw new InviteError(403, 'Только владелец проекта может приглашать участников');
  }
  if (email === deps.actorEmail.trim().toLowerCase()) {
    throw new InviteError(400, 'Вы уже владелец этого проекта');
  }

  const account = await deps.lookupUser(email);
  if (account?.confirmed) {
    await deps.upsertMember(projectId, account.userId, input.role);
    return { status: 'member-added' };
  }

  const pending = await deps.upsertInvite(projectId, email, input.role);
  try {
    await deps.sendInvite(email, account !== null);
  } catch {
    if (pending.created) {
      try {
        await deps.deleteInvite(projectId, email);
      } catch {
        // Ошибка отката не должна раскрывать детали базы вместо ошибки почты.
      }
    }
    throw new InviteError(503, 'Не удалось отправить письмо. Попробуйте ещё раз позже');
  }

  return { status: 'invite-sent' };
}
