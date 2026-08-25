/** Показ сочетания под платформу: на маке ⌘, в остальных местах Ctrl. */

export const isMac = (platform = navigator.platform): boolean => /Mac|iPhone|iPad/.test(platform);

/** `$mod+Shift+Z` → `⌘⇧Z` на маке, `Ctrl+Shift+Z` в остальных случаях. */
export const formatHint = (hint: string, mac = isMac()): string => {
  if (!mac) return hint.replace('$mod', 'Ctrl');
  return hint.replace('$mod+', '⌘').replace('Shift+', '⇧').replace('$mod', '⌘');
};
