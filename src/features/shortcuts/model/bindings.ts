/**
 * Единственная таблица горячих клавиш (ТЗ, разделы 6.2 и 6.3).
 *
 * Из неё берутся И обработчики, И экран справки. Две отдельные таблицы
 * разъезжаются на второй неделе: клавишу переименовали, справка врёт.
 *
 * Клавиши инструментов записаны кодами (`KeyV`), а не буквами: tinykeys матчит
 * и `event.key`, и `event.code`, а код не зависит от раскладки. На русской
 * раскладке `event.key` для клавиши V — «м», и по букве инструмент не сработал бы.
 */

import type { Id, Node } from '@/shared/types/document';

/** Действия, которые обработчику нужны от общего стора. */
export interface ShortcutActions {
  setTool(tool: string): void;
  removeNodes(ids: Id[]): void;
  selectAll(): void;
  clearSelection(): void;
  duplicateNodes(ids: Id[]): Id[];
  group(ids: Id[]): Id | null;
  ungroup(groupId: Id): void;
  bringForward(ids: Id[]): void;
  sendBackward(ids: Id[]): void;
  resetZoom(): void;
  zoomToFit(): void;
  zoomToSelection(): void;
  toggleHelp(): void;
}

/** Что обработчик знает о текущем состоянии. */
export interface ShortcutContext {
  selection: Id[];
  nodes: Node[];
}

export type ShortcutGroup = 'Инструменты' | 'Правка' | 'Слои' | 'Вид' | 'Прочее';

export interface Shortcut {
  /** Паттерн tinykeys. */
  keys: string;
  /** Как показать в справке. `$mod` подменяется на ⌘ или Ctrl. */
  hint: string;
  title: string;
  group: ShortcutGroup;
  /**
   * Что делать. `undefined` — клавиша описана в ТЗ, но опереться пока не на что:
   * либо действия нет в общем сторе вовсе (отмена, буфер обмена — это FR-10),
   * либо оно есть сигнатурой, но реализовано заглушкой зоны A, которая бросает
   * исключение (`duplicateNodes`, `group`, `ungroup`, порядок слоёв).
   *
   * Такие НЕ перехватываются и показаны в справке приглушённо. Съеденный Cmd+Z,
   * который молча ничего не делает, хуже несделанного; нажатие на заглушку,
   * роняющее приложение, — тем более. Как только A их реализует, каждая строка
   * включается добавлением `run`.
   */
  run?: (actions: ShortcutActions, context: ShortcutContext) => void;
}

const tool = (keys: string, hint: string, title: string, name: string): Shortcut => ({
  keys,
  hint,
  title,
  group: 'Инструменты',
  run: (actions) => actions.setTool(name),
});

export const SHORTCUTS: readonly Shortcut[] = [
  // ── Инструменты, раздел 6.2 ───────────────────────────────────────────
  tool('KeyV', 'V', 'Выбор', 'select'),
  tool('KeyH', 'H', 'Рука', 'hand'),
  tool('KeyS', 'S', 'Стикер', 'sticky'),
  tool('KeyT', 'T', 'Текст', 'text'),
  tool('KeyR', 'R', 'Прямоугольник', 'rect'),
  tool('KeyO', 'O', 'Эллипс', 'ellipse'),
  tool('KeyD', 'D', 'Ромб', 'diamond'),
  tool('KeyL', 'L', 'Линия', 'connector'),
  tool('KeyI', 'I', 'Изображение', 'image'),

  // ── Правка, раздел 6.3 ────────────────────────────────────────────────
  { keys: '$mod+KeyZ', hint: '$mod+Z', title: 'Отменить', group: 'Правка' },
  { keys: '$mod+Shift+KeyZ', hint: '$mod+Shift+Z', title: 'Вернуть', group: 'Правка' },
  { keys: '$mod+KeyC', hint: '$mod+C', title: 'Копировать', group: 'Правка' },
  { keys: '$mod+KeyV', hint: '$mod+V', title: 'Вставить', group: 'Правка' },
  { keys: '$mod+KeyD', hint: '$mod+D', title: 'Дублировать', group: 'Правка' },
  {
    keys: 'Delete',
    hint: 'Delete',
    title: 'Удалить выделенное',
    group: 'Правка',
    run: (actions, { selection }) => {
      if (selection.length > 0) actions.removeNodes(selection);
    },
  },
  {
    keys: 'Backspace',
    hint: 'Backspace',
    title: 'Удалить выделенное',
    group: 'Правка',
    run: (actions, { selection }) => {
      if (selection.length > 0) actions.removeNodes(selection);
    },
  },
  {
    keys: '$mod+KeyA',
    hint: '$mod+A',
    title: 'Выделить всё',
    group: 'Правка',
    run: (actions) => actions.selectAll(),
  },
  { keys: '$mod+KeyG', hint: '$mod+G', title: 'Сгруппировать', group: 'Правка' },
  { keys: '$mod+Shift+KeyG', hint: '$mod+Shift+G', title: 'Разгруппировать', group: 'Правка' },

  // ── Слои ──────────────────────────────────────────────────────────────
  { keys: 'BracketRight', hint: ']', title: 'Вперёд по слоям', group: 'Слои' },
  { keys: 'BracketLeft', hint: '[', title: 'Назад по слоям', group: 'Слои' },

  // ── Вид ───────────────────────────────────────────────────────────────
  {
    keys: '$mod+Digit0',
    hint: '$mod+0',
    title: 'Масштаб 100 %',
    group: 'Вид',
    run: (actions) => actions.resetZoom(),
  },
  {
    keys: '$mod+Digit1',
    hint: '$mod+1',
    title: 'Вписать всё',
    group: 'Вид',
    run: (actions) => actions.zoomToFit(),
  },
  {
    keys: '$mod+Digit2',
    hint: '$mod+2',
    title: 'Вписать выделенное',
    group: 'Вид',
    run: (actions, { selection }) => {
      if (selection.length > 0) actions.zoomToSelection();
    },
  },

  // ── Прочее ────────────────────────────────────────────────────────────
  // Space + перетаскивание живёт в зоне A (useCanvasGestures) — здесь только
  // строка для справки, обработчика нет и быть не должно.
  { keys: '', hint: 'Space + перетаскивание', title: 'Панорамирование', group: 'Прочее' },
  {
    keys: '?',
    hint: '?',
    title: 'Справка по клавишам',
    group: 'Прочее',
    run: (actions) => actions.toggleHelp(),
  },
  // Esc обрабатывается отдельно в useShortcuts: он двухступенчатый и должен
  // работать в том числе во время ввода, когда остальные клавиши выключены.
  { keys: '', hint: 'Esc', title: 'Выйти из ввода, затем снять выделение', group: 'Прочее' },
];

/** Только те, у кого есть обработчик и паттерн — остальные существуют ради справки. */
export const activeShortcuts = (): Shortcut[] =>
  SHORTCUTS.filter((shortcut) => shortcut.keys !== '' && shortcut.run !== undefined);
