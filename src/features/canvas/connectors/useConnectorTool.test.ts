import { act, cleanup, renderHook } from '@testing-library/react';
import type Konva from 'konva';
import { afterEach, expect, it } from 'vitest';
import { useToolController } from '@/features/canvas/tools/useToolController';
import { doc, shape } from '@/shared/model/fixtures';
import { useBoardStore } from '@/shared/store/board';
import { connectorPoints } from './routing';
import { useConnectorTool } from './useConnectorTool';

afterEach(cleanup);

it('прекращает создание фигуры, когда право редактирования отозвано во время жеста', () => {
  useBoardStore.getState().loadDocument(doc([]));
  useBoardStore.getState().setTool('rect');
  const before = useBoardStore.getState().document;
  const { result, rerender } = renderHook(({ enabled }) => useToolController(enabled), {
    initialProps: { enabled: true },
  });
  let pointer = { x: 50, y: 30 };
  const stage = { getPointerPosition: () => pointer, getStage: () => stage };
  const event = {
    target: stage,
    evt: { shiftKey: false },
  } as unknown as Konva.KonvaEventObject<MouseEvent>;
  act(() => result.current.onMouseDown(event));
  rerender({ enabled: false });
  pointer = { x: 250, y: 130 };
  act(() => result.current.onMouseMove(event));
  act(() => result.current.onMouseUp(event));
  expect(useBoardStore.getState().document).toBe(before);
});

it.each(['pen', 'connector'] as const)('не создаёт %s при отключённом редактировании', (tool) => {
  useBoardStore.getState().loadDocument(doc([shape('a'), shape('b', 400)]));
  useBoardStore.getState().setTool(tool);
  const before = useBoardStore.getState().document;
  const { result } = renderHook(() => useConnectorTool(false));
  let pointer = { x: 50, y: 30 };
  const stage = { getPointerPosition: () => pointer, getStage: () => stage };
  const event = { target: stage } as unknown as Konva.KonvaEventObject<MouseEvent>;
  act(() => result.current.onMouseDown(event));
  pointer = { x: 450, y: 30 };
  act(() => result.current.onMouseMove(event));
  act(() => result.current.onMouseUp(event));
  expect(useBoardStore.getState().document).toBe(before);
  expect(result.current.active).toBe(false);
  expect(result.current.draft).toBeNull();
});

it('Стрелка (P) создаёт связь, её предпросмотр совпадает с итоговым маршрутом', () => {
  useBoardStore.getState().loadDocument(doc([shape('a'), shape('b', 400), shape('wall', 200)]));
  useBoardStore.getState().setTool('pen');
  const { result } = renderHook(() => ({ links: useConnectorTool(), tools: useToolController() }));
  let pointer = { x: 50, y: 30 };
  const stage = { getPointerPosition: () => pointer, getStage: () => stage };
  const event = {
    target: stage,
    evt: { button: 0, shiftKey: false },
  } as unknown as Konva.KonvaEventObject<MouseEvent>;
  act(() => {
    result.current.links.onMouseDown(event);
    result.current.tools.onMouseDown(event);
  });
  pointer = { x: 450, y: 30 };
  act(() => {
    result.current.links.onMouseMove(event);
    result.current.tools.onMouseMove(event);
  });
  const preview = result.current.links.draft;
  expect(preview).not.toBeNull();
  act(() => {
    result.current.links.onMouseUp(event);
    result.current.tools.onMouseUp(event);
  });
  const document = useBoardStore.getState().document;
  if (!document) throw new Error('No document');
  const created = Object.values(document.nodes).filter(
    (node) => !['a', 'b', 'wall'].includes(node.id),
  );
  expect(created).toHaveLength(1);
  const link = created[0];
  if (!link) throw new Error('No connector');
  expect(link.type).toBe('connector');
  if (link.type !== 'connector') throw new Error('expected connector');
  expect(link.from.nodeId).toBe('a');
  expect(link.to.nodeId).toBe('b');
  expect(preview).toMatchObject({ points: connectorPoints(link, document) });
  expect(useBoardStore.getState().activeTool).toBe('select');
});
