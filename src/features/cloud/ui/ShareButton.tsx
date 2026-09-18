import { Users } from 'lucide-react';
import { useState } from 'react';

import type { ProjectAccess } from '@/features/cloud/model/access';
import type { Id } from '@/shared/types/document';

import { AccessDialog } from './AccessDialog';

const BUTTON =
  'inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-pencil text-sm transition-colors ' +
  'hover:bg-well hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-accent';

interface ShareButtonProps {
  projectId: Id;
  access: ProjectAccess;
  isPublic: boolean;
}

export function ShareButton({ projectId, access, isPublic }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  if (access !== 'owner') return null;

  return (
    <>
      <button type="button" className={BUTTON} onClick={() => setOpen(true)}>
        <Users size={16} aria-hidden="true" />
        Доступ
      </button>
      <AccessDialog projectId={projectId} isPublic={isPublic} open={open} onOpenChange={setOpen} />
    </>
  );
}
