/**
 * Буфер обмена: разбор чужого текста и вставка снимка в документ.
 *
 * Проверяется то, что ломается молча. Текст в системном буфере правится
 * руками и приезжает из чужих версий приложения — разбор обязан отказывать,
 * а не класть на доску полуузел. Вставка обязана перевязывать ссылки внутрь
 * копии: линия, оставшаяся смотреть на чужой id, — это висячая ссылка
 * в документе, а не «просто криво нарисовано».
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { connector, doc, shape } from '@/shared/model/fixtures';
import { validateDocument } from '@/shared/model/invariants';
import { useBoardStore } from '@/shared/store/board';
import type { BoardDocument, GroupNode, Id } from '@/shared/types/document';

import { parseClipboard, serializeNodes } from './useClipboard';

const board = () => useBoardStore.getState();
const document = () => board().document as BoardDocument;
const nodesOf = (ids: Id[]) => ids.map((id) => document().nodes[id]);

beforeEach(() => {
  useBoardStore.setState({
    document: doc([shape('a', 0, 0), shape('b', 200, 0), connector('c1', 'a', 'b')]),
    selection: [],
  });
});

describe('parseClipboard', () => {
  it('свой текст разбирается обратно в узлы', () => {
    const text = serializeNodes([shape('a', 10, 20)]);

    expect(parseClipboard(text)).toMatchObject([{ id: 'a', type: 'shape', x: 10, y: 20 }]);
  });

  it('чужой текст — не узлы', () => {
    expect(parseClipboard('просто текст')).toBeNull();
    expect(parseClipboard('{"format":"prostor-nodes"')).toBeNull();
    expect(parseClipboard(JSON.stringify({ format: 'что-то-другое', nodes: [] }))).toBeNull();
  });

  it('свой маркер с битым узлом внутри тоже отвергается', () => {
    const broken = JSON.stringify({
      format: 'prostor-nodes',
      version: 1,
      nodes: [{ ...shape('a'), width: 'широкий' }],
    });

    expect(parseClipboard(broken)).toBeNull();
  });
});

describe('pasteNodes', () => {
  it('кладёт копии с новыми id и переносит на них выделение', () => {
    const copied = parseClipboard(serializeNodes([shape('a', 0, 0)])) ?? [];

    const created = board().pasteNodes(copied);

    expect(created).toHaveLength(1);
    expect(created[0]).not.toBe('a');
    // Оригинал на месте: вставка ничего не заменяет.
    expect(document().nodes['a']).toBeDefined();
    expect(board().selection).toEqual(created);
    expect(document().order).toContain(created[0]);
    expect(validateDocument(document())).toEqual([]);
  });

  it('линия внутри снимка остаётся привязанной к копиям, а не к оригиналам', () => {
    const source = document();
    const snapshot = ['a', 'b', 'c1']
      .map((id) => source.nodes[id])
      .filter((node) => node !== undefined);
    const copied = parseClipboard(serializeNodes(snapshot)) ?? [];

    const created = board().pasteNodes(copied);
    const line = nodesOf(created).find((node) => node?.type === 'connector');

    expect(line?.type).toBe('connector');
    if (line?.type !== 'connector') return;
    expect(created).toContain(line.from.nodeId);
    expect(created).toContain(line.to.nodeId);
    expect(line.from.nodeId).not.toBe('a');
    expect(validateDocument(document())).toEqual([]);
  });

  it('группа вставляется вместе с содержимым', () => {
    board().select(['a', 'b']);
    const groupId = board().group(['a', 'b']);
    expect(groupId).not.toBeNull();

    const source = document();
    const snapshot = [groupId as Id, 'a', 'b']
      .map((id) => source.nodes[id])
      .filter((node) => node !== undefined);
    const copied = parseClipboard(serializeNodes(snapshot)) ?? [];

    const created = board().pasteNodes(copied);
    const group = nodesOf(created).find((node): node is GroupNode => node?.type === 'group');

    expect(group).toBeDefined();
    expect(group?.children).toHaveLength(2);
    // Дети копии — тоже копии, а не оригиналы: иначе один узел оказался бы
    // в двух группах сразу.
    for (const child of group?.children ?? []) {
      expect(created).toContain(child);
      const node = document().nodes[child];
      // Инвариант 2: у линии groupId не бывает вовсе, и по типу его там нет.
      expect(node?.type).toBe('shape');
      if (node?.type === 'connector') continue;
      expect(node?.groupId).toBe(group?.id);
    }
    expect(validateDocument(document())).toEqual([]);
  });

  it('пустой снимок — не исключение и не пустая правка документа', () => {
    const before = document().order.length;

    expect(board().pasteNodes([])).toEqual([]);
    expect(document().order).toHaveLength(before);
  });
});
