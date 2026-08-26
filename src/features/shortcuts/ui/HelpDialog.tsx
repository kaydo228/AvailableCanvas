/**
 * Справка по клавишам, открывается по «?».
 *
 * Список строится из той же таблицы, что и обработчики, — врать не может.
 * Сочетания без обработчика показаны приглушённо с пометкой: честнее, чем
 * обещать отмену, которой пока нет.
 */

import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';

import { formatHint } from '../lib/keyHint';
import { SHORTCUTS, type ShortcutGroup } from '../model/bindings';
import { useShortcutsUI } from '../model/store';

const GROUPS: ShortcutGroup[] = ['Инструменты', 'Правка', 'Слои', 'Вид', 'Прочее'];

/** Строка без обработчика и без пометки «живёт в другом месте» — ещё не сделана. */
const isPending = (keys: string, run: unknown): boolean => keys !== '' && run === undefined;

export const HelpDialog = () => {
  const open = useShortcutsUI((s) => s.helpOpen);
  const closeHelp = useShortcutsUI((s) => s.closeHelp);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && closeHelp()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-[1px]" />
        <Dialog.Content className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 max-h-[80vh] w-[min(680px,92vw)] overflow-y-auto rounded-lg border border-rule bg-sheet p-6 shadow-pop">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-semibold text-[0.9375rem] text-ink tracking-tight">
                Горячие клавиши
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-pencil text-xs leading-relaxed">
                Открыть и закрыть этот список — «?». Во время ввода текста клавиши выключены.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Закрыть"
              className="rounded-sm p-1 text-pencil transition-colors hover:bg-well hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {GROUPS.map((group) => (
              <section key={group}>
                <h3 className="label-caps mb-2.5 text-faint">{group}</h3>
                <dl>
                  {SHORTCUTS.filter((s) => s.group === group).map((shortcut) => {
                    const pending = isPending(shortcut.keys, shortcut.run);
                    return (
                      <div
                        key={`${shortcut.group}-${shortcut.hint}-${shortcut.title}`}
                        className={`flex items-baseline justify-between gap-3 border-rule/60 border-b py-1 text-xs last:border-b-0 ${
                          pending ? 'text-faint' : 'text-ink'
                        }`}
                      >
                        <dt className="min-w-0 truncate">
                          {shortcut.title}
                          {pending && <span className="ml-1 text-faint">— пока не готово</span>}
                        </dt>
                        <dd>
                          <kbd className="rounded-[3px] border border-rule bg-paper px-1.5 py-0.5 font-mono text-micro text-pencil">
                            {formatHint(shortcut.hint)}
                          </kbd>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
