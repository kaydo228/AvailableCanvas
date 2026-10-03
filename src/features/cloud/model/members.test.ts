import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCloud } from './client';
import {
  acceptMyProjectInvites,
  changeMemberRole,
  inviteMember,
  listProjectAccess,
  removeMember,
} from './members';

const invoke = vi.fn(
  async (): Promise<{
    data: { status: string } | null;
    error: { name: string } | null;
  }> => ({ data: { status: 'invite-sent' }, error: null }),
);
const rpc = vi.fn(async (name: string) => {
  if (name === 'accept_my_project_invites') {
    return { data: [{ project_id: 'p1' }, { project_id: 'p2' }], error: null };
  }
  return {
    data: [
      {
        user_id: 'u2',
        email: 'friend@example.com',
        role: 'editor',
        created_at: '2026-09-18T10:00:00.000Z',
      },
    ],
    error: null,
  };
});
const invites = vi.fn(async () => ({
  data: [
    {
      id: 'i1',
      email: 'pending@example.com',
      role: 'viewer',
      created_at: '2026-09-18T11:00:00.000Z',
    },
  ],
  error: null,
}));
const changed = vi.fn(async () => ({ data: [{ user_id: 'u2' }], error: null }));

beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockResolvedValue({ data: { status: 'invite-sent' }, error: null });
  setCloud({
    functions: { invoke },
    rpc,
    from: () => ({
      select: () => ({ eq: invites }),
      update: () => ({ eq: () => ({ eq: () => ({ select: changed }) }) }),
      delete: () => ({ eq: () => ({ eq: () => ({ select: changed }) }) }),
    }),
  } as never);
});

describe('inviteMember', () => {
  it('calls the invitation function with the project, email and role', async () => {
    await expect(inviteMember('p1', 'new@example.com', 'viewer')).resolves.toEqual({
      ok: true,
      status: 'invite-sent',
    });
    expect(invoke).toHaveBeenCalledWith('invite-project-member', {
      body: { projectId: 'p1', email: 'new@example.com', role: 'viewer' },
    });
  });

  it('marks transport failures separately', async () => {
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError' } });

    await expect(inviteMember('p1', 'new@example.com', 'viewer')).resolves.toEqual({
      ok: false,
      error: 'Не удалось связаться с сервером',
      network: true,
    });
  });
});

describe('membership RPCs', () => {
  it('returns accepted project ids', async () => {
    await expect(acceptMyProjectInvites()).resolves.toEqual(['p1', 'p2']);
  });

  it('returns an empty list when no invites were accepted', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });

    await expect(acceptMyProjectInvites()).resolves.toEqual([]);
  });

  it('maps members and pending invites', async () => {
    await expect(listProjectAccess('p1')).resolves.toEqual({
      members: [
        {
          userId: 'u2',
          email: 'friend@example.com',
          role: 'editor',
          createdAt: '2026-09-18T10:00:00.000Z',
        },
      ],
      invites: [
        {
          id: 'i1',
          email: 'pending@example.com',
          role: 'viewer',
          createdAt: '2026-09-18T11:00:00.000Z',
        },
      ],
    });
  });

  it('updates and removes an existing member', async () => {
    await expect(changeMemberRole('p1', 'u2', 'viewer')).resolves.toBe(true);
    await expect(removeMember('p1', 'u2')).resolves.toBe(true);
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
