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
import { InspectorPanel } from '@/features/inspector';
import { getDocument, getProject } from '@/features/persistence';
import { useAutosave } from '@/features/persistence/autosave';
import { SaveIndicator } from '@/features/persistence/SaveIndicator';
import { HelpDialog, useShortcuts } from '@/features/shortcuts';
import { useBoardStore } from '@/shared/store/board';

/** `undefined` — ещё грузим, `null` — такого проекта нет. */
type LoadState = { name: string } | null | undefined;

export function CanvasScreen() {
  const { projectId } = useParams();
  const [state, setState] = useState<LoadState>(undefined);

  const loadDocument = useBoardStore((s) => s.loadDocument);

  // Автосохранение с дебаунсом (FR-11). Вьюпорт едет вместе с документом.
  useAutosave();

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
      setState({ name: project.name });
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, loadDocument]);

  if (state === null) return <Navigate to="/" replace />;

  if (state === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#fbfbfd] text-sm text-gray-500">
        Открываем проект…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#fbfbfd]">
      <header className="flex items-center gap-3 border-b border-black/5 bg-white px-4 py-2.5">
        <Link
          to="/"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <ChevronLeft size={16} aria-hidden />
          Назад к списку
        </Link>
        <span className="truncate text-sm font-medium text-gray-900">{state.name}</span>
        <SaveIndicator />
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
