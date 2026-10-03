import { Link2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { useBoardStore } from '@/shared/store/board';

export const IMPLEMENTATION_LABELS = {
  'not-started': 'Не начато',
  'in-progress': 'В работе',
  done: 'Готово',
} as const;

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: Every caller supplies a native input, select or textarea as children.
  <label className="design-field">
    <span>{label}</span>
    {children}
  </label>
);
export const Options = ({ values }: { values: Record<string, string> }) => (
  <>
    {Object.entries(values).map(([value, label]) => (
      <option key={value} value={value}>
        {label}
      </option>
    ))}
  </>
);

export const CopyNodeLink = ({ id }: { id: string }) => (
  <button
    type="button"
    className="design-button"
    onClick={async () => {
      const url = new URL(window.location.href);
      url.searchParams.set('node', id);
      try {
        await navigator.clipboard.writeText(url.toString());
        toast.success('Ссылка на объект скопирована');
      } catch {
        toast.error('Не удалось скопировать ссылку', {
          description: 'Проверьте разрешение браузера на буфер обмена.',
        });
      }
    }}
  >
    <Link2 size={14} aria-hidden="true" />
    Скопировать ссылку
  </button>
);

/** Content panels do not depend on the camera. Subscribe to the persisted content
 * identities, then read the current document rather than retaining an old viewport. */
export const useDesignDocument = () => {
  useBoardStore(
    useShallow((state) => {
      const document = state.document;
      return [
        document?.projectId,
        document?.nodes,
        document?.order,
        document?.background,
        document?.versions,
      ];
    }),
  );
  return useBoardStore.getState().document;
};
