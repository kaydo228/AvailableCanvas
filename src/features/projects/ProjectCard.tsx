/**
 * Карточка проекта: превью, имя, дата изменения (FR-01).
 *
 * Превью (`thumbnail`) пока никто не пишет — поле появится позже, поэтому
 * без него рисуется заглушка, а не битая картинка.
 * Контекстное меню только объявляет намерение, сами диалоги — отдельный модуль.
 */

import { Copy, LayoutDashboard, Pencil, Trash2 } from 'lucide-react';
import { ContextMenu } from 'radix-ui';
import { useNavigate } from 'react-router';

import { useProjectDialogs } from '@/features/projects/dialogsStore';
import type { Project } from '@/shared/types/document';

/** Один экземпляр форматтера на модуль: Intl дорогой в создании. */
const formatDate = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
}).format;

const itemClass =
  'flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100';

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
          className="group block w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-slate-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {project.thumbnail ? (
            <img
              src={project.thumbnail}
              alt=""
              className="aspect-4/3 w-full bg-slate-50 object-cover"
            />
          ) : (
            <div className="grid aspect-4/3 w-full place-items-center bg-slate-50 text-slate-300">
              <LayoutDashboard className="size-10" aria-hidden="true" />
            </div>
          )}

          <div className="border-t border-slate-100 px-3 py-2.5">
            <div className="truncate font-medium text-slate-900">{project.name}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              Изменён {formatDate(project.updatedAt)}
            </div>
          </div>
        </button>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          <ContextMenu.Item className={itemClass} onSelect={() => openRename(project.id)}>
            <Pencil className="size-4" aria-hidden="true" />
            Переименовать
          </ContextMenu.Item>
          <ContextMenu.Item className={itemClass} onSelect={() => openDuplicate(project.id)}>
            <Copy className="size-4" aria-hidden="true" />
            Дублировать
          </ContextMenu.Item>

          <ContextMenu.Separator className="my-1 h-px bg-slate-100" />

          <ContextMenu.Item
            className={`${itemClass} text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700`}
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
