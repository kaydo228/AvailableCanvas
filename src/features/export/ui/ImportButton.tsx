/**
 * Импорт файла доски на экране списка (FR-12).
 *
 * Файл всегда открывается НОВЫМ проектом, поэтому кнопка живёт рядом
 * с «Создать проект», а не внутри доски: это способ завести доску, а не
 * изменить открытую.
 */

import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { describeRepairs } from '@/features/persistence/repair';
import { importJson } from '../model/transfer';

export function ImportButton() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const onPick = (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);

    void importJson(file)
      .then(({ project, repairs }) => {
        // Починки не прячем: файл открылся не таким, каким его отдавали,
        // и узнать об этом человек должен здесь, а не по кривой доске.
        if (repairs.length > 0) {
          toast.warning(`Доска «${project.name}» открыта, но файл пришлось поправить`, {
            description: describeRepairs(repairs),
            duration: 15_000,
          });
        } else {
          toast.success(`Доска «${project.name}» открыта`);
        }
        void navigate(`/p/${project.id}`);
      })
      .catch((error: unknown) => {
        // Текст ошибки — часть контракта импорта: в нём написано, что именно
        // не так с файлом. Подменять его на «что-то пошло не так» нельзя.
        toast.error(error instanceof Error ? error.message : 'Файл не удалось открыть', {
          duration: 10_000,
        });
      })
      .finally(() => {
        setBusy(false);
        // Сброс значения: иначе повторный выбор того же файла не даёт change.
        if (inputRef.current) inputRef.current.value = '';
      });
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => onPick(event.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-pencil text-sm transition-colors hover:bg-well hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
      >
        <Upload size={16} aria-hidden />
        {busy ? 'Открываем…' : 'Импорт JSON'}
      </button>
    </>
  );
}
