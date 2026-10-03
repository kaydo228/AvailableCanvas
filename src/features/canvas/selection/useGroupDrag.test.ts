import { act, renderHook } from '@testing-library/react';
import type Konva from 'konva';
import { expect, it } from 'vitest';
import { doc, shape } from '@/shared/model/fixtures';
import { useBoardStore } from '@/shared/store/board';
import { useGroupDrag } from './useGroupDrag';

it('перемещает раздел вместе с детьми ровно один раз при множественном выделении', () => {
  const section = shape('section', 0, 0);
  section.design = {
    kind: 'section',
    title: 'Бой',
    description: '',
    children: ['child'],
    collapsed: false,
    readingOrder: 0,
  };
  useBoardStore.setState({
    document: doc([section, shape('child', 50, 50), shape('other', 300, 0)]),
    selection: ['section', 'child', 'other'],
  });
  let x = 0;
  const target = {
    id: () => 'section',
    x: () => x,
    y: () => 0,
    getStage: () => ({ findOne: () => null }),
  };
  const event = { target } as unknown as Konva.KonvaEventObject<DragEvent>;
  const { result } = renderHook(() => useGroupDrag());
  act(() => result.current.onDragStart(event));
  x = 20;
  act(() => result.current.onDragMove(event));
  x = 40;
  act(() => result.current.onDragMove(event));
  act(() => result.current.onDragEnd(event));
  const nodes = useBoardStore.getState().document?.nodes;
  expect(nodes?.child).toMatchObject({ x: 90, y: 50 });
  expect(nodes?.other).toMatchObject({ x: 340, y: 0 });
});
