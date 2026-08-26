import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { doc, shape } from '@/shared/model/fixtures';
import { useBoardStore } from '@/shared/store/board';
import type { TextStyle } from '@/shared/types/document';
import { clearHistory, redo, undo } from './store';
import { HISTORY_DEBOUNCE_MS, holdHistory } from './temporal';

const board = () => useBoardStore.getState();
const steps = () => useBoardStore.temporal.getState().pastStates.length;

/** У коннектора нет координат, поэтому узел приходится сузить. */
const nodeX = (id: string): number | undefined => {
  const node = board().document?.nodes[id];
  return node && 'x' in node ? node.x : undefined;
};

const label = (value: string): TextStyle => ({
  value,
  fontSize: 16,
  color: '#111827',
  align: 'center',
});

beforeEach(() => {
  vi.useFakeTimers();
  board().closeDocument();
  board().loadDocument(doc([shape('a')]));
  clearHistory();
});

afterEach(() => {
  holdHistory(false);
  clearHistory();
  vi.useRealTimers();
});

test('панорамирование и зум в историю не попадают', () => {
  board().panBy(120, 80);
  board().zoomAt({ x: 10, y: 10 }, 1.2);
  vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS * 3);

  expect(steps()).toBe(0);
});

test('перетаскивание — один шаг на всё перемещение', () => {
  for (let frame = 0; frame < 40; frame += 1) board().moveNodes(['a'], 5, 0);
  vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS);

  expect(steps()).toBe(1);

  undo();
  expect(nodeX('a')).toBe(0);

  redo();
  expect(nodeX('a')).toBe(200);
});

test('undo откатывает действие, но не отматывает вид', () => {
  board().addNode(shape('b'));
  vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS);

  board().panBy(120, 80);
  const viewport = board().document?.viewport;

  undo();

  expect(board().document?.order).toEqual(['a']);
  expect(board().document?.viewport).toEqual(viewport);
});

test('ввод текста — один шаг от фокуса до blur, как бы долго ни набирали', () => {
  board().startEditing('a');
  holdHistory(true);

  for (const value of ['п', 'пр', 'при']) {
    board().updateNode('a', { label: label(value) });
    // Пауза длиннее дебаунса: сессия правки всё равно не должна разрываться.
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS * 2);
  }
  expect(steps()).toBe(0);

  board().stopEditing();
  holdHistory(false);

  expect(steps()).toBe(1);

  undo();
  const node = board().document?.nodes.a;
  expect(nodeX('a')).toBe(0);
  expect(node && 'label' in node).toBe(false);
});

test('смена проекта не становится шагом истории', () => {
  board().loadDocument({ ...doc([shape('c')]), projectId: 'p2' });
  vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS * 3);

  expect(steps()).toBe(0);
});
