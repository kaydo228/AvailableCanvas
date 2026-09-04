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
import { toast } from 'sonner';

import { deleteRemote, useSession } from '@/features/cloud';
import {
  createProject,
  deleteProject,
  duplicateProject,
  getProject,
  isBlankName,
  MAX_PROJECT_NAME,
  renameProject,
} from '@/features/persistence';
import { useProjectDialogs } from '@/features/projects/dialogsStore';
import type { Id } from '@/shared/types/document';

const DEFAULT_NAME = 'Новый проект';

/** Проект исчез между открытием диалога и подтверждением — обычно из соседней вкладки. */
const GONE = 'Проект уже удалён — обновите список.';

const OVERLAY = 'fixed inset-0 z-40 bg-scrim backdrop-blur-[1px]';
const CONTENT =
  'fixed left-1/2 top-1/2 z-50 w-[min(27rem,calc(100vw-2rem))] -translate-x-1/2 ' +
  '-translate-y-1/2 rounded-lg border border-rule bg-sheet p-6 shadow-pop focus:outline-none';
const TITLE = 'text-[0.9375rem] font-semibold tracking-tight text-ink';
const DESCRIPTION = 'mt-2 text-sm leading-relaxed text-pencil';
const FOOTER = 'mt-7 flex justify-end gap-2';
const INPUT =
  'mt-5 w-full rounded-md border border-rule-strong bg-paper px-3 py-2 text-sm text-ink ' +
  'outline-none transition-colors focus:border-accent focus:bg-sheet';

const BTN =
  'rounded-md px-4 py-2 text-sm font-medium transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50';
const BTN_GHOST = `${BTN} text-pencil hover:bg-well hover:text-ink`;
const BTN_PRIMARY = `${BTN} bg-accent text-accent-ink hover:bg-accent-hover`;
const BTN_DANGER = `${BTN} bg-signal text-white hover:opacity-90`;

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

/**
 * Имя проекта для заголовков и подтверждений.
 *
 * `undefined` — ещё грузим, `null` — проекта нет. Раньше оба случая давали
 * пустую строку, и диалог дублирования писал «Копия проекта «»» одинаково
 * и во время загрузки, и над удалённым проектом.
 */
function useProjectName(projectId: Id): string | null | undefined {
  const [name, setName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setName(undefined);
    getProject(projectId)
      .then((project) => {
        if (alive) setName(project?.name ?? null);
      })
      .catch(() => toast.error('Не удалось прочитать проект'));
    return () => {
      alive = false;
    };
  }, [projectId]);

  return name;
}

/** Как показать имя, пока оно грузится или уже не существует. */
const showName = (name: string | null | undefined): string =>
  name === undefined ? '…' : (name ?? 'удалённый проект');

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

  // Не `trim()`: имя из zero-width пробелов его переживает и даёт карточку
  // без подписи, которую в списке не отличить от соседних.
  const blank = isBlankName(name);
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
              if (blank) return;
              run(() => onConfirm(trimmed));
            }}
          >
            <input
              ref={inputRef}
              className={INPUT}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Имя проекта"
              maxLength={MAX_PROJECT_NAME}
            />
            <div className={FOOTER}>
              <button type="button" className={BTN_GHOST} onClick={close}>
                Отмена
              </button>
              <button type="submit" className={BTN_PRIMARY} disabled={busy || blank}>
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
      initial={current ?? ''}
      confirmLabel="Сохранить"
      onConfirm={async (name) => {
        // Отказ показываем, а диалог оставляем открытым: закрыть его молча
        // значит соврать, что переименование прошло.
        if (!(await renameProject(projectId, name))) {
          bumpRevision();
          throw new Error(GONE);
        }
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
    const copy = await duplicateProject(projectId);
    bumpRevision();
    if (!copy) throw new Error(GONE);
    close();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={OVERLAY} />
        <Dialog.Content className={CONTENT}>
          <Dialog.Title className={TITLE}>Дублировать проект</Dialog.Title>
          <Dialog.Description className={DESCRIPTION}>
            Копия проекта «{showName(name)}» появится в списке под именем «{showName(name)} — копия»
            вместе со всем содержимым доски.
          </Dialog.Description>
          <div className={FOOTER}>
            <button type="button" className={BTN_GHOST} onClick={close}>
              Отмена
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy || name === undefined}
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
            <TriangleAlert className="mt-0.5 shrink-0 text-signal" size={20} aria-hidden />
            <div>
              <AlertDialog.Title className={TITLE}>
                Удалить проект «{showName(name)}»?
              </AlertDialog.Title>
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
                    // Удалённую строку сносим только за вошедшим: без owner
                    // на сервере нечего искать — доска туда и не уезжала.
                    const owner = useSession.getState().userId;
                    // Отказ сервера не глотаем. Локально доска уже снесена
                    // вместе с записью синхронизации, и на следующем входе
                    // она вернётся скачиванием — про это надо сказать сразу,
                    // иначе воскресшая доска выглядит как поломка (README,
                    // «Чего не умеет»).
                    if (owner && !(await deleteRemote(projectId))) {
                      toast.error('Доска удалена только здесь', {
                        description:
                          'Сервер не ответил — при следующем входе она вернётся в список. ' +
                          'Удалите её ещё раз, когда будет связь.',
                        duration: Number.POSITIVE_INFINITY,
                      });
                    }
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
 * `<AppToaster/>` переехал в корень роутера: он нужен и холсту тоже,
 * а этот модуль рендерится только на маршруте списка проектов.
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
    </>
  );
};
