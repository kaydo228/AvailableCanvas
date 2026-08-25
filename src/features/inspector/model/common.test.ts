import { describe, expect, test } from 'vitest';

import type { ConnectorNode, Node, ShapeNode, StickyNode, TextNode } from '@/shared/types/document';
import { commonFields, inspectorMode, sharedValue, textStyleKey } from './common';

const style = (value: string) =>
  ({ value, fontSize: 14, color: '#111111', align: 'left' }) as const;

const shape = (id: string, fill = '#ffffff'): ShapeNode => ({
  id,
  type: 'shape',
  shape: 'rect',
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  rotation: 0,
  opacity: 1,
  locked: false,
  fill,
  stroke: '#111111',
  strokeWidth: 2,
});

const sticky = (id: string, fill = '#FEF3A8'): StickyNode => ({
  id,
  type: 'sticky',
  x: 0,
  y: 0,
  width: 180,
  height: 180,
  rotation: 0,
  opacity: 1,
  locked: false,
  fill,
  text: style('заметка'),
});

const text = (id: string): TextNode => ({
  id,
  type: 'text',
  x: 0,
  y: 0,
  width: 200,
  height: 40,
  rotation: 0,
  opacity: 1,
  locked: false,
  autoWidth: true,
  text: style('текст'),
});

const connector = (id: string): ConnectorNode => ({
  id,
  type: 'connector',
  from: { point: { x: 0, y: 0 } },
  to: { point: { x: 50, y: 50 } },
  routing: 'straight',
  stroke: '#111111',
  strokeWidth: 2,
  startCap: 'none',
  endCap: 'arrow',
  locked: false,
  opacity: 1,
});

describe('режим панели', () => {
  test('пустое выделение — свойства холста, панель не пустеет', () => {
    expect(inspectorMode([])).toEqual({ kind: 'canvas' });
  });

  test('один узел — его собственная секция', () => {
    const node = shape('a');
    expect(inspectorMode([node])).toEqual({ kind: 'single', node });
  });

  test('несколько одного типа — тип сохраняется', () => {
    const mode = inspectorMode([shape('a'), shape('b')]);
    expect(mode.kind).toBe('multi');
    expect(mode.kind === 'multi' && mode.sameType).toBe('shape');
  });

  test('несколько разных типов — общего типа нет', () => {
    const mode = inspectorMode([shape('a'), text('b')]);
    expect(mode.kind === 'multi' && mode.sameType).toBe(null);
  });
});

describe('общие поля', () => {
  test('однотипные фигуры делят заливку, обводку и рамку', () => {
    expect(commonFields([shape('a'), shape('b')])).toEqual([
      'x',
      'y',
      'width',
      'height',
      'rotation',
      'opacity',
      'locked',
      'fill',
      'stroke',
      'strokeWidth',
    ]);
  });

  test('фигура и стикер делят заливку, но не обводку', () => {
    const fields = commonFields([shape('a'), sticky('b')]);
    expect(fields).toContain('fill');
    expect(fields).not.toContain('stroke');
  });

  test('фигура и текст не делят заливку — у текста её нет', () => {
    expect(commonFields([shape('a'), text('b')])).not.toContain('fill');
  });

  test('разнотипное выделение с коннектором оставляет только прозрачность и блокировку', () => {
    // Ключевое требование: у коннектора нет рамки, поэтому x/y/width/height
    // пропадают, и «выдумывать больше» нечего.
    expect(commonFields([shape('a'), connector('b'), text('c')])).toEqual(['opacity', 'locked']);
  });

  test('фигура и коннектор делят обводку', () => {
    const fields = commonFields([shape('a'), connector('b')]);
    expect(fields).toContain('stroke');
    expect(fields).toContain('strokeWidth');
    expect(fields).not.toContain('width');
  });

  test('пустое выделение общих полей не даёт', () => {
    expect(commonFields([])).toEqual([]);
  });
});

describe('общее значение', () => {
  test('совпадающие значения отдаются как есть', () => {
    expect(sharedValue([shape('a', '#ff0000'), shape('b', '#ff0000')], (n) => n.opacity)).toBe(1);
  });

  test('расходящиеся значения дают undefined, а не значение первого узла', () => {
    const nodes: Node[] = [shape('a', '#ff0000'), shape('b', '#00ff00')];
    expect(sharedValue(nodes, (n) => (n as ShapeNode).fill)).toBeUndefined();
  });
});

describe('ключ TextStyle зависит от типа', () => {
  test.each([
    ['text', text('a'), 'text'],
    ['sticky', sticky('b'), 'text'],
    ['shape', shape('c'), 'label'],
    ['connector', connector('d'), 'label'],
  ])('%s → %s', (_name, node, expected) => {
    expect(textStyleKey(node as Node)).toBe(expected);
  });
});
