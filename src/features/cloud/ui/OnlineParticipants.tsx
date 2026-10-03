import type { OnlineParticipant } from '@/features/cloud/model/presence';

const VISIBLE_LIMIT = 4;

const initials = (email: string): string => {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return (parts.length > 1 ? parts.map((part) => part[0]).join('') : local.slice(0, 2))
    .slice(0, 2)
    .toLocaleUpperCase();
};

const label = ({ email, self }: OnlineParticipant): string =>
  `${email}${self ? ' (Вы)' : ''} — в сети`;

export function OnlineParticipants({ participants }: { participants: OnlineParticipant[] }) {
  if (participants.length === 0) return null;

  const visible = participants.slice(0, VISIBLE_LIMIT);
  const hidden = participants.slice(VISIBLE_LIMIT);

  return (
    <fieldset className="flex shrink-0 items-center -space-x-2 border-0 p-0">
      <legend className="sr-only">В сети: {participants.length}</legend>
      {visible.map((participant) => (
        <span
          key={participant.userId}
          title={label(participant)}
          className="relative grid size-8 place-items-center rounded-full border-2 border-sheet bg-accent-tint font-mono font-medium text-accent text-micro"
        >
          <span aria-hidden="true">{initials(participant.email)}</span>
          <span className="sr-only">{label(participant)}</span>
          <span
            aria-hidden="true"
            className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-sheet bg-accent"
          />
        </span>
      ))}
      {hidden.length > 0 && (
        <span
          title={hidden.map(({ email }) => email).join('\n')}
          className="grid size-8 place-items-center rounded-full border-2 border-sheet bg-well font-mono text-faint text-micro"
        >
          <span aria-hidden="true">+{hidden.length}</span>
          <span className="sr-only">Ещё в сети: {hidden.map(({ email }) => email).join(', ')}</span>
        </span>
      )}
    </fieldset>
  );
}
