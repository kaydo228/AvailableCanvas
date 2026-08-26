/**
 * Пустое состояние списка проектов (FR-01).
 *
 * Пустая сетка читается как поломка, поэтому вместо неё — объяснение и одна
 * заметная кнопка. Диалог создания рисует другой модуль, отсюда только намерение.
 */

import { Plus } from 'lucide-react';

import { useProjectDialogs } from '@/features/projects/dialogsStore';

export const EmptyState = () => {
  const openCreate = useProjectDialogs((s) => s.openCreate);

  return (
    <div className="grid min-h-[70vh] place-items-center px-8">
      <div className="w-full max-w-xl">
        {/* Пустой лист доски вместо иконки-заглушки: показываем то, что получат. */}
        <div className="grid-dots h-40 rounded-lg border border-rule bg-sheet" />

        <p className="label-caps mt-8 text-faint">Ни одной доски</p>
        <h1 className="mt-2 font-semibold text-2xl text-ink tracking-tight">
          Чистый лист без края
        </h1>

        <p className="mt-3 max-w-md text-base text-pencil leading-relaxed">
          Диаграммы, заметки и картинки на бесконечном холсте. Всё остаётся в этом браузере — ни
          аккаунта, ни сервера.
        </p>

        <button
          type="button"
          onClick={openCreate}
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-accent px-5 py-3 font-medium text-accent-ink text-sm transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        >
          <Plus className="size-4" aria-hidden="true" />
          Создать проект
        </button>
      </div>
    </div>
  );
};
