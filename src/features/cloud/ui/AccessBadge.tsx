import type { ProjectAccess } from '@/features/cloud/model/access';

export function AccessBadge({ access }: { access: ProjectAccess }) {
  if (access === 'owner') return null;
  return (
    <span className="shrink-0 rounded-full border border-rule bg-well px-2 py-0.5 text-faint text-micro">
      {access === 'editor' ? 'Совместный проект' : 'Только просмотр'}
    </span>
  );
}
