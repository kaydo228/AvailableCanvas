import { describe, expect, it } from 'vitest';

import {
  applyAspect,
  clampSize,
  keepsAspect,
  MIN_NODE_SIDE,
} from '@/features/canvas/selection/resize';
import { createImageNode } from '@/features/canvas/tools/imageTool';
import { stickyFromDrag } from '@/features/canvas/tools/stickyTool';
import { textFromDrag } from '@/features/canvas/tools/textTool';
import { shape } from '@/shared/model/fixtures';

const image = createImageNode(
  { blobId: 'b', naturalWidth: 400, naturalHeight: 200 },
  { x: 0, y: 0 },
);
const sticky = stickyFromDrag({ x: 0, y: 0 }, { x: 0, y: 0 }, false, 1);
const text = textFromDrag({ x: 0, y: 0 }, { x: 200, y: 100 }, 1);

describe('keepsAspect — правило пропорций по типам', () => {
  it('картинка: пропорции по умолчанию, Shift освобождает', () => {
    expect(keepsAspect(image, false)).toBe(true);
    expect(keepsAspect(image, true)).toBe(false);
  });

  it('фигура: свободно, Shift прижимает', () => {
    expect(keepsAspect(shape('a'), false)).toBe(false);
    expect(keepsAspect(shape('a'), true)).toBe(true);
  });

  it('текст: как фигура', () => {
    expect(keepsAspect(text, false)).toBe(false);
    expect(keepsAspect(text, true)).toBe(true);
  });

  it('стикер всегда квадратный, Shift на него не влияет', () => {
    expect(keepsAspect(sticky, false)).toBe(true);
    expect(keepsAspect(sticky, true)).toBe(true);
  });

  it('у картинки правило обратное правилу фигуры — это сознательно', () => {
    expect(keepsAspect(image, false)).not.toBe(keepsAspect(shape('a'), false));
    expect(keepsAspect(image, true)).not.toBe(keepsAspect(shape('a'), true));
  });
});

describe('applyAspect', () => {
  it('подогнанная рамка имеет заданные пропорции', () => {
    const box = applyAspect({ x: 0, y: 0, width: 400, height: 400 }, 2);
    expect(box.width / box.height).toBeCloseTo(2, 6);
  });

  it('не выходит за то, что натянул пользователь', () => {
    const box = applyAspect({ x: 0, y: 0, width: 400, height: 100 }, 2);
    expect(box.width).toBeLessThanOrEqual(400);
    expect(box.height).toBeLessThanOrEqual(100);
  });

  it('вырожденные значения возвращают рамку как есть', () => {
    const box = { x: 1, y: 2, width: 0, height: 10 };
    expect(applyAspect(box, 2)).toEqual(box);
    expect(applyAspect({ ...box, width: 10 }, 0)).toEqual({ ...box, width: 10 });
  });
});

describe('clampSize', () => {
  it('не даёт схлопнуть узел до неуловимого', () => {
    const box = clampSize({ x: 0, y: 0, width: 1, height: 0 });
    expect(box.width).toBe(MIN_NODE_SIDE);
    expect(box.height).toBe(MIN_NODE_SIDE);
  });

  it('нормальный размер не трогает', () => {
    const box = { x: 5, y: 5, width: 100, height: 50 };
    expect(clampSize(box)).toEqual(box);
  });
});
