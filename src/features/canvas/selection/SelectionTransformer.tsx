/**
 * Ручки изменения размера и поворота для выделенных узлов.
 *
 * Появился здесь раньше запланированного: без него нельзя выполнить
 * требование к картинкам «ресайз пропорциональный, Shift освобождает».
 * Полное выделение — рамкой, множественное — идёт отдельно.
 *
 * Konva при трансформации меняет scale, а не размер. Наружу отдаём именно
 * width/height: в модели документа масштаба нет, и хранить его там значило бы
 * завести второй источник правды о размере узла.
 */

import type Konva from 'konva';
import { useCallback, useEffect, useRef } from 'react';
import { Transformer } from 'react-konva';

import { groupHasRotatedDescendant } from '@/shared/model/operations';
import { useBoardStore } from '@/shared/store/board';

import { keepsAspect, MIN_NODE_SIDE } from './resize';

export function SelectionTransformer() {
  const ref = useRef<Konva.Transformer | null>(null);
  const shiftRef = useRef(false);

  const selection = useBoardStore((s) => s.selection);
  const nodes = useBoardStore((s) => s.document?.nodes);
  const resizeNode = useBoardStore((s) => s.resizeNode);
  const rotateNode = useBoardStore((s) => s.rotateNode);
  const editingNodeId = useBoardStore((s) => s.editingNodeId);

  // Shift читаем с клавиатуры, а не из события трансформации: пользователь
  // может зажать и отпустить его посреди перетаскивания ручки, и правило
  // обязано переключиться прямо в этот момент.
  useEffect(() => {
    const sync = (event: KeyboardEvent) => {
      shiftRef.current = event.shiftKey;
    };
    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
    };
  }, []);

  const applyAspectRule = useCallback(() => {
    const transformer = ref.current;
    const document = useBoardStore.getState().document;
    if (!transformer || !document) return;

    const selected = selection.map((id) => document.nodes[id]).filter((node) => node !== undefined);

    // При смешанном выделении пропорции держим, только если этого требуют
    // все узлы: иначе одно движение ручки испортит картинку в наборе.
    const keep =
      selected.length > 0 &&
      selected.every(
        (node) =>
          keepsAspect(node, shiftRef.current) ||
          (node.type === 'group' && groupHasRotatedDescendant(document, node.id)),
      );

    transformer.keepRatio(keep);
    transformer.enabledAnchors(
      keep
        ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
        : [
            'top-left',
            'top-center',
            'top-right',
            'middle-left',
            'middle-right',
            'bottom-left',
            'bottom-center',
            'bottom-right',
          ],
    );
  }, [selection]);

  // Привязка ручек к выделенным узлам. `nodes` в теле эффекта не используется,
  // но пересчитывать привязку надо при любой смене набора узлов: ручки ищутся
  // по id в дереве Konva, и после перерисовки слоя трансформер держал бы
  // ссылки на выброшенные фигуры.
  useEffect(() => {
    const transformer = ref.current;
    if (!transformer) return;

    const stage = transformer.getStage();
    if (!stage || editingNodeId) {
      transformer.nodes([]);
      return;
    }

    const shapes = selection
      .map((id) => (nodes?.[id]?.type === 'draw' ? null : stage.findOne(`#${id}`)))
      .filter((shape): shape is Konva.Node => Boolean(shape));

    transformer.nodes(shapes);
    // Правило видно сразу: у картинки только угловые ручки, у фигуры все восемь.
    applyAspectRule();
  }, [selection, nodes, editingNodeId, applyAspectRule]);

  const commit = (_event?: unknown) => {
    const transformer = ref.current;
    const document = useBoardStore.getState().document;
    if (!transformer || !document) return;

    for (const shape of transformer.nodes()) {
      const id = shape.id();
      if (!id) continue;

      // Размер берём из МОДЕЛИ, а не из shape.width(): узлы обёрнуты
      // в <Group>, а у группы Konva собственной ширины нет — она всегда 0,
      // и произведение на масштаб схлопывало узел в минимальный размер.
      const node = document.nodes[id];
      if (!node || node.type === 'connector') continue;

      // Масштаб сбрасываем: размер уедет в модель, второй раз его применять
      // нельзя — иначе узел растёт на каждое касание ручки.
      const scaleX = shape.scaleX();
      const scaleY = shape.scaleY();
      shape.scaleX(1);
      shape.scaleY(1);

      /*
       * Рамка уходит через `resizeNode`, а не через `updateNode` с четырьмя
       * полями: правила размера (минимальная сторона, нечисловые значения,
       * растяжение содержимого группы) живут там одним куском. Здесь их
       * повторять нельзя — разъедутся.
       */
      resizeNode(id, {
        x: shape.x(),
        y: shape.y(),
        width: node.width * scaleX,
        height: node.height * scaleY,
      });

      /*
       * Угол — тоже отдельным действием, а не полем в патче: приведение угла
       * и поворот содержимого групп живут в `rotateNode`. Рамка и поворот
       * пришли из разных веток и разошлись здесь конфликтом — правильный
       * итог берёт по одному вызову из каждой, а не одну из версий целиком.
       */
      rotateNode(id, shape.rotation());
    }
  };

  return (
    <Transformer
      ref={ref}
      rotateEnabled
      ignoreStroke
      shouldOverdrawWholeArea={false}
      anchorSize={8}
      borderStroke="#2f6fed"
      anchorStroke="#2f6fed"
      onTransformStart={applyAspectRule}
      onTransform={(event) => {
        applyAspectRule();
        // Размер уезжает в стор на каждом кадре, а не только на отпускании:
        // иначе привязанные линии стоят на месте всё время растягивания
        // и прыгают в конце.
        commit(event);
      }}
      onTransformEnd={commit}
      boundBoxFunc={(oldBox, newBox) =>
        newBox.width < MIN_NODE_SIDE || newBox.height < MIN_NODE_SIDE ? oldBox : newBox
      }
    />
  );
}
