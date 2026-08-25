import type { useBoardStore } from '@/shared/store/board';

declare global {
  interface Window {
    /** Ставится в main.tsx только при import.meta.env.DEV. */
    __board: typeof useBoardStore;
    /** Буфер замера в e2e/inspector.spec.ts. */
    __fills: string[];
    /** Замер в e2e/shortcuts.spec.ts. */
    __zPrevented: boolean | null;
  }
}
