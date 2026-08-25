/**
 * Пустое состояние списка проектов (FR-01).
 *
 * Пустая сетка читается как поломка, поэтому вместо неё — объяснение и одна
 * заметная кнопка. Диалог создания рисует другой модуль, отсюда только намерение.
 */

import { Plus, Shapes } from 'lucide-react';

import { useProjectDialogs } from '@/features/projects/dialogsStore';

export const EmptyState = () => {
  const openCreate = useProjectDialogs((s) => s.openCreate);

  return (
    <div className="grid min-h-[70vh] place-items-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 grid size-16 place-items-center rounded-2xl bg-slate-100 text-slate-400">
          <Shapes className="size-8" aria-hidden="true" />
        </div>

        <h1 className="text-2xl font-semibold text-slate-900">Здесь пока пусто</h1>

        <p className="mt-3 text-slate-500">
          Prostor — бесконечная доска для диаграмм, заметок и изображений. Создайте первый проект:
          он сразу откроется на холсте, и всё останется в этом браузере.
        </p>

        <button
          type="button"
          onClick={openCreate}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-medium text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <Plus className="size-5" aria-hidden="true" />
          Создать проект
        </button>
      </div>
    </div>
  );
};
