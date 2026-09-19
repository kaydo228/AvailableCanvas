import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { participantsFromPresence, useProjectPresence } from './presence';

const deps = vi.hoisted(() => ({
  getCloud: vi.fn(),
}));

vi.mock('./client', () => ({ getCloud: deps.getCloud }));
vi.mock('./session', () => ({
  useSession: (selector: (state: { userId: string; email: string }) => unknown) =>
    selector({ userId: 'owner-1', email: 'owner@example.com' }),
}));

type PresenceHandler = {
  event: string;
  callback: () => void;
};

class FakePresenceChannel {
  handler: PresenceHandler | undefined;
  status: ((status: string) => void) | undefined;
  state: Record<string, unknown[]> = {};
  track = vi.fn(async () => 'ok');

  on(type: string, filter: { event: string }, callback: () => void) {
    if (type === 'presence') this.handler = { event: filter.event, callback };
    return this;
  }

  subscribe(callback?: (status: string) => void) {
    this.status = callback;
    return this;
  }

  presenceState() {
    return this.state;
  }

  sync(state: Record<string, unknown[]>) {
    this.state = state;
    this.handler?.callback();
  }
}

const channel = new FakePresenceChannel();
const setAuth = vi.fn(async () => undefined);
const removeChannel = vi.fn(async () => 'ok');
const createChannel = vi.fn(() => channel);

beforeEach(() => {
  vi.clearAllMocks();
  channel.handler = undefined;
  channel.status = undefined;
  channel.state = {};
  deps.getCloud.mockReturnValue({
    realtime: { setAuth },
    channel: createChannel,
    removeChannel,
  });
});

describe('participantsFromPresence', () => {
  it('ignores malformed entries and deduplicates one account across connections', () => {
    expect(
      participantsFromPresence(
        {
          first: [
            { userId: 'member-1', email: 'member@example.com' },
            { userId: 'member-1', email: 'member@example.com' },
            { userId: 7, email: 'broken@example.com' },
          ],
          second: [{ userId: 'owner-1', email: 'owner@example.com' }, null],
        },
        'owner-1',
      ),
    ).toEqual([
      { userId: 'owner-1', email: 'owner@example.com', self: true },
      { userId: 'member-1', email: 'member@example.com', self: false },
    ]);
  });
});

describe('useProjectPresence', () => {
  it('authorizes, tracks the current user, syncs participants, and removes the channel', async () => {
    const { result, unmount } = renderHook(() => useProjectPresence('p1'));

    await waitFor(() => expect(createChannel).toHaveBeenCalledTimes(1));
    expect(createChannel).toHaveBeenCalledWith('project-presence:p1', {
      config: { private: true, presence: { key: 'owner-1' } },
    });
    await waitFor(() => expect(setAuth).toHaveBeenCalledTimes(1));

    act(() => channel.status?.('SUBSCRIBED'));
    await waitFor(() =>
      expect(channel.track).toHaveBeenCalledWith({
        userId: 'owner-1',
        email: 'owner@example.com',
      }),
    );

    act(() => {
      channel.sync({
        owner: [{ userId: 'owner-1', email: 'owner@example.com' }],
        member: [{ userId: 'member-1', email: 'member@example.com' }],
      });
    });
    expect(result.current).toEqual([
      { userId: 'owner-1', email: 'owner@example.com', self: true },
      { userId: 'member-1', email: 'member@example.com', self: false },
    ]);

    unmount();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it('does not subscribe without a project id', () => {
    const { result } = renderHook(() => useProjectPresence());

    expect(result.current).toEqual([]);
    expect(createChannel).not.toHaveBeenCalled();
  });
});
