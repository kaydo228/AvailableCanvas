import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { CanvasStage } from '@/features/canvas/engine/CanvasStage';
import { Toolbar } from '@/app/Toolbar';
import { useBoardStore } from '@/shared/store/board';
import type { BoardDocument } from '@/shared/types/document';

const EMPTY_BOARD: BoardDocument = {
  projectId: 'demo',
  schemaVersion: 1,
  nodes: {},
  order: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  background: { color: '#fbfbfd', grid: 'dots' },
};

function App() {
  const loadDocument = useBoardStore((s) => s.loadDocument);
  const setTool = useBoardStore((s) => s.setTool);
  const editing = useBoardStore((s) => s.editingNodeId);

  useEffect(() => {
    loadDocument(structuredClone(EMPTY_BOARD));
  }, [loadDocument]);

  // Горячие клавиши инструментов из раздела 6.2 ТЗ. Во время ввода текста
  // выключены — иначе слово «view» переключает инструменты.
  useEffect(() => {
    const keys: Record<string, string> = {
      v: 'select', h: 'hand', s: 'sticky', t: 'text',
      r: 'rect', o: 'ellipse', d: 'diamond',
    };
    const onKey = (event: KeyboardEvent) => {
      if (editing) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const tool = keys[event.key.toLowerCase()];
      if (tool) setTool(tool as never);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, setTool]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fbfbfd' }}>
      <Toolbar />
      <CanvasStage />
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
