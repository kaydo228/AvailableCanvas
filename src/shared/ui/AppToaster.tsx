/**
 * Тосты приложения. Своя обёртка нужна из-за темы: sonner рисует себя вне
 * нашего дерева и про `data-theme` не знает, поэтому тему ему передают руками.
 *
 * «Системную» разворачиваем сами, а не отдаём sonner значение 'system': он
 * зовёт matchMedia без проверок и падает в jsdom, где тестируются диалоги.
 */

import { Toaster } from 'sonner';

import { type Theme, useTheme } from './theme';

// ponytail: смену системной темы на лету тост не подхватит — только при
// следующем рендере. Понадобится живее — подписаться на matchMedia.
const resolve = (theme: Theme): 'light' | 'dark' => {
  if (theme !== 'system') return theme;
  const dark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'light';
};

export const AppToaster = () => {
  const theme = useTheme();
  return <Toaster position="bottom-right" richColors closeButton theme={resolve(theme)} />;
};
