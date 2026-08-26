/**
 * Временная панель инструментов для проверки движка руками.
 * Настоящую панель делает зона B — здесь минимум, чтобы переключать
 * инструменты и видеть, что они работают.
 */

import { useImageInsert } from '@/features/canvas/tools/useImageInsert';
import type { Tool } from '@/shared/store/board';
import { useBoardStore } from '@/shared/store/board';

const TOOLS: Array<{ id: Tool; label: string; hotkey: string }> = [
  { id: 'select', label: 'Выбор', hotkey: 'V' },
  { id: 'hand', label: 'Рука', hotkey: 'H' },
  { id: 'sticky', label: 'Стикер', hotkey: 'S' },
  { id: 'text', label: 'Текст', hotkey: 'T' },
  { id: 'rect', label: 'Прямоугольник', hotkey: 'R' },
  { id: 'ellipse', label: 'Эллипс', hotkey: 'O' },
  { id: 'diamond', label: 'Ромб', hotkey: 'D' },
  { id: 'connector', label: 'Линия', hotkey: 'L' },
];

export function Toolbar() {
  const { pickFile } = useImageInsert();
  const activeTool = useBoardStore((s) => s.activeTool);
  const setTool = useBoardStore((s) => s.setTool);
  const zoom = useBoardStore((s) => s.document?.viewport.zoom ?? 1);
  const zoomToFit = useBoardStore((s) => s.zoomToFit);
  const count = useBoardStore((s) => s.document?.order.length ?? 0);

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 10,
        display: 'flex',
        gap: 4,
        padding: 6,
        borderRadius: 10,
        background: '#ffffff',
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 13,
      }}
    >
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          onClick={() => setTool(tool.id)}
          title={`${tool.label} (${tool.hotkey})`}
          style={{
            padding: '6px 10px',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            background: activeTool === tool.id ? '#2f6fed' : '#f1f3f5',
            color: activeTool === tool.id ? '#ffffff' : '#111827',
          }}
        >
          {tool.label}
        </button>
      ))}
      <button
        type="button"
        onClick={pickFile}
        title="Картинка (I) — или перетащите файл на холст, или Cmd+V"
        style={{
          padding: '6px 10px',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          background: '#f1f3f5',
          color: '#111827',
        }}
      >
        Картинка
      </button>
      <span style={{ alignSelf: 'center', padding: '0 8px', color: '#6b7280' }}>
        {Math.round(zoom * 100)}% · узлов: {count}
      </span>
      <button
        type="button"
        onClick={zoomToFit}
        style={{
          padding: '6px 10px',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          background: '#f1f3f5',
        }}
      >
        Вписать
      </button>
    </div>
  );
}
