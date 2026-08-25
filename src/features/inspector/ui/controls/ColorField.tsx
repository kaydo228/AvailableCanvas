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
      <Popover.Trigger className="flex w-full items-center gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs outline-none hover:bg-neutral-50 focus-visible:border-neutral-400">
        <span
          className="size-4 shrink-0 rounded ring-1 ring-black/10"
          style={value === undefined ? undefined : { backgroundColor: value }}
        />
        <span className="font-mono text-neutral-700">{value ?? 'разные'}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg"
        >
          <HexColorPicker color={value ?? '#ffffff'} onChange={onChange} />
          <HexColorInput
            color={value ?? ''}
            onChange={onChange}
            prefixed
            aria-label="Цвет в HEX"
            className="mt-2 w-full rounded border border-neutral-200 px-2 py-1 font-mono text-xs uppercase outline-none focus:border-neutral-400"
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
                  className={`size-5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                    value === hex ? 'ring-2 ring-neutral-800' : 'ring-1 ring-black/10'
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
