/**
 * Контролы панели свойств (FR-09). Только поля — ни секций-по-типам, ни самой
 * панели здесь нет, их собирают соседние файлы из этих кубиков.
 *
 * Сквозное правило: `value === undefined` значит «у выделенных объектов
 * значения разные», а не «пусто». Поле показывает плейсхолдер и НЕ подставляет
 * значение первого узла — подставить его и дать молча применить ко всем это
 * потерянные данные. Как только пользователь ввёл своё, onChange уходит и
 * применяется ко всему выделению.
 */

import { Check } from 'lucide-react';
import { Label, Slider, Switch, ToggleGroup } from 'radix-ui';
import { type ReactNode, useId, useState } from 'react';

const clamp = (n: number, min?: number, max?: number): number =>
  Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, n));

/** Дробный хвост от поворотов и масштаба в поле не нужен. */
const format = (n: number): string => String(Math.round(n * 100) / 100);

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-neutral-200 px-3 py-3 last:border-b-0">
      <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

export function Row({
  label,
  children,
  stack = false,
}: {
  label: string;
  children: ReactNode;
  stack?: boolean;
}) {
  // stack — для контролов, которым не хватает половины строки: сегментированный
  // переключатель из трёх словесных вариантов в 170 px подрезается.
  if (stack) {
    // Намеренно div, а не Label.Root: в stack живут ГРУППЫ (сегментированный
    // переключатель, палитра). Обёртка в <label> склеивает имя каждого radio
    // из подписи и текста всех соседей — «СеткаТочкиЛинииБез сетки».
    return (
      <fieldset className="min-w-0 text-xs">
        <legend className="mb-1 text-neutral-500">{label}</legend>
        {children}
      </fieldset>
    );
  }

  return (
    <Label.Root className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-neutral-500">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </Label.Root>
  );
}

export interface NumberFieldProps {
  value: number | undefined;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Пока поле в фокусе, живёт строковый черновик, наружу число уходит по blur и
 * по Enter. Без черновика набор «12» в поле с min=8 схлопнулся бы на первом
 * символе: «1» зажалось бы до 8 прямо под пальцами.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  placeholder = '—',
  disabled,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const text = draft.trim().replace(',', '.');
    const parsed = Number(text);
    // Пусто или мусор — тихо откатываемся к значению узла, NaN наружу не отдаём.
    if (text === '' || !Number.isFinite(parsed)) return;
    const next = clamp(parsed, min, max);
    if (next !== value) onChange(next);
  };

  return (
    <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 focus-within:border-neutral-400">
      <input
        type="number"
        className="w-full min-w-0 bg-transparent text-xs text-neutral-900 tabular-nums outline-none disabled:text-neutral-400"
        value={draft ?? (value === undefined ? '' : format(value))}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
          if (event.key === 'Escape') setDraft(null);
        }}
      />
      {suffix ? <span className="shrink-0 text-[11px] text-neutral-400">{suffix}</span> : null}
    </div>
  );
}

export interface SliderFieldProps {
  value: number | undefined;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}

export function SliderField({ value, onChange, min, max, step, suffix }: SliderFieldProps) {
  return (
    <div className={`flex items-center gap-2 ${value === undefined ? 'opacity-60' : ''}`}>
      <Slider.Root
        className="relative flex h-4 flex-1 touch-none items-center select-none"
        min={min}
        max={max}
        step={step}
        value={[value ?? min]}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next);
        }}
      >
        <Slider.Track className="relative h-1 w-full grow rounded-full bg-neutral-200">
          <Slider.Range className="absolute h-full rounded-full bg-neutral-800" />
        </Slider.Track>
        <Slider.Thumb
          aria-label="Значение"
          className="block size-3.5 rounded-full border border-neutral-300 bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        />
      </Slider.Root>
      <span className="w-10 shrink-0 text-right text-xs text-neutral-500 tabular-nums">
        {value === undefined ? '—' : `${format(value)}${suffix ?? ''}`}
      </span>
    </div>
  );
}

export interface ToggleFieldProps {
  checked: boolean | undefined;
  onChange: (next: boolean) => void;
  label?: string;
}

export function ToggleField({ checked, onChange, label }: ToggleFieldProps) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Switch.Root
        id={id}
        checked={checked === true}
        onCheckedChange={onChange}
        title={checked === undefined ? 'Разные значения' : undefined}
        className={`relative h-5 w-9 shrink-0 rounded-full bg-neutral-300 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 data-[state=checked]:bg-neutral-800 ${
          checked === undefined ? 'opacity-60' : ''
        }`}
      >
        <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-4" />
      </Switch.Root>
      {label ? (
        <Label.Root htmlFor={id} className="text-xs text-neutral-600">
          {label}
        </Label.Root>
      ) : null}
    </div>
  );
}

export interface SegmentedFieldProps {
  value: string | undefined;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string; icon?: ReactNode }>;
}

export function SegmentedField({ value, onChange, options }: SegmentedFieldProps) {
  return (
    <ToggleGroup.Root
      type="single"
      // Пустая строка = «разные»: ни один сегмент не подсвечен.
      value={value ?? ''}
      onValueChange={(next) => {
        // Radix отдаёт '' при повторном клике по активному — снимать выбор нечем.
        if (next !== '') onChange(next);
      }}
      className="flex w-full gap-0.5 rounded-md bg-neutral-100 p-0.5"
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          title={option.label}
          className="flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded px-1.5 py-1 text-xs text-neutral-600 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 data-[state=on]:bg-white data-[state=on]:text-neutral-900 data-[state=on]:shadow-sm"
        >
          {option.icon}
          {option.icon ? <span className="sr-only">{option.label}</span> : option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export interface SwatchFieldProps {
  value: string | undefined;
  onChange: (hex: string) => void;
  colors: ReadonlyArray<{ fill: string; label: string }>;
}

export function SwatchField({ value, onChange, colors }: SwatchFieldProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((color) => (
        <button
          key={color.fill}
          type="button"
          title={color.label}
          aria-label={color.label}
          aria-pressed={value === color.fill}
          onClick={() => onChange(color.fill)}
          style={{ backgroundColor: color.fill }}
          className={`flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
            value === color.fill ? 'ring-2 ring-neutral-800' : 'ring-1 ring-black/10'
          }`}
        >
          {value === color.fill ? (
            <Check className="size-3.5 text-neutral-900" strokeWidth={3} />
          ) : null}
        </button>
      ))}
    </div>
  );
}
