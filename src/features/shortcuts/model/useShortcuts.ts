/**
 * Регистрация горячих клавиш (ТЗ 6.2, 6.3).
 *
 * Два узких места, из-за которых такое обычно ломается, решены здесь явно:
 *
 * 1. **Во время ввода выключено всё.** Проверка стоит одна, в `ignore` самого
 *    tinykeys, а не в каждом обработчике: обработчик, который забыли обернуть,
 *    — это ровно тот баг, от которого защищаемся.
 * 2. **Esc двухступенчатый** и потому обрабатывается отдельно от таблицы:
 *    он единственный обязан проходить сквозь запрет на время ввода, иначе
 *    из режима правки нечем выйти.
 */

import { useEffect } from 'react';
import { tinykeys } from 'tinykeys';

import { useBoardStore } from '@/shared/store/board';
import { isTyping, isTypingTarget } from '../lib/typing';
import { activeShortcuts, type ShortcutActions } from './bindings';
import { useShortcutsUI } from './store';

export const useShortcuts = (): void => {
  useEffect(() => {
    const board = useBoardStore;

    const actions: ShortcutActions = {
      setTool: (tool) => board.getState().setTool(tool as never),
      removeNodes: (ids) => board.getState().removeNodes(ids),
      selectAll: () => board.getState().selectAll(),
      clearSelection: () => board.getState().clearSelection(),
      duplicateNodes: (ids) => board.getState().duplicateNodes(ids),
      group: (ids) => board.getState().group(ids),
      ungroup: (id) => board.getState().ungroup(id),
      bringForward: (ids) => board.getState().bringForward(ids),
      sendBackward: (ids) => board.getState().sendBackward(ids),
      resetZoom: () => board.getState().resetZoom(),
      zoomToFit: () => board.getState().zoomToFit(),
      zoomToSelection: () => board.getState().zoomToSelection(),
      toggleHelp: () => useShortcutsUI.getState().toggleHelp(),
    };

    /** Свежий контекст на каждое нажатие: снимок стора устаревает мгновенно. */
    const context = () => {
      const state = board.getState();
      const document = state.document;
      return {
        selection: state.selection,
        nodes: document
          ? state.selection.map((id) => document.nodes[id]).filter((n) => n !== undefined)
          : [],
      };
    };

    const map: Record<string, (event: KeyboardEvent) => void> = {};
    for (const shortcut of activeShortcuts()) {
      map[shortcut.keys] = (event) => {
        // Наши сочетания не должны дублироваться браузерными: Cmd+A выделяет
        // объекты доски, а не текст страницы.
        event.preventDefault();
        shortcut.run?.(actions, context());
      };
    }

    const unbindKeys = tinykeys(window, map, {
      ignore: (event) => isTyping(event, board.getState().editingNodeId),
    });

    /**
     * Esc — отдельным слушателем, потому что он обязан работать и во время
     * ввода, где tinykeys уже всё отфильтровал.
     *
     * Ступени строго по порядку: сначала выход из ввода, и только следующим
     * нажатием — снятие выделения. Одно нажатие никогда не делает оба шага,
     * иначе выход из текста молча терял бы выделение.
     */
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      const state = board.getState();

      // Ступень 1а: правка узла на холсте.
      if (state.editingNodeId !== null) {
        event.preventDefault();
        state.stopEditing();
        return;
      }

      // Ступень 1б: фокус в поле панели свойств — снимаем фокус, выделение
      // объектов при этом не трогаем.
      if (isTypingTarget(event.target)) {
        (event.target as HTMLElement).blur();
        return;
      }

      // Ступень 2: снять выделение.
      if (state.selection.length > 0) {
        event.preventDefault();
        state.clearSelection();
      }
    };

    window.addEventListener('keydown', onEscape);
    return () => {
      unbindKeys();
      window.removeEventListener('keydown', onEscape);
    };
  }, []);
};
