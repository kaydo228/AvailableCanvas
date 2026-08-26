import { describe, expect, it } from 'vitest';

import { nodesInBox, rectsIntersect } from '@/features/canvas/selection/marquee';
import { connector, doc, shape } from '@/shared/model/fixtures';

describe('rectsIntersect', () => {
  const base = { x: 0, y: 0, width: 100, height: 100 };

  it('пересечение углом считается', () => {
    expect(rectsIntersect(base, { x: 90, y: 90, width: 50, height: 50 })).toBe(true);
  });

  it('полное накрытие считается', () => {
    expect(rectsIntersect(base, { x: -10, y: -10, width: 200, height: 200 })).toBe(true);
  });

  it('касание краями не считается пересечением', () => {
    expect(rectsIntersect(base, { x: 100, y: 0, width: 50, height: 50 })).toBe(false);
  });

  it('непересекающиеся не считаются', () => {
    expect(rectsIntersect(base, { x: 200, y: 200, width: 10, height: 10 })).toBe(false);
  });
});

describe('nodesInBox', () => {
  it('рамка задела узел частично — узел выделяется', () => {
    // Полное накрытие требовать нельзя: большую картинку пришлось бы
    // обводить целиком, а это неудобно.
    const d = doc([shape('a', 0, 0)]);
    expect(nodesInBox(d, { x: 50, y: 30, width: 200, height: 200 })).toEqual(['a']);
  });

  it('узел вне рамки не попадает', () => {
    const d = doc([shape('a', 0, 0)]);
    expect(nodesInBox(d, { x: 500, y: 500, width: 50, height: 50 })).toEqual([]);
  });

  it('результат идёт в порядке отрисовки', () => {
    const d = doc([shape('a', 0, 0), shape('b', 50, 0), shape('c', 100, 0)]);
    expect(nodesInBox(d, { x: -10, y: -10, width: 400, height: 400 })).toEqual(['a', 'b', 'c']);
  });

  it('заблокированный узел рамкой не берётся', () => {
    const locked = shape('a', 0, 0);
    locked.locked = true;
    const d = doc([locked, shape('b', 0, 0)]);
    expect(nodesInBox(d, { x: -10, y: -10, width: 400, height: 400 })).toEqual(['b']);
  });

  it('коннектор рамкой не берётся: у него нет прямоугольника', () => {
    const d = doc([shape('a'), shape('b'), connector('c', 'a', 'b')]);
    const hits = nodesInBox(d, { x: -1000, y: -1000, width: 5000, height: 5000 });
    expect(hits).not.toContain('c');
  });

  it('пустая рамка никого не берёт', () => {
    const d = doc([shape('a', 0, 0)]);
    expect(nodesInBox(d, { x: 10, y: 10, width: 0, height: 0 })).toEqual([]);
  });
});
