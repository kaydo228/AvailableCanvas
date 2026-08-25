/**
 * Шов зоны узлов. Пишется до работы агентов, меняется только владельцем зоны A.
 *
 * Рендерер узла НЕ знает про стор: всё приходит пропсами, всё уходит колбэками.
 * Стор прикручивается на уровне слоя (NodesLayer), а не внутри узла — так узел
 * остаётся тестируемым и не тянет за собой половину приложения.
 */

import type { ComponentType } from 'react';

import type { Id, Node } from '@/shared/types/document';

export interface NodeViewProps<T extends Node = Node> {
  node: T;
  selected: boolean;
  /** Клик по узлу. additive — был зажат Shift. */
  onSelect: (id: Id, additive: boolean) => void;
  /** Двойной клик: просьба открыть оверлей ввода текста. */
  onStartEditing: (id: Id) => void;
  /** Узел отпустили после перетаскивания. Координаты мировые. */
  onDragEnd: (id: Id, x: number, y: number) => void;
  /** true — узел сейчас редактируется, его собственный текст рисовать не надо. */
  editing: boolean;
}

/**
 * Карта «тип узла → компонент». Регистрация в одном месте, чтобы слой
 * не разрастался цепочкой if.
 */
export type NodeRendererMap = Partial<Record<Node['type'], ComponentType<NodeViewProps<never>>>>;
