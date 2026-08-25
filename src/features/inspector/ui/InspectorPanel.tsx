/**
 * Правая панель свойств, сворачиваемая (6.1, FR-09).
 *
 * Что показать — целиком решает `inspectorMode`: пусто — холст, один узел —
 * секция его типа, несколько — общие поля. Своей логики «что общего» здесь нет
 * и быть не должно.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { selectSelectedNodes, useBoardStore } from '@/shared/store/board';
import type { Node } from '@/shared/types/document';

import { inspectorMode } from '../model/common';
import { useInspector } from '../model/store';
import { CanvasSection } from './CanvasSection';
import { MultiSection } from './MultiSection';
import {
  ConnectorSection,
  ImageSection,
  ShapeSection,
  StickySection,
  TextSection,
} from './sections';

/** Секция по типу узла. У рисунка и группы своей пока нет — общие поля. */
const singleSection = (node: Node) => {
  switch (node.type) {
    case 'shape':
      return <ShapeSection node={node} />;
    case 'text':
      return <TextSection node={node} />;
    case 'sticky':
      return <StickySection node={node} />;
    case 'image':
      return <ImageSection node={node} />;
    case 'connector':
      return <ConnectorSection node={node} />;
    case 'draw':
    case 'group':
      return <MultiSection nodes={[node]} />;
  }
};

const toggleClass =
  'grid size-7 place-items-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900';

export const InspectorPanel = () => {
  // useShallow обязателен: selectSelectedNodes собирает новый массив на каждый
  // вызов, без сравнения по элементам компонент перерисовывался бы вечно.
  const nodes = useBoardStore(useShallow(selectSelectedNodes));
  const collapsed = useInspector((s) => s.collapsed);
  const toggleCollapsed = useInspector((s) => s.toggleCollapsed);

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-l border-neutral-200 bg-white py-2">
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Развернуть панель"
          aria-label="Развернуть панель"
          className={toggleClass}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
      </aside>
    );
  }

  const mode = inspectorMode(nodes);

  return (
    <aside className="flex w-68 shrink-0 flex-col overflow-y-auto border-l border-neutral-200 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <span className="text-sm font-medium text-neutral-900">Свойства</span>
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Свернуть панель"
          aria-label="Свернуть панель"
          className={toggleClass}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </header>

      {mode.kind === 'canvas' && <CanvasSection />}
      {mode.kind === 'single' && singleSection(mode.node)}
      {mode.kind === 'multi' && <MultiSection nodes={mode.nodes} />}
    </aside>
  );
};
