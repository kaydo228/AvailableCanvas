/**
 * Настройки zundo для общего стора (FR-10).
 *
 * Лежат отдельно от `shared/store/board.ts` намеренно: стор — контракт между
 * зонами, а правила истории целиком в зоне B. Обратный импорт типа `BoardState`
 * стирается при сборке, рантайм-цикла между файлами нет.
 *
 * Свой стек команд не пишем — zundo хранит снимки, а структурное разделение
 * immer делает снимок дешёвым: неизменившиеся ветки документа переиспользуются.
 */

import type { ZundoOptions } from 'zundo';
import type { StoreApi } from 'zustand';

import type { BoardState } from '@/shared/store/board';
import type { BoardDocument } from '@/shared/types/document';

/** Глубина истории, ТЗ FR-10 — не меньше 50 шагов. */
export const HISTORY_LIMIT = 50;

/**
 * Пауза, после которой серия изменений закрывается одним шагом. Перетаскивание
 * узла — это десятки `moveNodes` подряд; без склейки Cmd+Z отматывал бы кадры.
 */
export const HISTORY_DEBOUNCE_MS = 400;

/** Что попадает в историю. Всё остальное отматывать бессмысленно. */
export interface BoardSnapshot {
  document: BoardDocument | null;
}

/**
 * Вьюпорт лежит внутри документа, и просто выкинуть ключ нельзя: undo делает
 * поверхностный merge, документ приехал бы без вида вообще. Поэтому на его
 * место кладётся заглушка, а живой вид возвращает `undo` из `./store.ts`.
 */
const NO_VIEWPORT = Object.freeze({ x: 0, y: 0, zoom: 1 });

/**
 * Выделение, активный инструмент, режим ввода и размер канваса в историю
 * не идут: Cmd+Z обязан откатывать действие, а не гасить выделение.
 */
const partialize = (state: BoardState): BoardSnapshot => ({
  document: state.document && { ...state.document, viewport: NO_VIEWPORT },
});

/**
 * Шаг записывается, только если содержимое документа действительно менялось.
 *
 * Панорамирование и зум сюда не попадают: вьюпорт в снимке — общая заглушка,
 * и по остальным ключам документ совпадает. Это самое важное место всего файла:
 * без него history забивается камерой и Cmd+Z отматывает вид.
 */
const sameContent = (past: BoardSnapshot, current: BoardSnapshot): boolean => {
  const a = past.document;
  const b = current.document;
  if (a === b) return true;
  // Открытие, закрытие и смена проекта — не действие пользователя: история
  // своя у каждого проекта и чистится через clearHistory.
  if (!a || !b || a.projectId !== b.projectId) return true;
  return (Object.keys(a) as (keyof BoardDocument)[]).every((key) => a[key] === b[key]);
};

type PastState = Parameters<StoreApi<BoardState>['setState']>[0];

/** Идёт ввод текста: вся сессия правки от фокуса до blur — один шаг. */
let editing = false;
let closeStep = (): void => {};
let dropStep = (): void => {};

export const holdHistory = (on: boolean): void => {
  editing = on;
  if (!on) closeStep();
};

/** Выбросить незакрытый шаг: при смене проекта дописывать его некуда. */
export const dropPendingStep = (): void => dropStep();

export const boardHistory: ZundoOptions<BoardState, BoardSnapshot> = {
  limit: HISTORY_LIMIT,
  partialize,
  equality: sameContent,
  handleSet: (record) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stepStart: PastState | undefined;

    closeStep = () => {
      clearTimeout(timer);
      if (stepStart === undefined) return;
      record(stepStart);
      stepStart = undefined;
    };

    dropStep = () => {
      clearTimeout(timer);
      stepStart = undefined;
    };

    return (pastState) => {
      // Запоминается ПЕРВОЕ состояние серии, а не последнее: откат от
      // перетаскивания должен вернуть узел туда, где он был до захвата.
      stepStart ??= pastState;
      clearTimeout(timer);
      // Проверка `editing` стоит в момент срабатывания, а не постановки:
      // создание стикера и набор в нём — одно действие пользователя, и шаг
      // закроется на blur вызовом holdHistory(false).
      timer = setTimeout(() => {
        if (!editing) closeStep();
      }, HISTORY_DEBOUNCE_MS);
    };
  },
};
