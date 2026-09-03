/**
 * Шапка экрана списка (раздел 6.1 ТЗ): название приложения и «Создать проект».
 * Сам диалог живёт в features/projects — сюда приходит только его открытие.
 *
 * Логотип набран вразрядку: «простор» — это про ширину, и единственное место,
 * где типографика позволяет себе жест. Дальше по экрану — только работа.
 */

import { Plus } from 'lucide-react';

import { AccountMenu } from '@/features/cloud';
// Импорт напрямую, а не через `@/features/export`: баррель реэкспортирует
// и `exportPng`, а тот тянет Konva. На списке проектов холста нет.
import { ImportButton } from '@/features/export/ui/ImportButton';
import { useProjectDialogs } from '@/features/projects/dialogsStore';
import { ThemeToggle } from '@/shared/ui';

export function ProjectsHeader() {
  const openCreate = useProjectDialogs((s) => s.openCreate);

  return (
    <header className="sticky top-0 z-30 border-rule border-b bg-sheet/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[76rem] items-center gap-4 px-8">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-semibold text-[0.9375rem] text-ink uppercase tracking-[0.22em]">
            Prostor
          </span>
          <span className="hidden font-mono text-faint text-micro sm:inline">
            всё хранится в этом браузере
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <AccountMenu />
          <ThemeToggle />
          <ImportButton />
          <button
            type="button"
            onClick={() => openCreate()}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 font-medium text-accent-ink text-sm transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <Plus size={16} aria-hidden />
            Создать проект
          </button>
        </div>
      </div>
    </header>
  );
}
