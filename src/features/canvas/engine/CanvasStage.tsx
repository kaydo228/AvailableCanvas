/**
 * Сборка холста: измерение размера + жесты (зона 2) + сетка (зона 3)
 * + узлы + инструменты + оверлей ввода текста.
 *
 * Отдельные зоны про стор не знают, связывание живёт здесь.
 */

import type Konva from 'konva';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Layer, Stage } from 'react-konva';
import { AnchorHints } from '@/features/canvas/connectors/AnchorHints';
import { useConnectorTool } from '@/features/canvas/connectors/useConnectorTool';
import { EditingOverlay } from '@/features/canvas/nodes/EditingOverlay';
import { NodesLayer } from '@/features/canvas/nodes/NodesLayer';
import { PreviewNode } from '@/features/canvas/nodes/PreviewNode';
import { MarqueeRect } from '@/features/canvas/selection/MarqueeRect';
import { SelectionTransformer } from '@/features/canvas/selection/SelectionTransformer';
import { useImageInsert } from '@/features/canvas/tools/useImageInsert';
import { useToolController } from '@/features/canvas/tools/useToolController';
import { useBoardStore } from '@/shared/store/board';
import type { Size } from './contract';
import { GridLayer } from './GridLayer';
import { useCanvasGestures } from './useCanvasGestures';

const EMPTY_VIEWPORT = { x: 0, y: 0, zoom: 1 };

export type CanvasStageHandle = { captureThumbnail: () => Promise<void> };

export const CanvasStage = forwardRef<
  CanvasStageHandle,
  { onThumbnail?: (thumbnail: string) => void | Promise<void>; readOnly?: boolean }
>(function CanvasStage({ onThumbnail, readOnly = false }, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const konvaRef = useRef<Konva.Stage | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  const viewport = useBoardStore((s) => s.document?.viewport ?? EMPTY_VIEWPORT);
  const activeTool = useBoardStore((s) => s.activeTool);
  const editingNodeId = useBoardStore((s) => s.editingNodeId);
  const setViewport = useBoardStore((s) => s.setViewport);
  const setCanvasSize = useBoardStore((s) => s.setCanvasSize);

  const tools = useToolController(!readOnly);
  // Холст — единственная точка подписки на Cmd+V, см. ImageInsertOptions.
  const images = useImageInsert({ enabled: !readOnly, paste: true });
  const connectors = useConnectorTool(!readOnly);

  const captureThumbnail = useCallback(async () => {
    const stage = konvaRef.current;
    if (!stage || !onThumbnail) return;
    try {
      await onThumbnail(stage.toDataURL({ pixelRatio: 0.2 }));
    } catch (error) {
      console.warn('Не удалось создать превью проекта', error);
    }
  }, [onThumbnail]);

  useImperativeHandle(ref, () => ({ captureThumbnail }), [captureThumbnail]);

  // Первый замер синхронный, до ResizeObserver: тот срабатывает через кадр,
  // и вставка картинки сразу после открытия проекта успевала увидеть нулевой
  // размер холста — картинка ложилась в начало мировых координат вместо
  // центра экрана. Воспроизводилось ровно один раз, при первой вставке.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const next = { width: rect.width, height: rect.height };
      setSize(next);
      setCanvasSize(next);
    }
  }, [setCanvasSize]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      setSize(next);
      setCanvasSize(next);
    });

    observer.observe(host);
    return () => observer.disconnect();
  }, [setCanvasSize]);

  useEffect(() => {
    return () => {
      void captureThumbnail();
    };
  }, [captureThumbnail]);

  const { bind, cursor } = useCanvasGestures({
    viewport,
    size,
    onViewportChange: setViewport,
    handTool: activeTool === 'hand',
    // Во время ввода текста жесты выключены: пробел должен печататься,
    // а не панорамировать доску.
    disabled: editingNodeId !== null,
  });

  const gestureProps = bind() as { ref?: (el: HTMLDivElement | null) => void };

  return (
    <div
      // Холст принимает мышь и сброс файлов, поэтому это не «статический
      // элемент с обработчиком», а самостоятельное приложение внутри страницы.
      role="application"
      aria-label="Холст доски"
      {...gestureProps}
      {...(readOnly ? {} : { onDragOver: images.onDragOver, onDrop: images.onDrop })}
      ref={(el) => {
        hostRef.current = el;
        gestureProps.ref?.(el);
      }}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: tools.creating || connectors.active ? 'crosshair' : cursor,
        touchAction: 'none',
      }}
    >
      <Stage
        ref={(stage) => {
          konvaRef.current = stage;
        }}
        width={size.width}
        height={size.height}
        onMouseDown={(event) => {
          connectors.onMouseDown(event);
          tools.onMouseDown(event);
        }}
        onMouseMove={(event) => {
          connectors.onMouseMove(event);
          tools.onMouseMove(event);
        }}
        onMouseUp={(event) => {
          connectors.onMouseUp(event);
          tools.onMouseUp(event);
        }}
      >
        <GridLayer viewport={viewport} size={size} />
        <Layer x={viewport.x} y={viewport.y} scaleX={viewport.zoom} scaleY={viewport.zoom}>
          <NodesLayer readOnly={readOnly} />
          <PreviewNode node={tools.preview} />
        </Layer>

        {/*
          Выделение — отдельный слой Konva. В общем слое каждый клик и каждое
          движение рамки перерисовывали бы всю доску: на тысяче узлов это
          заметно сразу.
        */}
        <Layer x={viewport.x} y={viewport.y} scaleX={viewport.zoom} scaleY={viewport.zoom}>
          <MarqueeRect box={tools.marquee} />
          <AnchorHints hint={connectors.hint} draft={connectors.draft} />
          <SelectionTransformer readOnly={readOnly} />
        </Layer>
      </Stage>

      <EditingOverlay readOnly={readOnly} />
    </div>
  );
});
