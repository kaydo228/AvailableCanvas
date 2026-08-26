/**
 * Меню экспорта на холсте (FR-12).
 *
 * Пункты плоским списком, без подменю: вариантов пять, и прятать их за
 * вложенностью — лишний жест на каждый экспорт.
 */

import { Download } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import { toast } from 'sonner';

import { useBoardStore } from '@/shared/store/board';
import { exportPng, type PngScale, type PngScope } from '../model/exportPng';
import { exportJson } from '../model/transfer';

const CONTENT =
  'z-50 min-w-60 rounded-md border border-rule bg-sheet p-1 shadow-pop focus:outline-none';
const ITEM =
  'flex cursor-pointer select-none items-center justify-between gap-6 rounded-sm px-2.5 py-2 ' +
  'text-sm text-ink outline-none data-[highlighted]:bg-well ' +
  'data-[disabled]:cursor-not-allowed data-[disabled]:text-faint data-[disabled]:bg-transparent';
const LABEL = 'label-caps px-2.5 pt-2.5 pb-1.5 text-faint';
const HINT = 'font-mono text-micro text-faint tabular-nums';

const PNG_ITEMS: Array<{ scope: PngScope; scale: PngScale; title: string }> = [
  { scope: 'board', scale: 1, title: 'Вся доска' },
  { scope: 'board', scale: 2, title: 'Вся доска' },
  { scope: 'selection', scale: 1, title: 'Только выделенное' },
  { scope: 'selection', scale: 2, title: 'Только выделенное' },
];

export function ExportMenu({ name }: { name: string }) {
  const hasSelection = useBoardStore((s) => s.selection.length > 0);
  const [busy, setBusy] = useState(false);

  /** Одна попытка за раз: PNG на 2× — это секунды, за них успевают накликать. */
  const run = (what: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    void what()
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Не удалось выгрузить доску');
      })
      .finally(() => setBusy(false));
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-pencil text-sm transition-colors hover:bg-well hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
        >
          <Download size={16} aria-hidden />
          Экспорт
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={CONTENT} sideOffset={6} align="start">
          <DropdownMenu.Label className={LABEL}>PNG</DropdownMenu.Label>
          {PNG_ITEMS.map(({ scope, scale, title }) => (
            <DropdownMenu.Item
              key={`${scope}${scale}`}
              className={ITEM}
              disabled={scope === 'selection' && !hasSelection}
              onSelect={() => run(() => exportPng({ scope, scale, name }))}
            >
              {title}
              <span className={HINT}>{scale}×</span>
            </DropdownMenu.Item>
          ))}

          <DropdownMenu.Separator className="my-1 h-px bg-rule" />
          <DropdownMenu.Label className={LABEL}>JSON</DropdownMenu.Label>
          <DropdownMenu.Item className={ITEM} onSelect={() => run(() => exportJson(name))}>
            Весь документ
            <span className={HINT}>с картинками</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
