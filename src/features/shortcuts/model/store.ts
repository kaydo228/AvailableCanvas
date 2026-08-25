/** Состояние экрана справки по клавишам. Своё, не в общем сторе. */

import { create } from 'zustand';

interface ShortcutsState {
  helpOpen: boolean;
  openHelp(): void;
  closeHelp(): void;
  toggleHelp(): void;
}

export const useShortcutsUI = create<ShortcutsState>()((set) => ({
  helpOpen: false,
  openHelp: () => set({ helpOpen: true }),
  closeHelp: () => set({ helpOpen: false }),
  toggleHelp: () => set((state) => ({ helpOpen: !state.helpOpen })),
}));
