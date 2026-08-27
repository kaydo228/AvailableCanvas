/**
 * Цвет: react-colorful в radix-поповере.
 *
 * Кнопки «Применить» нет и быть не должно (FR-09) — пока цвет у выделенного
 * ОДИН. onChange пикера прокинут наружу напрямую, react-colorful зовёт его на
 * каждое движение указателя, поэтому цвет узла едет за курсором. Локального
 * стейта с подтверждением тут специально не заводится: он и есть та самая
 * отложенная «Применить».
 *
 * Ровно обратное правило, когда цвета РАЗНЫЕ (`value === undefined`, П7 из
 * docs/nightly/shell/01-план-починки.md). Там нечего вести за курсором, зато
 * есть что потерять: поповер открывается под курсором, пикер стартует
 * с `#ffffff`, и один случайный клик затирал цвета всех выделенных узлов
 * значением, не связанным ни с одним из них. Поэтому при «разных» правка
 * копится в черновике и уходит наружу только по явному нажатию.
 */

import { Popover } from 'radix-ui';
import { useState } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';

export interface ColorFieldProps {
  value: string | undefined;
  onChange: (hex: string) => void;
  presets?: readonly string[];
  /** Сколько узлов получит значение. Показывается на кнопке при «разных». */
  count?: number;
}

export function ColorField({ value, onChange, presets, count }: ColorFieldProps) {
  const mixed = value === undefined;
  const [draft, setDraft] = useState<string | null>(null);

  // При «разных» пикеру нечего показать: любой стартовый цвет тут — выдумка.
  const shown = draft ?? value ?? '#ffffff';

  const pick = (hex: string) => {
    if (mixed) setDraft(hex);
    else onChange(hex);
  };

  const apply = () => {
    if (draft !== null) onChange(draft);
    setDraft(null);
  };

  return (
    <Popover.Root
      onOpenChange={(open) => {
        // Черновик живёт ровно одно открытие: незакрытая правка не должна
        // всплыть в следующий раз, когда выделение уже другое.
        if (!open) setDraft(null);
      }}
    >
      <Popover.Trigger className="flex w-full items-center gap-2 rounded-sm border border-rule bg-paper px-2 py-1.5 text-xs outline-none transition-colors hover:border-rule-strong focus-visible:border-accent">
        <span
          className="size-4 shrink-0 rounded-[3px] ring-1 ring-rule-strong"
          style={value === undefined ? undefined : { backgroundColor: value }}
        />
        <span className="font-mono text-ink uppercase">{value ?? 'разные'}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 rounded-md border border-rule bg-sheet p-3 shadow-pop"
        >
          <HexColorPicker color={shown} onChange={pick} />
          <HexColorInput
            color={draft ?? value ?? ''}
            onChange={pick}
            prefixed
            aria-label="Цвет в HEX"
            className="mt-2 w-full rounded-sm border border-rule bg-paper px-2 py-1.5 font-mono text-ink text-xs uppercase outline-none focus:border-accent"
          />
          {presets && presets.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {presets.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={hex}
                  title={hex}
                  onClick={() => pick(hex)}
                  style={{ backgroundColor: hex }}
                  className={`size-5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    shown === hex ? 'ring-2 ring-ink' : 'ring-1 ring-rule-strong'
                  }`}
                />
              ))}
            </div>
          ) : null}
          {mixed ? (
            <button
              type="button"
              disabled={draft === null}
              onClick={apply}
              // Кнопка живёт внутри <label> строки: без явного имени доступным
              // именем становится подпись строки, а не действие.
              aria-label={`Применить ко всем${count === undefined ? '' : ` (${count})`}`}
              className="mt-2 w-full rounded-sm bg-accent px-2 py-1.5 font-medium text-accent-ink text-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {draft === null
                ? 'Выберите цвет'
                : `Применить ко всем${count === undefined ? '' : ` (${count})`}`}
            </button>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
