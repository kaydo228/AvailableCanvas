/**
 * Перетаскивание группы выделенных узлов.
 *
 * Konva тянет только тот узел, за который взялись. Чтобы поехал весь набор,
 * на слое узлов перехватываются всплывающие события перетаскивания: на старте
 * запоминаются позиции остальных выделенных, на каждом кадре им подставляется
 * та же дельта, на отпускании результат уезжает в стор.
 *
 * Перехват на слое, а не в каждом рендерере: узлы про выделение не знают
 * и знать не должны.
 */

import type Konva from 'konva';
import { useCallback, useRef } from 'react';

import { useBoardStore } from '@/shared/store/board';
import type { Id } from '@/shared/types/document';

interface Snapshot {
  anchorId: Id;
  anchor: { x: number; y: number };
  others: Array<{ node: Konva.Node; x: number; y: number }>;
}

export function useGroupDrag() {
  const snapshot = useRef<Snapshot | null>(null);

  const onDragStart = useCallback((event: Konva.KonvaEventObject<DragEvent>) => {
    const target = event.target;
    const id = target.id();
    if (!id) return;

    const { selection } = useBoardStore.getState();
    // Тянут узел вне выделения — обычное одиночное перетаскивание.
    if (selection.length < 2 || !selection.includes(id)) {
      snapshot.current = null;
      return;
    }

    const stage = target.getStage();
    if (!stage) return;

    const others = selection
      .filter((other) => other !== id)
      .map((other) => stage.findOne(`#${other}`))
      .filter((node): node is Konva.Node => Boolean(node))
      .map((node) => ({ node, x: node.x(), y: node.y() }));

    snapshot.current = {
      anchorId: id,
      anchor: { x: target.x(), y: target.y() },
      others,
    };
  }, []);

  const onDragMove = useCallback((event: Konva.KonvaEventObject<DragEvent>) => {
    const id = event.target.id();
    if (!id) return;

    const { updateNode } = useBoardStore.getState();
    const snap = snapshot.current;

    if (!snap || id !== snap.anchorId) {
      // Одиночное перетаскивание: пишем позицию в стор каждый кадр, иначе
      // привязанные линии догоняют фигуру только на отпускании и дёргаются.
      updateNode(id, { x: event.target.x(), y: event.target.y() });
      return;
    }

    const dx = event.target.x() - snap.anchor.x;
    const dy = event.target.y() - snap.anchor.y;

    updateNode(id, { x: event.target.x(), y: event.target.y() });

    for (const item of snap.others) {
      const position = { x: item.x + dx, y: item.y + dy };
      // Konva двигаем сами: узел не перетаскивается, он ведомый.
      item.node.position(position);
      const otherId = item.node.id();
      if (otherId) updateNode(otherId, position);
    }
  }, []);

  const onDragEnd = useCallback((event: Konva.KonvaEventObject<DragEvent>) => {
    const snap = snapshot.current;
    snapshot.current = null;
    if (!snap || event.target.id() !== snap.anchorId) return;

    const dx = event.target.x() - snap.anchor.x;
    const dy = event.target.y() - snap.anchor.y;
    if (dx === 0 && dy === 0) return;

    // Узел-якорь пишет себя сам, через onDragEnd своего рендерера.
    const { updateNode } = useBoardStore.getState();
    for (const item of snap.others) {
      const id = item.node.id();
      if (id) updateNode(id, { x: item.x + dx, y: item.y + dy });
    }
  }, []);

  return { onDragStart, onDragMove, onDragEnd };
}
