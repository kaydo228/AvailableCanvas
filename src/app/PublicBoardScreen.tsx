/**
 * Публичный экран `/s/:projectId` — доска только на чтение (задача 7 cloud-sync).
 *
 * Документ живёт только в памяти вкладки: `loadPublicBoard` не кладёт его
 * в IndexedDB (см. шапку `features/cloud/model/share.ts`), а стор чистится
 * при уходе с экрана — иначе следующий открытый локальный проект унаследует
 * чужой документ на мгновение. Ни автосохранения, ни горячих клавиш, ни
 * синхронизации здесь нет намеренно: экран только показывает. Выгрузка
 * (`ExportMenu`) есть — она читает доску и ничего в ней не меняет.
 *
 * «Только просмотр» ниже — честная оговорка, а не защита: `draggable` живёт
 * в `features/canvas/nodes/NodesLayer.tsx` (зона A), и запрет трогать чужую
 * зону не даёт выключить перетаскивание отсюда. Правки мышью никуда не
 * сохраняются — `useAutosave` на этом экране не смонтирован, — но узел
 * подвинуть можно. Запрос на флаг «только чтение» — в docs/CONTRACT-REQUESTS.md.
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { CanvasStage } from '@/features/canvas/engine/CanvasStage';
import { loadPublicBoard } from '@/features/cloud';
import { ExportMenu } from '@/features/export';
import { useBoardStore } from '@/shared/store/board';

type LoadState = 'loading' | 'notfound' | 'ready';

export function PublicBoardScreen() {
  const { projectId } = useParams();
  const [state, setState] = useState<LoadState>('loading');
  const [name, setName] = useState('');
  const loadDocument = useBoardStore((s) => s.loadDocument);
  const closeDocument = useBoardStore((s) => s.closeDocument);

  useEffect(() => {
    if (!projectId) {
      setState('notfound');
      return;
    }

    let cancelled = false;
    setState('loading');

    void loadPublicBoard(projectId).then((board) => {
      if (cancelled) return;
      if (!board) {
        setState('notfound');
        return;
      }
      loadDocument(board.document);
      setName(board.name);
      setState('ready');
    });

    return () => {
      cancelled = true;
      // Документ обязан уйти из стора вместе с экраном — иначе он на
      // мгновение виден следующему открытому (уже своему) проекту.
      closeDocument();
    };
  }, [projectId, loadDocument, closeDocument]);

  if (state === 'notfound') {
    return (
      <main className="grid h-screen place-items-center bg-paper px-6 text-center">
        <div>
          <h1 className="font-medium text-ink">Доска не найдена или доступ закрыт</h1>
          <Link
            to="/"
            className="mt-5 inline-flex rounded-md bg-accent px-3 py-2 text-accent-ink text-sm"
          >
            На главную
          </Link>
        </div>
      </main>
    );
  }

  if (state === 'loading') {
    return (
      <div className="grid h-screen place-items-center bg-paper font-mono text-faint text-micro">
        Открываем доску…
      </div>
    );
  }

  return (
    <div className="relative h-screen bg-paper">
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-center justify-between">
        <span className="rounded-md border border-rule bg-sheet px-2.5 py-1 text-pencil text-xs">
          Только просмотр
        </span>
        <span className="pointer-events-auto">
          <ExportMenu name={name} />
        </span>
      </div>
      <CanvasStage />
    </div>
  );
}
