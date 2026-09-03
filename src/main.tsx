import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/index.css';

import { Router } from '@/app/router';
import { initSession } from '@/features/cloud';
import { sweepBlobs } from '@/features/persistence';
import { useBoardStore } from '@/shared/store/board';

// Кто вошёл — спрашиваем один раз при старте, до первого рендера шапки:
// initSession сам разберётся, что делать без облака (см. cloud/model/session.ts).
initSession();

// Ручка для e2e: сценарии NFR-03 набивают доску тысячей узлов, кликами это
// не делается. Только в dev — в собранный бандл не попадает.
if (import.meta.env.DEV) {
  (window as unknown as { __board: typeof useBoardStore }).__board = useBoardStore;
}

// Уборка осиротевших картинок — один раз за загрузку и в фоне: до появления
// сборки мусора картинки удалённых проектов оставались в базе навсегда,
// и у пользователя они уже накопились. Отказ здесь ничему не мешает —
// подметём в следующий раз.
void sweepBlobs().catch((error: unknown) => {
  console.warn('Не удалось подмести осиротевшие картинки', error);
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
