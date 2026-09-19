/**
 * Экран холста `/p/:projectId` (FR-01).
 *
 * Документ читается из IndexedDB по id из адреса, а не из памяти: перезагрузка
 * страницы обязана открыть тот же проект в том же положении вида. Проекта нет —
 * уходим на список, белый экран и вечный спиннер пользователю ничего не говорят.
 */

import { ChevronLeft } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Toolbar } from '@/app/Toolbar';
import { CanvasStage, type CanvasStageHandle } from '@/features/canvas/engine/CanvasStage';
import { AccessBadge, ShareButton, useCloudSync } from '@/features/cloud';
import { canEdit, type ProjectAccess } from '@/features/cloud/model/access';
import { connectRemoteImages } from '@/features/cloud/model/images';
import { ExportMenu } from '@/features/export';
import { clearHistory, useHistorySession } from '@/features/history';
import { InspectorPanel } from '@/features/inspector';
import {
  getDocument,
  getProject,
  releaseImageCache,
  saveDocument,
  saveProjectThumbnail,
} from '@/features/persistence';
import { beginSaveSession, endSaveSession, useAutosave } from '@/features/persistence/autosave';
import { describeRepairs, repairDocument } from '@/features/persistence/repair';
import { SaveIndicator } from '@/features/persistence/SaveIndicator';
import { readSyncState } from '@/features/persistence/syncStore';
import { HelpDialog, useShortcuts } from '@/features/shortcuts';
import { useBoardStore } from '@/shared/store/board';
import { ThemeToggle } from '@/shared/ui';

/** `undefined` — ещё грузим, `null` — такого проекта нет. */
type LoadState = { name: string; access: ProjectAccess; isPublic: boolean } | null | undefined;

export function CanvasScreen() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>(undefined);
  const canvasRef = useRef<CanvasStageHandle>(null);
  const editable = state !== undefined && state !== null && canEdit(state.access);

  const loadDocument = useBoardStore((s) => s.loadDocument);
  const closeDocument = useBoardStore((s) => s.closeDocument);
  const saveThumbnail = useCallback(
    async (thumbnail: string) => {
      if (projectId) await saveProjectThumbnail(projectId, thumbnail);
    },
    [projectId],
  );

  // Автосохранение с дебаунсом (FR-11). Вьюпорт едет вместе с документом.
  useAutosave(editable);

  // Выгрузка на сервер (задача 4 cloud-sync). Свой дебаунс 3000 мс поверх
  // уже сохранённого документа — не привязан к автосохранению.
  useCloudSync(projectId, editable ? state?.access : undefined);

  // История отмен (FR-10). Своя у каждого проекта, чистится на входе и выходе.
  useHistorySession();

  // Горячие клавиши (6.2, 6.3). Живут только на холсте: в списке проектов
  // буква «S» должна печататься в поиске, а не ставить стикер.
  useShortcuts(editable);

  useEffect(() => {
    if (!projectId) {
      setState(null);
      return;
    }

    let cancelled = false;
    setState(undefined);
    connectRemoteImages(projectId);

    const open = async () => {
      const [project, stored, sync] = await Promise.all([
        getProject(projectId),
        getDocument(projectId),
        readSyncState(projectId),
      ]);
      if (cancelled) return;
      if (!project || !stored) {
        setState(null);
        return;
      }

      // Документ из хранилища проверяется наравне с импортированным: до сих пор
      // он попадал в стор без единой проверки, и порча, записанная старой
      // версией, так и оставалась в базе. Починенное дописываем сразу, иначе
      // тот же документ будет чиниться при каждом открытии.
      const { document, repairs } = repairDocument(stored);
      let openedAt = project.updatedAt;

      if (repairs.length > 0) {
        // Запись починки двигает updatedAt, и сессию надо открывать уже
        // с новым значением — иначе первое же автосохранение решит, что
        // документ переписала другая вкладка.
        const outcome = await saveDocument(document, project.updatedAt);
        if (outcome.ok) openedAt = outcome.updatedAt;
        if (cancelled) return;
        toast.warning('Доска была повреждена, пришлось поправить', {
          description: describeRepairs(repairs),
          duration: 15_000,
        });
      }

      // Вкладка объявляет, с каким updatedAt открыла проект: каждая запись
      // потом сверяется с этим значением и не затирает чужую работу молча.
      beginSaveSession(project.id, openedAt);

      loadDocument(document);
      // Открытие проекта — не действие пользователя. Без явной чистки первый
      // Cmd+Z откатывал бы саму загрузку: доска на секунду становилась пустой.
      clearHistory();
      setState({
        name: project.name,
        access: sync?.access ?? 'owner',
        isPublic: sync?.isPublic ?? false,
      });
    };

    void open();

    return () => {
      cancelled = true;
      endSaveSession();
      // Документ обязан уйти из стора вместе с экраном. Пока он оставался
      // висеть, повторный заход на ТОТ ЖЕ проект выглядел для автосохранения
      // правкой (projectId совпадает с предыдущим), и каждое открытие
      // переписывало документ и двигало updatedAt.
      closeDocument();
      // Object URL'ы картинок живут до явного отзыва — иначе они копятся
      // за всю сессию по всем открытым доскам.
      releaseImageCache();
      connectRemoteImages(null);
    };
  }, [projectId, loadDocument, closeDocument]);

  if (state === null) {
    return (
      <main className="grid h-screen place-items-center bg-paper px-6 text-center">
        <div>
          <h1 className="font-medium text-ink">Проект не найден</h1>
          <p className="mt-2 text-pencil text-sm">Возможно, его удалили в другой вкладке.</p>
          <Link
            to="/"
            className="mt-5 inline-flex rounded-md bg-accent px-3 py-2 text-accent-ink text-sm"
          >
            К списку досок
          </Link>
        </div>
      </main>
    );
  }

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
          onClick={(event) => {
            event.preventDefault();
            void canvasRef.current?.captureThumbnail().then(() => navigate('/'));
          }}
          className="-ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-pencil text-sm transition-colors hover:bg-well hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        >
          <ChevronLeft size={16} aria-hidden />
          Назад к списку
        </Link>

        <span className="h-4 w-px shrink-0 bg-rule" aria-hidden="true" />

        <span className="min-w-0 truncate font-medium text-ink text-sm">{state.name}</span>
        <AccessBadge access={state.access} />
        {editable && <SaveIndicator />}

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {projectId && (
            <ShareButton projectId={projectId} access={state.access} isPublic={state.isPublic} />
          )}
          <ExportMenu name={state.name} />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 overflow-hidden">
          {editable && <Toolbar />}
          <CanvasStage
            ref={canvasRef}
            readOnly={!editable}
            {...(editable ? { onThumbnail: saveThumbnail } : {})}
          />
        </div>
        {editable && <InspectorPanel />}
      </div>

      <HelpDialog />
    </div>
  );
}
