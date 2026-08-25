import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/index.css';

import { Router } from '@/app/router';
import { useBoardStore } from '@/shared/store/board';

// Ручка для e2e: сценарии NFR-03 набивают доску тысячей узлов, кликами это
// не делается. Только в dev — в собранный бандл не попадает.
if (import.meta.env.DEV) {
  (window as unknown as { __board: typeof useBoardStore }).__board = useBoardStore;
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
