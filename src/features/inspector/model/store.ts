/**
 * Состояние самой панели свойств — не документа.
 *
 * Свёрнутость панели не имеет отношения к доске и не должна ехать в
 * `shared/store/board.ts`: тот стор — контракт между зонами, и вид оболочки
 * там никому не нужен.
 */

import { create } from 'zustand';

interface InspectorState {
  /** Панель свёрнута в узкую полосу (6.1). */
  collapsed: boolean;
  toggleCollapsed(): void;
}

export const useInspector = create<InspectorState>()((set) => ({
  collapsed: false,
  toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
}));
