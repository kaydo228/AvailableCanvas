/** Индикатор состояния сохранения в шапке холста (FR-11, 6.1). */

import { Check, CloudOff, Loader2 } from 'lucide-react';

import { useSaveStatus } from './autosave';

const TEXT = {
  saving: 'Сохранение…',
  saved: 'Все изменения сохранены',
  error: 'Не удалось сохранить',
} as const;

export const SaveIndicator = () => {
  const status = useSaveStatus((s) => s.status);

  // До первой правки писать «Все изменения сохранены» — обещание, которого
  // мы не давали: сохранять было нечего.
  if (status === 'idle') return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${
        status === 'error' ? 'text-red-600' : 'text-slate-500'
      }`}
      // Спокойное объявление: индикатор меняется часто, assertive заспамил бы скринридер.
      aria-live="polite"
    >
      {status === 'saving' && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {status === 'saved' && <Check className="size-3.5" aria-hidden="true" />}
      {status === 'error' && <CloudOff className="size-3.5" aria-hidden="true" />}
      {TEXT[status]}
    </span>
  );
};
