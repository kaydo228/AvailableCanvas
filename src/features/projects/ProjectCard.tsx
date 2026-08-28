/**
 * Карточка проекта: превью, имя, дата изменения (FR-01).
 *
 * Превью (`thumbnail`) сохраняется при выходе с холста. Пока его нет, рисуется
 * не иконка «нет картинки», а пустой лист с той же точечной сеткой, что и на
 * холсте: это честная миниатюра новой доски.
 * Контекстное меню только объявляет намерение, сами диалоги — отдельный модуль.
 */

import { Copy, Pencil, Trash2 } from 'lucide-react';
import { ContextMenu } from 'radix-ui';
import { useNavigate } from 'react-router';

import { useProjectDialogs } from '@/features/projects/dialogsStore';
import type { Project } from '@/shared/types/document';

/** Один экземпляр форматтера на модуль: Intl дорогой в создании. */
const formatDate = new Intl.DateTimeFormat('ru', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}).format;

const itemClass =
  'flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-well';

export const ProjectCard = ({ project }: { project: Project }) => {
  const navigate = useNavigate();
  const openRename = useProjectDialogs((s) => s.openRename);
  const openDuplicate = useProjectDialogs((s) => s.openDuplicate);
  const openDelete = useProjectDialogs((s) => s.openDelete);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          type="button"
          onClick={() => void navigate(`/p/${project.id}`)}
          className="group block w-full overflow-hidden rounded-lg border border-rule bg-sheet text-left transition-colors hover:border-rule-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        >
          {project.thumbnail ? (
            <img
              src={project.thumbnail}
              alt=""
              className="aspect-16/10 w-full bg-well object-cover"
            />
          ) : (
            <div className="grid-dots aspect-16/10 w-full bg-sheet" />
          )}

          <div className="border-rule border-t px-3.5 py-3">
            <div className="truncate font-medium text-ink text-sm">{project.name}</div>
            <time
              dateTime={new Date(project.updatedAt).toISOString()}
              className="mt-1 block font-mono text-faint text-micro tabular-nums"
            >
              {formatDate(project.updatedAt).replace(', ', ' · ')}
            </time>
          </div>
        </button>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-48 rounded-md border border-rule bg-sheet p-1 shadow-pop">
          <ContextMenu.Item className={itemClass} onSelect={() => openRename(project.id)}>
            <Pencil className="size-4 text-pencil" aria-hidden="true" />
            Переименовать
          </ContextMenu.Item>
          <ContextMenu.Item className={itemClass} onSelect={() => openDuplicate(project.id)}>
            <Copy className="size-4 text-pencil" aria-hidden="true" />
            Дублировать
          </ContextMenu.Item>

          <ContextMenu.Separator className="my-1 h-px bg-rule" />

          <ContextMenu.Item
            className={`${itemClass} text-signal data-[highlighted]:bg-signal-tint data-[highlighted]:text-signal`}
            onSelect={() => openDelete(project.id)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Удалить
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};
