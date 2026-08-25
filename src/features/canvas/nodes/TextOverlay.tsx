/**
 * Общий оверлей ввода текста для всех типов узлов: подпись фигуры,
 * текстовый узел, стикер.
 *
 * Почему оверлей, а не Konva: редактируемого текста в Konva нет. Стандартный
 * приём — обычный <textarea> абсолютом поверх канваса, позиция считается
 * из мировых координат через toScreen. По blur значение уезжает в узел
 * и оверлей убирается.
 *
 * Оверлей один на все типы намеренно. Три отдельных разъезжаются по поведению
 * (где-то Escape отменяет, где-то нет), и пользователь это чувствует.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { Rect } from '@/features/canvas/engine/contract';
import { toScreen } from '@/features/canvas/engine/viewport';
import type { TextStyle, Viewport } from '@/shared/types/document';

export interface TextOverlayProps {
  /** Мировая рамка редактируемого узла. */
  box: Rect;
  viewport: Viewport;
  style: TextStyle;
  /** Вертикальное выравнивание: подпись фигуры по центру, текстовый узел сверху. */
  verticalAlign?: 'center' | 'top';
  /** Отступ внутри рамки в мировых единицах. */
  padding?: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export function TextOverlay({
  box,
  viewport,
  style,
  verticalAlign = 'center',
  padding = 8,
  onCommit,
  onCancel,
}: TextOverlayProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(style.value);
  // Ref, чтобы обработчик blur не закрывался на устаревшем значении.
  const committed = useRef(false);

  // Высота подгоняется под содержимое: textarea сама не растёт, а без роста
  // вертикальное центрирование считать не от чего.
  const autoGrow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    autoGrow();
    el.focus();
    el.select();
  }, [autoGrow]);

  useLayoutEffect(autoGrow, [autoGrow, value]);

  // Escape отменяет, Cmd/Ctrl+Enter подтверждает. Одиночный Enter — перенос
  // строки: на доске текст многострочный чаще, чем однострочный.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        committed.current = true;
        onCancel();
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        committed.current = true;
        onCommit(ref.current?.value ?? value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onCommit, value]);

  const topLeft = toScreen({ x: box.x + padding, y: box.y + padding }, viewport);
  const width = Math.max(0, (box.width - padding * 2) * viewport.zoom);
  const height = Math.max(0, (box.height - padding * 2) * viewport.zoom);

  return (
    // Центрирование по вертикали делает ОБЁРТКА, а не сама textarea:
    // display:flex на textarea не центрирует её содержимое — текст всё равно
    // прижимается к верху. Флексбоксом управляем внешним блоком, а поле
    // внутри растёт по содержимому.
    <div
      style={{
        position: 'absolute',
        left: topLeft.x,
        top: topLeft.y,
        width,
        height,
        display: 'flex',
        alignItems: verticalAlign === 'center' ? 'center' : 'flex-start',
        pointerEvents: 'none',
      }}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (committed.current) return;
          committed.current = true;
          onCommit(value);
        }}
        spellCheck={false}
        rows={1}
        style={{
          width: '100%',
          margin: 0,
          padding: 0,
          border: 'none',
          outline: 'none',
          resize: 'none',
          overflow: 'hidden',
          background: 'transparent',
          pointerEvents: 'auto',
          color: style.color,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: style.fontSize * viewport.zoom,
          lineHeight: style.lineHeight ?? 1.3,
          fontWeight: style.bold ? 600 : 400,
          fontStyle: style.italic ? 'italic' : 'normal',
          textAlign: style.align,
        }}
      />
    </div>
  );
}
