/**
 * Четыре диалога экрана проектов (FR-01): создание, переименование,
 * дублирование, удаление.
 *
 * Намерение приходит из `dialogsStore` — кнопки нигде не прокидывают колбэки.
 * Запись идёт в `persistence`, а список узнаёт о ней через `bumpRevision()`.
 *
 * Два правила, которые легко нарушить и трудно заметить:
 *  - после создания пользователь уходит СРАЗУ на холст нового проекта, а не
 *    обратно в список (`navigate('/p/:id')` ниже);
 *  - после дублирования, наоборот, остаёмся в списке: копию делают, чтобы
 *    продолжить разбирать список, а не чтобы провалиться в копию.
 *
 * Удаление — единственный необратимый пункт, поэтому у него `AlertDialog`,
 * а не обычный `Dialog`: правильная семантика и фокус по умолчанию на
 * «Отмене», а не на разрушительной кнопке.
 */

import { TriangleAlert } from 'lucide-react';
import { AlertDialog, Dialog } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Toaster, toast } from 'sonner';

import {
  createProject,
  deleteProject,
  duplicateProject,
  getProject,
  renameProject,
} from '@/features/persistence';
import { useProjectDialogs } from '@/features/projects/dialogsStore';
import type { Id } from '@/shared/types/document';

const DEFAULT_NAME = 'Новый проект';

const OVERLAY = 'fixed inset-0 z-40 bg-black/30';
const CONTENT =
  'fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 ' +
  '-translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl focus:outline-none';
const TITLE = 'text-base font-semibold tracking-tight text-gray-900';
const DESCRIPTION = 'mt-2 text-sm leading-relaxed text-gray-600';
const FOOTER = 'mt-6 flex justify-end gap-2';
const INPUT =
  'mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 ' +
  'outline-none focus:border-[#2f6fed] focus:ring-2 focus:ring-[#2f6fed]/20';

const BTN =
  'rounded-lg px-4 py-2 text-sm font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50';
const BTN_GHOST = `${BTN} text-gray-700 hover:bg-gray-100`;
const BTN_PRIMARY = `${BTN} bg-[#2f6fed] text-white hover:bg-[#255ccc]`;
const BTN_DANGER = `${BTN} bg-[#dc2626] text-white hover:bg-[#b91c1c]`;

/**
 * Одна попытка записи за раз. Ref, а не только state: два клика подряд успевают
 * пройти до перерисовки с `disabled`, и тогда «Создать» родит два проекта.
 * На успехе диалог размонтируется, поэтому флаг снимается только при ошибке.
 */
function useWriteOnce() {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = (write: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    void write().catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить изменения');
      busyRef.current = false;
      setBusy(false);
    });
  };

  return [busy, run] as const;
}

/** Имя проекта для заголовков и подтверждений. Пока грузится — пустая строка. */
function useProjectName(projectId: Id) {
  const [name, setName] = useState('');

  useEffect(() => {
    let alive = true;
    getProject(projectId)
      .then((project) => {
        if (alive) setName(project?.name ?? '');
      })
      .catch(() => toast.error('Не удалось прочитать проект'));
    return () => {
      alive = false;
    };
  }, [projectId]);

  return name;
}

interface NameDialogProps {
  title: string;
  description: string;
  /** Меняется асинхронно у переименования — имя приезжает из IndexedDB. */
  initial: string;
  confirmLabel: string;
  onConfirm: (name: string) => Promise<void>;
}

/** Диалог с одним полем имени: Enter подтверждает, Escape закрывает (Radix). */
function NameDialog({ title, description, initial, confirmLabel, onConfirm }: NameDialogProps) {
  const close = useProjectDialogs((s) => s.close);
  const [name, setName] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, run] = useWriteOnce();

  useEffect(() => {
    setName(initial);
  }, [initial]);

  const trimmed = name.trim();

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={OVERLAY} />
        <Dialog.Content
          className={CONTENT}
          onOpenAutoFocus={(event) => {
            // Текст выделен целиком — набор сразу перебивает имя по умолчанию.
            event.preventDefault();
            inputRef.current?.focus();
            inputRef.current?.select();
          }}
        >
          <Dialog.Title className={TITLE}>{title}</Dialog.Title>
          <Dialog.Description className={DESCRIPTION}>{description}</Dialog.Description>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!trimmed) return;
              run(() => onConfirm(trimmed));
            }}
          >
            <input
              ref={inputRef}
              className={INPUT}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Имя проекта"
              maxLength={120}
            />
            <div className={FOOTER}>
              <button type="button" className={BTN_GHOST} onClick={close}>
                Отмена
              </button>
              <button type="submit" className={BTN_PRIMARY} disabled={busy || !trimmed}>
                {confirmLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CreateDialog() {
  const close = useProjectDialogs((s) => s.close);
  const navigate = useNavigate();

  return (
    <NameDialog
      title="Новый проект"
      description="Имя можно изменить позже. Пустое поле подставит имя по умолчанию."
      initial={DEFAULT_NAME}
      confirmLabel="Создать"
      onConfirm={async (name) => {
        const project = await createProject(name);
        close();
        // Главное в FR-01: пользователь оказывается на холсте нового проекта,
        // а не возвращается в список.
        navigate(`/p/${project.id}`);
      }}
    />
  );
}

function RenameDialog({ projectId }: { projectId: Id }) {
  const close = useProjectDialogs((s) => s.close);
  const bumpRevision = useProjectDialogs((s) => s.bumpRevision);
  const current = useProjectName(projectId);

  return (
    <NameDialog
      title="Переименовать проект"
      description="Новое имя появится в списке сразу."
      initial={current}
      confirmLabel="Сохранить"
      onConfirm={async (name) => {
        await renameProject(projectId, name);
        bumpRevision();
        close();
      }}
    />
  );
}

function DuplicateDialog({ projectId }: { projectId: Id }) {
  const close = useProjectDialogs((s) => s.close);
  const bumpRevision = useProjectDialogs((s) => s.bumpRevision);
  const name = useProjectName(projectId);
  const [busy, run] = useWriteOnce();

  const confirm = async () => {
    await duplicateProject(projectId);
    bumpRevision();
    close();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={OVERLAY} />
        <Dialog.Content className={CONTENT}>
          <Dialog.Title className={TITLE}>Дублировать проект</Dialog.Title>
          <Dialog.Description className={DESCRIPTION}>
            Копия проекта «{name}» появится в списке под именем «{name} — копия» вместе со всем
            содержимым доски.
          </Dialog.Description>
          <div className={FOOTER}>
            <button type="button" className={BTN_GHOST} onClick={close}>
              Отмена
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy}
              onClick={() => run(confirm)}
            >
              Дублировать
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DeleteDialog({ projectId }: { projectId: Id }) {
  const close = useProjectDialogs((s) => s.close);
  const bumpRevision = useProjectDialogs((s) => s.bumpRevision);
  const name = useProjectName(projectId);
  const [busy, run] = useWriteOnce();

  return (
    <AlertDialog.Root open onOpenChange={(open) => !open && close()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={OVERLAY} />
        <AlertDialog.Content className={CONTENT}>
          <div className="flex gap-3">
            <TriangleAlert className="mt-0.5 shrink-0 text-[#dc2626]" size={20} aria-hidden />
            <div>
              <AlertDialog.Title className={TITLE}>Удалить проект «{name}»?</AlertDialog.Title>
              <AlertDialog.Description className={DESCRIPTION}>
                Проект и вся его доска будут удалены навсегда. Отменить это действие нельзя.
              </AlertDialog.Description>
            </div>
          </div>
          <div className={FOOTER}>
            <AlertDialog.Cancel asChild>
              <button type="button" className={BTN_GHOST}>
                Отмена
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                className={BTN_DANGER}
                disabled={busy}
                onClick={(event) => {
                  // Без preventDefault Radix закроет диалог до конца записи.
                  event.preventDefault();
                  run(async () => {
                    await deleteProject(projectId);
                    bumpRevision();
                    close();
                  });
                }}
              >
                Удалить
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/**
 * Точка входа: слушает `dialogsStore` и рисует ровно один диалог.
 * `<Toaster/>` живёт здесь же — ошибки записи показывает этот модуль,
 * лезть за ним в чужой layout незачем.
 */
export const ProjectDialogs = () => {
  const kind = useProjectDialogs((s) => s.kind);
  const projectId = useProjectDialogs((s) => s.projectId);

  return (
    <>
      {kind === 'create' && <CreateDialog />}
      {kind === 'rename' && projectId && <RenameDialog projectId={projectId} />}
      {kind === 'duplicate' && projectId && <DuplicateDialog projectId={projectId} />}
      {kind === 'delete' && projectId && <DeleteDialog projectId={projectId} />}
      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
};
