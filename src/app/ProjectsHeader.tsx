/**
 * Шапка экрана списка (раздел 6.1 ТЗ): название приложения и «Создать проект».
 * Сам диалог живёт в features/projects — сюда приходит только его открытие.
 */

import { Plus } from 'lucide-react';

import { useProjectDialogs } from '@/features/projects/dialogsStore';

export function ProjectsHeader() {
  const openCreate = useProjectDialogs((s) => s.openCreate);

  return (
    <header className="flex items-center justify-between gap-4 border-b border-black/5 bg-white px-6 py-4">
      <span className="text-lg font-semibold tracking-tight text-gray-900">Prostor</span>
      <button
        type="button"
        onClick={() => openCreate()}
        className="inline-flex items-center gap-2 rounded-lg bg-[#2f6fed] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#255ccc]"
      >
        <Plus size={16} aria-hidden />
        Создать проект
      </button>
    </header>
  );
}
