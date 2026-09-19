import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InviteError,
  type InviteDependencies,
  inviteProjectMember,
} from './logic';

const deps = {
  actorId: 'owner-1',
  actorEmail: 'owner@example.com',
  isOwner: vi.fn(async () => true),
  lookupUser: vi.fn(async (): Promise<{ userId: string; confirmed: boolean } | null> => null),
  upsertMember: vi.fn(async () => undefined),
  upsertInvite: vi.fn(async () => ({ created: true })),
  deleteInvite: vi.fn(async () => undefined),
  sendInvite: vi.fn(async () => undefined),
} satisfies InviteDependencies;

beforeEach(() => {
  vi.clearAllMocks();
  deps.isOwner.mockResolvedValue(true);
  deps.lookupUser.mockResolvedValue(null);
  deps.upsertInvite.mockResolvedValue({ created: true });
  deps.sendInvite.mockResolvedValue(undefined);
});

describe('inviteProjectMember', () => {
  it('normalizes email and adds a confirmed account directly', async () => {
    deps.lookupUser.mockResolvedValue({ userId: 'member-1', confirmed: true });

    await expect(
      inviteProjectMember(
        { projectId: 'p1', email: ' USER@EXAMPLE.COM ', role: 'editor' },
        deps,
      ),
    ).resolves.toEqual({ status: 'member-added' });
    expect(deps.lookupUser).toHaveBeenCalledWith('user@example.com');
    expect(deps.upsertMember).toHaveBeenCalledWith('p1', 'member-1', 'editor');
    expect(deps.sendInvite).not.toHaveBeenCalled();
  });

  it('creates a pending invite for a new email and sends mail', async () => {
    await expect(
      inviteProjectMember({ projectId: 'p1', email: 'new@example.com', role: 'viewer' }, deps),
    ).resolves.toEqual({ status: 'invite-sent' });
    expect(deps.upsertInvite).toHaveBeenCalledWith('p1', 'new@example.com', 'viewer');
    expect(deps.sendInvite).toHaveBeenCalledWith('new@example.com', false);
  });

  it('updates an existing member role through the same upsert', async () => {
    deps.lookupUser.mockResolvedValue({ userId: 'member-1', confirmed: true });

    await inviteProjectMember(
      { projectId: 'p1', email: 'member@example.com', role: 'viewer' },
      deps,
    );

    expect(deps.upsertMember).toHaveBeenCalledWith('p1', 'member-1', 'viewer');
  });

  it('keeps an unconfirmed account pending and resends confirmation', async () => {
    deps.lookupUser.mockResolvedValue({ userId: 'member-1', confirmed: false });

    await expect(
      inviteProjectMember(
        { projectId: 'p1', email: 'member@example.com', role: 'editor' },
        deps,
      ),
    ).resolves.toEqual({ status: 'invite-sent' });
    expect(deps.upsertMember).not.toHaveBeenCalled();
    expect(deps.sendInvite).toHaveBeenCalledWith('member@example.com', true);
  });

  it('rejects a caller who is not the project owner', async () => {
    deps.isOwner.mockResolvedValue(false);

    await expect(
      inviteProjectMember({ projectId: 'p1', email: 'new@example.com', role: 'viewer' }, deps),
    ).rejects.toMatchObject({ status: 403 });
    expect(deps.lookupUser).not.toHaveBeenCalled();
  });

  it('rejects the owner email', async () => {
    await expect(
      inviteProjectMember(
        { projectId: 'p1', email: ' OWNER@EXAMPLE.COM ', role: 'editor' },
        deps,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    { email: 'not-an-email', role: 'editor' },
    { email: 'member@example.com', role: 'owner' },
  ])('rejects invalid input %#', async ({ email, role }) => {
    await expect(
      inviteProjectMember({ projectId: 'p1', email, role: role as never }, deps),
    ).rejects.toBeInstanceOf(InviteError);
    expect(deps.isOwner).not.toHaveBeenCalled();
  });

  it('removes a newly created pending invite when mail fails', async () => {
    deps.sendInvite.mockRejectedValue(new Error('mail is down'));

    await expect(
      inviteProjectMember({ projectId: 'p1', email: 'new@example.com', role: 'viewer' }, deps),
    ).rejects.toMatchObject({ status: 503 });
    expect(deps.deleteInvite).toHaveBeenCalledWith('p1', 'new@example.com');
  });

  it('does not delete a pre-existing pending invite when resend fails', async () => {
    deps.lookupUser.mockResolvedValue({ userId: 'member-1', confirmed: false });
    deps.upsertInvite.mockResolvedValue({ created: false });
    deps.sendInvite.mockRejectedValue(new Error('mail is down'));

    await expect(
      inviteProjectMember(
        { projectId: 'p1', email: 'member@example.com', role: 'editor' },
        deps,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(deps.deleteInvite).not.toHaveBeenCalled();
  });
});
