/** Кто прямо сейчас держит открытым тот же облачный проект. */

import { useEffect, useState } from 'react';

import type { Id } from '@/shared/types/document';

import { getCloud } from './client';
import { useSession } from './session';

interface PresencePayload {
  userId: string;
  email: string;
}

export interface OnlineParticipant extends PresencePayload {
  self: boolean;
}

const isPresencePayload = (value: unknown): value is PresencePayload => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Partial<PresencePayload>;
  return (
    typeof payload.userId === 'string' &&
    payload.userId.length > 0 &&
    typeof payload.email === 'string' &&
    payload.email.length > 0
  );
};

/** Presence хранит по записи на соединение; интерфейсу нужен один человек. */
export const participantsFromPresence = (
  state: Record<string, readonly unknown[]>,
  currentUserId: string,
): OnlineParticipant[] => {
  const participants = new Map<string, OnlineParticipant>();

  for (const connections of Object.values(state)) {
    for (const connection of connections) {
      if (!isPresencePayload(connection) || participants.has(connection.userId)) continue;
      participants.set(connection.userId, {
        userId: connection.userId,
        email: connection.email,
        self: connection.userId === currentUserId,
      });
    }
  }

  return [...participants.values()].sort(
    (left, right) =>
      Number(right.self) - Number(left.self) || left.email.localeCompare(right.email),
  );
};

export const useProjectPresence = (projectId?: Id): OnlineParticipant[] => {
  const userId = useSession((state) => state.userId);
  const email = useSession((state) => state.email);
  const [participants, setParticipants] = useState<OnlineParticipant[]>([]);

  useEffect(() => {
    setParticipants([]);
    const cloud = getCloud();
    if (!cloud || !projectId || !userId || !email) return;

    let stopped = false;
    const channel = cloud.channel(`project-presence:${projectId}`, {
      config: { private: true, presence: { key: userId } },
    });

    const refresh = () => {
      if (!stopped) setParticipants(participantsFromPresence(channel.presenceState(), userId));
    };

    channel.on('presence', { event: 'sync' }, refresh);

    void cloud.realtime
      .setAuth()
      .then(() => {
        if (stopped) return;
        channel.subscribe((status) => {
          if (status !== 'SUBSCRIBED' || stopped) return;
          void channel.track({ userId, email }).catch((error: unknown) => {
            if (!stopped) console.warn('Не удалось показать участника в сети', error);
          });
        });
      })
      .catch((error: unknown) => {
        if (!stopped) console.warn('Не удалось авторизовать Presence-канал проекта', error);
      });

    return () => {
      stopped = true;
      void cloud.removeChannel(channel);
    };
  }, [email, projectId, userId]);

  return participants;
};
