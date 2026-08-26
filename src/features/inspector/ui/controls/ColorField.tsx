/**
 * Цвет: react-colorful в radix-поповере.
 *
 * Кнопки «Применить» нет и быть не должно (FR-09). onChange пикера прокинут
 * наружу напрямую — react-colorful зовёт его на каждое движение указателя,
 * поэтому цвет узла едет за курсором. Локального стейта с подтверждением тут
 * специально не заводится: он и есть та самая отложенная «Применить».
 */

import { Popover } from 'radix-ui';
import { HexColorInput, HexColorPicker } from 'react-colorful';

export interface ColorFieldProps {
  value: string | undefined;
  onChange: (hex: string) => void;
  presets?: readonly string[];
}

export function ColorField({ value, onChange, presets }: ColorFieldProps) {
  return (
    <Popover.Root>
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
          <HexColorPicker color={value ?? '#ffffff'} onChange={onChange} />
          <HexColorInput
            color={value ?? ''}
            onChange={onChange}
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
                  onClick={() => onChange(hex)}
                  style={{ backgroundColor: hex }}
                  className={`size-5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    value === hex ? 'ring-2 ring-ink' : 'ring-1 ring-rule-strong'
                  }`}
                />
              ))}
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
