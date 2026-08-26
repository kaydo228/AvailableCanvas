/**
 * Экран холста `/p/:projectId` (FR-01).
 *
 * Документ читается из IndexedDB по id из адреса, а не из памяти: перезагрузка
 * страницы обязана открыть тот же проект в том же положении вида. Проекта нет —
 * уходим на список, белый экран и вечный спиннер пользователю ничего не говорят.
 */

import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Toolbar } from '@/app/Toolbar';
import { CanvasStage } from '@/features/canvas/engine/CanvasStage';
import { ExportMenu } from '@/features/export';
import { clearHistory, useHistorySession } from '@/features/history';
import { InspectorPanel } from '@/features/inspector';
import { getDocument, getProject } from '@/features/persistence';
import { useAutosave } from '@/features/persistence/autosave';
import { SaveIndicator } from '@/features/persistence/SaveIndicator';
import { HelpDialog, useShortcuts } from '@/features/shortcuts';
import { useBoardStore } from '@/shared/store/board';
import { ThemeToggle } from '@/shared/ui';

/** `undefined` — ещё грузим, `null` — такого проекта нет. */
type LoadState = { name: string } | null | undefined;

export function CanvasScreen() {
  const { projectId } = useParams();
  const [state, setState] = useState<LoadState>(undefined);

  const loadDocument = useBoardStore((s) => s.loadDocument);

  // Автосохранение с дебаунсом (FR-11). Вьюпорт едет вместе с документом.
  useAutosave();

  // История отмен (FR-10). Своя у каждого проекта, чистится на входе и выходе.
  useHistorySession();

  // Горячие клавиши (6.2, 6.3). Живут только на холсте: в списке проектов
  // буква «S» должна печататься в поиске, а не ставить стикер.
  useShortcuts();

  useEffect(() => {
    if (!projectId) {
      setState(null);
      return;
    }

    let cancelled = false;
    setState(undefined);

    Promise.all([getProject(projectId), getDocument(projectId)]).then(([project, document]) => {
      if (cancelled) return;
      if (!project || !document) {
        setState(null);
        return;
      }
      loadDocument(document);
      // Открытие проекта — не действие пользователя. Без явной чистки первый
      // Cmd+Z откатывал бы саму загрузку: доска на секунду становилась пустой.
      clearHistory();
      setState({ name: project.name });
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, loadDocument]);

  if (state === null) return <Navigate to="/" replace />;

  if (state === undefined) {
    return (
      <div className="grid h-screen place-items-center bg-paper font-mono text-faint text-micro">
        Открываем проект…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-paper">
      <header className="flex h-14 shrink-0 items-center gap-3 border-rule border-b bg-sheet px-4">
        <Link
          to="/"
          className="-ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-pencil text-sm transition-colors hover:bg-well hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        >
          <ChevronLeft size={16} aria-hidden />
          Назад к списку
        </Link>

        <span className="h-4 w-px shrink-0 bg-rule" aria-hidden="true" />

        <span className="min-w-0 truncate font-medium text-ink text-sm">{state.name}</span>
        <SaveIndicator />

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <ExportMenu name={state.name} />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 overflow-hidden">
          <Toolbar />
          <CanvasStage />
        </div>
        <InspectorPanel />
      </div>

      <HelpDialog />
    </div>
  );
}
