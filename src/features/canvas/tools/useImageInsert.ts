/**
 * Три способа вставить картинку (FR-06): кнопка на панели, перетаскивание
 * файла на холст, Cmd/Ctrl+V из буфера.
 *
 * Все три сходятся в одну функцию: проверки формата и размера живут
 * в putImage (features/persistence), это граница доверия, и дублировать
 * их здесь нельзя — разъедутся.
 */

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import type { ScreenPoint, WorldPoint } from '@/features/canvas/engine/contract';
import { toWorld } from '@/features/canvas/engine/viewport';
import { ImageRejected, putImage } from '@/features/persistence';
import { useBoardStore } from '@/shared/store/board';

import { createImageNode } from './imageTool';

/** Насколько сдвигать каждую следующую картинку, если вставили пачку. */
const CASCADE_STEP = 24;

export interface ImageInsertOptions {
  /**
   * Вешать ли глобальный слушатель Cmd/Ctrl+V.
   *
   * Ровно один потребитель на экране должен сказать `true`. Хук зовут
   * и панель (ради кнопки), и холст (ради drop); если слушатель повесят
   * оба, одна вставка создаст две картинки. Ровно это и случилось
   * при первой проверке.
   */
  paste?: boolean;
}

export function useImageInsert({ paste = false }: ImageInsertOptions = {}) {
  const addNode = useBoardStore((s) => s.addNode);
  const select = useBoardStore((s) => s.select);
  const setTool = useBoardStore((s) => s.setTool);
  const editingNodeId = useBoardStore((s) => s.editingNodeId);

  // Читаем через getState в момент вызова: вид и размер меняются часто,
  // а подписываться на них ради обработчика вставки незачем.
  const centerOfView = useCallback((): WorldPoint => {
    const { document, canvasSize } = useBoardStore.getState();
    const viewport = document?.viewport ?? { x: 0, y: 0, zoom: 1 };
    return toWorld({ x: canvasSize.width / 2, y: canvasSize.height / 2 }, viewport);
  }, []);

  const insertFiles = useCallback(
    async (files: File[], at?: WorldPoint) => {
      const images = files.filter((file) => file.type.startsWith('image/'));
      if (images.length === 0) {
        if (files.length > 0) {
          toast.error('Это не картинка. Можно PNG, JPEG, GIF, SVG и WebP.');
        }
        return;
      }

      const origin = at ?? centerOfView();
      let inserted = 0;

      for (const [index, file] of images.entries()) {
        try {
          const stored = await putImage(file);
          const node = createImageNode(stored, {
            x: origin.x + index * CASCADE_STEP,
            y: origin.y + index * CASCADE_STEP,
          });
          addNode(node);
          select([node.id]);
          inserted += 1;
        } catch (error) {
          // Отказ должен быть с человеческим текстом, а не молчанием:
          // putImage уже сформулировал причину, показываем её как есть.
          toast.error(
            error instanceof ImageRejected ? error.message : `Не удалось вставить «${file.name}».`,
          );
        }
      }

      // Инструмент возвращается к «Выбору», как и у остальных типов.
      if (inserted > 0) setTool('select');
    },
    [addNode, centerOfView, select, setTool],
  );

  /** Кнопка на панели: системный диалог выбора файла. */
  const pickFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/svg+xml,image/webp';
    input.multiple = true;
    input.onchange = () => {
      void insertFiles(Array.from(input.files ?? []));
    };
    input.click();
  }, [insertFiles]);

  /** Перетаскивание файла на холст. */
  const hostRef = useRef<HTMLElement | null>(null);

  const onDragOver = useCallback((event: React.DragEvent) => {
    if (event.dataTransfer.types.includes('Files')) {
      // Без preventDefault браузер откроет файл в соседней вкладке.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();

      const { document: doc } = useBoardStore.getState();
      const viewport = doc?.viewport ?? { x: 0, y: 0, zoom: 1 };
      const rect = event.currentTarget.getBoundingClientRect();
      // Точка сброса относительно холста, а не окна.
      const point: ScreenPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      void insertFiles(files, toWorld(point, viewport));
    },
    [insertFiles],
  );

  /**
   * Cmd/Ctrl+V. Самый частый способ, поэтому слушатель на window:
   * пользователь жмёт вставку, не целясь предварительно в холст.
   *
   * Во время ввода текста не перехватываем: там вставляют текст.
   */
  useEffect(() => {
    if (!paste) return;

    const onPaste = (event: ClipboardEvent) => {
      if (editingNodeId) return;

      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;

      event.preventDefault();
      void insertFiles(files);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [editingNodeId, insertFiles, paste]);

  return { pickFile, onDragOver, onDrop, hostRef, insertFiles };
}
