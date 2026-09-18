import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessDialog } from './AccessDialog';
import { ShareButton } from './ShareButton';

const api = vi.hoisted(() => ({
  inviteMember: vi.fn(
    async (): Promise<
      | { ok: true; status: 'member-added' | 'invite-sent' }
      | { ok: false; error: string; network: boolean }
    > => ({ ok: true, status: 'invite-sent' }),
  ),
  listProjectAccess: vi.fn(async () => ({
    members: [
      {
        userId: 'u2',
        email: 'friend@example.com',
        role: 'editor' as const,
        createdAt: '2026-09-18T10:00:00.000Z',
      },
    ],
    invites: [
      {
        id: 'i1',
        email: 'pending@example.com',
        role: 'viewer' as const,
        createdAt: '2026-09-18T11:00:00.000Z',
      },
    ],
  })),
  changeMemberRole: vi.fn(async () => true),
  removeMember: vi.fn(async () => true),
  setPublic: vi.fn(async () => true),
  publicUrl: vi.fn(() => 'https://example.test/s/p1'),
}));

const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/features/cloud/model/members', () => ({
  inviteMember: api.inviteMember,
  listProjectAccess: api.listProjectAccess,
  changeMemberRole: api.changeMemberRole,
  removeMember: api.removeMember,
}));
vi.mock('@/features/cloud/model/share', () => ({
  setPublic: api.setPublic,
  publicUrl: api.publicUrl,
}));
vi.mock('sonner', () => ({ toast: notifications }));

const clipboard = { writeText: vi.fn(async () => undefined) };

beforeEach(() => {
  vi.clearAllMocks();
  api.inviteMember.mockResolvedValue({ ok: true, status: 'invite-sent' });
  api.changeMemberRole.mockResolvedValue(true);
  api.removeMember.mockResolvedValue(true);
  api.setPublic.mockResolvedValue(true);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
});

afterEach(cleanup);

const openDialog = (isPublic = false) =>
  render(<AccessDialog projectId="p1" isPublic={isPublic} open={true} onOpenChange={vi.fn()} />);

describe('AccessDialog', () => {
  it('invites a viewer, refreshes the list and clears the email', async () => {
    openDialog();
    const email = await screen.findByLabelText('Почта');
    fireEvent.change(email, { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Роль'), { target: { value: 'viewer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Пригласить' }));

    await waitFor(() => {
      expect(api.inviteMember).toHaveBeenCalledWith('p1', 'new@example.com', 'viewer');
    });
    expect(notifications.success).toHaveBeenCalledWith('Приглашение отправлено');
    expect((email as HTMLInputElement).value).toBe('');
    expect(api.listProjectAccess).toHaveBeenCalledTimes(2);
  });

  it('shows pending invites and supports role change and removal', async () => {
    openDialog();
    await screen.findByText('pending@example.com');

    fireEvent.change(screen.getByLabelText('Роль для friend@example.com'), {
      target: { value: 'viewer' },
    });
    await waitFor(() => {
      expect(api.changeMemberRole).toHaveBeenCalledWith('p1', 'u2', 'viewer');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Удалить friend@example.com' }));
    await waitFor(() => {
      expect(api.removeMember).toHaveBeenCalledWith('p1', 'u2');
    });
  });

  it('keeps validation errors inline and leaves the form filled', async () => {
    api.inviteMember.mockResolvedValue({
      ok: false,
      error: 'Проверьте email и выбранную роль',
      network: false,
    });
    openDialog();
    const email = await screen.findByLabelText('Почта');
    fireEvent.change(email, { target: { value: 'bad@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Пригласить' }));

    await screen.findByText('Проверьте email и выбранную роль');
    expect((email as HTMLInputElement).value).toBe('bad@example.com');
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('also toasts a network failure', async () => {
    api.inviteMember.mockResolvedValue({
      ok: false,
      error: 'Не удалось связаться с сервером',
      network: true,
    });
    openDialog();
    fireEvent.change(await screen.findByLabelText('Почта'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Пригласить' }));

    await screen.findByText('Не удалось связаться с сервером');
    expect(notifications.error).toHaveBeenCalledWith('Не удалось связаться с сервером');
  });

  it('opens, copies and closes public access', async () => {
    openDialog();
    await screen.findByLabelText('Почта');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть публичный доступ' }));
    await waitFor(() => expect(api.setPublic).toHaveBeenCalledWith('p1', true));
    expect(clipboard.writeText).toHaveBeenCalledWith('https://example.test/s/p1');

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть публичный доступ' }));
    await waitFor(() => expect(api.setPublic).toHaveBeenCalledWith('p1', false));
  });
});

describe('ShareButton', () => {
  it.each(['editor', 'viewer'] as const)('does not expose controls to %s', (access) => {
    const { container } = render(<ShareButton projectId="p1" access={access} isPublic={false} />);
    expect(container.innerHTML).toBe('');
  });
});
