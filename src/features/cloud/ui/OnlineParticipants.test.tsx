import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { OnlineParticipant } from '@/features/cloud/model/presence';

import { OnlineParticipants } from './OnlineParticipants';

afterEach(cleanup);

const participant = (userId: string, email: string, self = false): OnlineParticipant => ({
  userId,
  email,
  self,
});

describe('OnlineParticipants', () => {
  it('renders nothing while nobody is online', () => {
    const { container } = render(<OnlineParticipants participants={[]} />);

    expect(container.innerHTML).toBe('');
  });

  it('shows participant initials, online state, and identifies the current user', () => {
    render(
      <OnlineParticipants
        participants={[
          participant('owner', 'anna.smith@example.com', true),
          participant('member', 'boris@example.com'),
        ]}
      />,
    );

    expect(screen.getByRole('group', { name: 'В сети: 2' })).toBeTruthy();
    expect(screen.getByText('AS')).toBeTruthy();
    expect(screen.getByText('BO')).toBeTruthy();
    expect(screen.getByText('anna.smith@example.com (Вы) — в сети')).toBeTruthy();
    expect(screen.getByText('boris@example.com — в сети')).toBeTruthy();
  });

  it('shows four participants and an accessible overflow counter', () => {
    render(
      <OnlineParticipants
        participants={[
          participant('1', 'one@example.com', true),
          participant('2', 'two@example.com'),
          participant('3', 'three@example.com'),
          participant('4', 'four@example.com'),
          participant('5', 'five@example.com'),
          participant('6', 'six@example.com'),
        ]}
      />,
    );

    expect(screen.getByText('+2')).toBeTruthy();
    expect(screen.getByText('Ещё в сети: five@example.com, six@example.com')).toBeTruthy();
    expect(screen.queryByText('FI')).toBeNull();
  });
});
