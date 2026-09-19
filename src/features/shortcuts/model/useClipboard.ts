/**
 * Копирование и вставка объектов доски (ТЗ, 6.3).
 *
 * Обработчики висят на СОБЫТИЯХ `copy` и `paste`, а не на клавишах в общей
 * таблице, и это не мелочь:
 *
 * - системный буфер — единственное состояние, которое здесь есть. Свой буфер
 *   в памяти устаревал бы молча: скопировали объект, потом скопировали текст
 *   в редакторе, вернулись и вставили — появился бы объект, а не текст;
 * - `event.clipboardData` доступен синхронно и без разрешений, в отличие
 *   от `navigator.clipboard.readText()`, который в Firefox и Safari просит
 *   у пользователя доступ;
 * - Cmd/Ctrl+V картинкой уже занят (`useImageInsert`, зона A). Перехвати мы
 *   нажатие клавиш, событие `paste` до него бы не дошло, и вставка картинок
 *   отвалилась бы. Здесь оба обработчика живут рядом и делят случаи по
 *   содержимому буфера: файлы — картинке, наш JSON — сюда.
 *
 * Формат — обычный текст: JSON с маркером. Так вставка работает между
 * вкладками и проектами, переживает перезагрузку и не требует ничего,
 * кроме буфера операционной системы.
 */

import { useEffect } from 'react';
import { z } from 'zod';

import { nodeSchema } from '@/features/export/lib/fileFormat';
import { nodesToCopy } from '@/shared/model/operations';
import { useBoardStore } from '@/shared/store/board';
import type { Node } from '@/shared/types/document';

import { isTypingTarget } from '../lib/typing';

const FORMAT = 'prostor-nodes';

/** Шаг каскада при повторной вставке. Тот же, что у сетки и у Cmd+D. */
const CASCADE_STEP = 24;

const payloadSchema = z.object({
  format: z.literal(FORMAT),
  version: z.literal(1),
  nodes: z.array(nodeSchema).min(1),
});

/**
 * Разбор буфера. Текст пришёл извне — из чужой вкладки, из чужой версии
 * приложения, из редактора, где его правили руками. Это граница доверия,
 * поэтому схема та же, что у импорта файла.
 */
export const parseClipboard = (text: string): Node[] | null => {
  if (!text.includes(FORMAT)) return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(text));
    return parsed.success ? (parsed.data.nodes as Node[]) : null;
  } catch {
    return null;
  }
};

export const serializeNodes = (nodes: Node[]): string =>
  JSON.stringify({ format: FORMAT, version: 1, nodes });

export const useClipboard = (enabled = true): void => {
  useEffect(() => {
    if (!enabled) return;
    const board = useBoardStore;

    // Каскад: вторая вставка того же буфера не должна лечь ровно на первую.
    let lastPasted = '';
    let repeats = 0;

    /** Во время ввода буфер принадлежит тексту, а не доске. */
    const typing = (event: ClipboardEvent) =>
      board.getState().editingNodeId !== null || isTypingTarget(event.target);

    const onCopy = (event: ClipboardEvent) => {
      if (typing(event)) return;

      const state = board.getState();
      const document = state.document;
      if (!document || state.selection.length === 0) return;

      const ids = nodesToCopy(document, state.selection);
      const nodes = ids.map((id) => document.nodes[id]).filter((node) => node !== undefined);
      if (nodes.length === 0) return;

      // preventDefault ставится только когда есть что положить: иначе мы бы
      // забирали Cmd+C у страницы, ничего не дав взамен.
      event.preventDefault();
      event.clipboardData?.setData('text/plain', serializeNodes(nodes));
    };

    const onPaste = (event: ClipboardEvent) => {
      if (typing(event)) return;
      // Файлы — это картинка, ей занимается useImageInsert.
      if ((event.clipboardData?.files.length ?? 0) > 0) return;

      const text = event.clipboardData?.getData('text/plain') ?? '';
      const nodes = parseClipboard(text);
      if (!nodes) return;

      event.preventDefault();
      const created = board.getState().pasteNodes(nodes);
      if (created.length === 0) return;

      repeats = text === lastPasted ? repeats + 1 : 0;
      lastPasted = text;
      if (repeats > 0) {
        const shift = repeats * CASCADE_STEP;
        board.getState().moveNodes(created, shift, shift);
      }
    };

    window.addEventListener('copy', onCopy);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('paste', onPaste);
    };
  }, [enabled]);
};
