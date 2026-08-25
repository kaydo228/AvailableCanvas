/**
 * Зона 2 — жесты холста: панорамирование и зум.
 *
 * Хук ничего не знает про стор и про Konva. Текущий вид приходит пропсом,
 * новый уходит через `onViewportChange` — один вход, один выход.
 * Вся математика вида берётся из зоны 1 (`viewport.ts`), здесь её нет.
 *
 * Что обрабатывается:
 *   - колесо/трекпад без модификатора — сдвиг вида;
 *   - Cmd/Ctrl + колесо (и pinch на трекпаде Mac, который приходит тем же
 *     wheel с `ctrlKey`) — зум К ПОЗИЦИИ КУРСОРА через `zoomAt`;
 *   - Space + перетаскивание, средняя кнопка мыши, инструмент «рука» — сдвиг.
 *
 * Про `bind()`: кроме обработчиков от @use-gesture возвращается ещё `ref`.
 * Он нужен для двух вещей, без которых жесты в браузере ведут себя неверно:
 *   1) координаты курсора считаются относительно контейнера, а не окна —
 *      для этого нужен сам элемент и его `getBoundingClientRect()`;
 *   2) React вешает `wheel` на корень пассивно, из его обработчика
 *      `preventDefault()` не работает, и Cmd+колесо зумит всю страницу.
 *      Поэтому на элемент вешается отдельный НЕпассивный слушатель, который
 *      только гасит действие браузера по умолчанию, но ничего не считает.
 * Если контейнеру уже нужен свой ref — берите его из `bind()` последним
 * (`<div ref={mine} {...bind()} />`): жесты продолжат работать и без ref,
 * но координаты курсора тогда придётся брать из `currentTarget` события.
 */

import { useGesture } from '@use-gesture/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Viewport } from '@/shared/types/document';

import type { CanvasGesturesOptions, CanvasGesturesResult, ScreenPoint, Size } from './contract';
import { panBy, zoomAt } from './viewport';

/**
 * Чувствительность зума колесом. Множитель считается как exp(-dy * S):
 * один «щелчок» мыши (deltaY = 100) даёт ~0.78, то есть шаг около 22 %,
 * а мелкие дельты трекпада — плавное непрерывное приближение.
 */
const ZOOM_WHEEL_SENSITIVITY = 0.0025;

/**
 * Потолок дельты одного события колеса. Некоторые браузеры при инерции
 * присылают сотни пикселей за раз — без ограничения зум прыгает через
 * половину диапазона за один кадр.
 */
const MAX_WHEEL_DELTA = 200;

/** Маски `MouseEvent.buttons`: левая кнопка и средняя (`button === 1`). */
const LEFT_BUTTON = 1;
const MIDDLE_BUTTON = 4;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Пока курсор в поле ввода, пробел — это пробел в тексте, а не жест.
 * Проверяется цель события, а не фокус документа: цель точнее.
 */
const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

/** `code` надёжнее `key`: раскладка на пробел не влияет, но подстрахуемся. */
const isSpaceKey = (event: KeyboardEvent): boolean =>
  event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';

/**
 * Точка курсора в системе координат контейнера, а не окна.
 * Без контейнера (ref не навесили) остаётся честный запасной вариант —
 * центр канваса; зум тогда будет к центру, но без ошибки в координатах.
 */
const containerPoint = (
  clientX: number,
  clientY: number,
  container: Element | null,
  size: Size,
): ScreenPoint => {
  if (!container) return { x: size.width / 2, y: size.height / 2 };

  const rect = container.getBoundingClientRect();

  return {
    x: clamp(clientX - rect.left, 0, size.width),
    y: clamp(clientY - rect.top, 0, size.height),
  };
};

export function useCanvasGestures(options: CanvasGesturesOptions): CanvasGesturesResult {
  const { viewport, size, onViewportChange, handTool = false, disabled = false } = options;

  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  /**
   * Последний известный вид. Пропс обновляется только после ререндера
   * родителя, а событий колеса между двумя ререндерами может прийти
   * несколько — тогда каждое следующее считалось бы от устаревшего вида
   * и часть жеста терялась бы. Поэтому свой результат кладём сюда сразу.
   */
  const viewportRef = useRef<Viewport>(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  /** Состояние пробела нужно и в рендере (курсор), и в обработчиках. */
  const spaceHeldRef = useRef(false);
  const setSpace = useCallback((held: boolean): void => {
    spaceHeldRef.current = held;
    setSpaceHeld(held);
  }, []);

  /**
   * Вид на момент начала перетаскивания. `null` — текущий drag не про
   * панорамирование (обычное выделение), его мы просто не трогаем.
   * Сдвиг считается от снимка на суммарное смещение жеста, а не
   * накоплением дельт: так пан не «уползает» при пропущенном событии.
   */
  const panOriginRef = useRef<Viewport | null>(null);

  const applyViewport = (next: Viewport): void => {
    viewportRef.current = next;
    onViewportChange(next);
  };

  const gestureBind = useGesture(
    {
      onWheel: (state) => {
        // Хвостовое событие «жест кончился» приходит с той же дельтой,
        // что и последнее реальное — применив её, сдвинули бы вид дважды.
        if (disabled || !state.active) return;

        const point = containerPoint(state.event.clientX, state.event.clientY, container, size);

        // Pinch на трекпаде Mac приходит сюда же — wheel с ctrlKey.
        if (state.ctrlKey || state.metaKey) {
          const dy = clamp(state.delta[1], -MAX_WHEEL_DELTA, MAX_WHEEL_DELTA);
          if (dy === 0) return;

          // Границы [0.1, 4] держит clampZoom внутри zoomAt.
          applyViewport(zoomAt(viewportRef.current, point, Math.exp(-dy * ZOOM_WHEEL_SENSITIVITY)));
          return;
        }

        let dx = state.delta[0];
        let dy = state.delta[1];

        // Shift + колесо — привычный горизонтальный скролл. Часть браузеров
        // подменяет ось сама, тогда deltaX уже не ноль и трогать нечего.
        if (state.shiftKey && dx === 0) {
          dx = dy;
          dy = 0;
        }

        if (dx === 0 && dy === 0) return;

        // Контент едет за жестом: колесо вниз уводит вид вниз.
        applyViewport(panBy(viewportRef.current, -dx, -dy));
      },

      onDrag: (state) => {
        if (disabled) return;

        if (state.first) {
          const middleButton = (state.buttons & MIDDLE_BUTTON) !== 0;
          const pans = middleButton || spaceHeldRef.current || handTool;

          panOriginRef.current = pans ? viewportRef.current : null;
          if (pans) setIsPanning(true);
        }

        const origin = panOriginRef.current;

        if (state.last) {
          panOriginRef.current = null;
          setIsPanning(false);
        }

        if (!origin) return;

        const [dx, dy] = state.movement;
        if (dx === 0 && dy === 0) return;

        applyViewport(panBy(origin, dx, dy));
      },
    },
    {
      // disabled выключает жесты целиком: обработчики даже не навешиваются.
      enabled: !disabled,
      drag: {
        pointer: {
          // jsdom и часть окружений не умеют setPointerCapture; слушатели
          // на window надёжнее и позволяют тянуть за пределы контейнера.
          capture: false,
          // Левая и средняя кнопки: средняя — панорамирование по спеке.
          buttons: [LEFT_BUTTON, MIDDLE_BUTTON],
          // Стрелки не должны двигать вид — это забота горячих клавиш.
          keys: false,
        },
      },
    },
  );

  /**
   * Пробел: жест, а не прокрутка страницы. Слушаем на window, потому что
   * фокус во время работы с холстом может быть где угодно.
   * Отпускание и blur снимают состояние без условий — иначе после
   * Cmd+Tab с зажатым пробелом холст остался бы в режиме «рука».
   */
  useEffect(() => {
    if (disabled) {
      setSpace(false);
      setIsPanning(false);
      panOriginRef.current = null;
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!isSpaceKey(event) || isEditableTarget(event.target)) return;

      event.preventDefault();
      if (event.repeat) return;

      setSpace(true);
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (!isSpaceKey(event)) return;
      setSpace(false);
    };

    const release = (): void => setSpace(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
  }, [disabled, setSpace]);

  /**
   * Непассивный слушатель колеса поверх контейнера. Ничего не считает —
   * только запрещает браузеру зумить страницу по Cmd/Ctrl + колесо
   * и прокручивать её обычным колесом. Из React-обработчика этого не
   * сделать: React вешает `wheel` на корень как пассивный.
   */
  useEffect(() => {
    if (disabled || !container) return;

    const preventBrowserGesture = (event: WheelEvent): void => {
      if (event.cancelable) event.preventDefault();
    };

    container.addEventListener('wheel', preventBrowserGesture, {
      passive: false,
    });

    return () => {
      container.removeEventListener('wheel', preventBrowserGesture);
    };
  }, [disabled, container]);

  /**
   * Средняя кнопка в браузере включает автопрокрутку, а левая с зажатым
   * пробелом выделяет текст. И то и другое во время пана мешает.
   * Гасится именно `mousedown`: отмена `pointerdown` на это не влияет.
   */
  const handleMouseDown = (event: ReactMouseEvent): void => {
    if (disabled) return;
    if (event.button === 1 || spaceHeldRef.current || handTool) {
      event.preventDefault();
    }
  };

  const bind = (): Record<string, unknown> => ({
    ...gestureBind(),
    ref: setContainer,
    onMouseDown: handleMouseDown,
  });

  const cursor: CanvasGesturesResult['cursor'] = disabled
    ? 'default'
    : isPanning
      ? 'grabbing'
      : spaceHeld || handTool
        ? 'grab'
        : 'default';

  return { bind, isPanning, cursor };
}
