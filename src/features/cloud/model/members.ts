import type { Id } from '@/shared/types/document';

import type { MemberRole } from './access';
import { getCloud } from './client';

export interface MemberEntry {
  userId: string;
  email: string;
  role: MemberRole;
  createdAt: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: MemberRole;
  createdAt: string;
}

export type InviteResult =
  | { ok: true; status: 'member-added' | 'invite-sent' }
  | { ok: false; error: string; network: boolean };

const isRole = (role: unknown): role is MemberRole => role === 'editor' || role === 'viewer';

export const inviteMember = async (
  projectId: Id,
  email: string,
  role: MemberRole,
): Promise<InviteResult> => {
  const cloud = getCloud();
  if (!cloud) return { ok: false, error: 'Синхронизация не настроена', network: true };

  const { data, error } = await cloud.functions.invoke('invite-project-member', {
    body: { projectId, email, role },
  });
  if (!error && (data?.status === 'member-added' || data?.status === 'invite-sent')) {
    return { ok: true, status: data.status };
  }

  const network = error?.name === 'FunctionsFetchError' || error?.name === 'FunctionsRelayError';
  let message = typeof data?.error === 'string' ? data.error : undefined;
  const context = (error as { context?: unknown } | null)?.context;
  if (!message && context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: unknown };
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // Не-JSON ответ функции не показываем как HTML/сырой текст.
    }
  }
  return {
    ok: false,
    error: message ?? (network ? 'Не удалось связаться с сервером' : 'Не удалось пригласить'),
    network,
  };
};

export const acceptMyProjectInvites = async (): Promise<Id[]> => {
  const cloud = getCloud();
  if (!cloud) return [];
  const { data, error } = await cloud.rpc('accept_my_project_invites');
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((row) => (typeof row.project_id === 'string' ? [row.project_id] : []));
};

export const listProjectAccess = async (
  projectId: Id,
): Promise<{ members: MemberEntry[]; invites: PendingInvite[] } | null> => {
  const cloud = getCloud();
  if (!cloud) return null;

  const [memberRows, inviteRows] = await Promise.all([
    cloud.rpc('list_project_members', { p_project_id: projectId }),
    cloud.from('project_invites').select('id, email, role, created_at').eq('project_id', projectId),
  ]);
  if (memberRows.error || inviteRows.error || !memberRows.data || !inviteRows.data) return null;

  return {
    members: memberRows.data.flatMap(
      (row: { user_id: unknown; email: unknown; role: unknown; created_at: unknown }) =>
        isRole(row.role)
          ? [
              {
                userId: row.user_id as string,
                email: row.email as string,
                role: row.role,
                createdAt: row.created_at as string,
              },
            ]
          : [],
    ),
    invites: inviteRows.data.flatMap((row) =>
      isRole(row.role)
        ? [
            {
              id: row.id as string,
              email: row.email as string,
              role: row.role,
              createdAt: row.created_at as string,
            },
          ]
        : [],
    ),
  };
};

export const changeMemberRole = async (
  projectId: Id,
  userId: string,
  role: MemberRole,
): Promise<boolean> => {
  const cloud = getCloud();
  if (!cloud) return false;
  const { data, error } = await cloud
    .from('project_members')
    .update({ role })
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .select('user_id');
  return !error && data?.length === 1;
};

export const removeMember = async (projectId: Id, userId: string): Promise<boolean> => {
  const cloud = getCloud();
  if (!cloud) return false;
  const { data, error } = await cloud
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .select('user_id');
  return !error && data?.length === 1;
};
