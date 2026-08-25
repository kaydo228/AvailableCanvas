/**
 * Тесты зоны 2. Жесты проверяются целиком: событие DOM → хук → новый вид.
 * Внутренности @use-gesture не мокаются — если жест не доехал до колбэка,
 * тест обязан покраснеть.
 *
 * Контейнеру подменяется `getBoundingClientRect`: в jsdom он всегда нулевой,
 * а нам нужно именно смещение канваса относительно окна — на нём ловится
 * ошибка «зумим по координатам окна вместо координат контейнера».
 */

import { useState } from 'react';

import { cleanup, createEvent, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ZOOM_MAX, ZOOM_MIN } from '@/shared/types/document';
import type { Viewport } from '@/shared/types/document';

import type { Size } from './contract';
import { useCanvasGestures } from './useCanvasGestures';
import { toWorld } from './viewport';

const SIZE: Size = { width: 800, height: 600 };

/** Канвас смещён относительно окна — как настоящий, под тулбаром и панелью. */
const OFFSET = { left: 64, top: 48 };

const IDENTITY: Viewport = { x: 0, y: 0, zoom: 1 };

interface HarnessProps {
  initialViewport?: Viewport;
  onChange?: (viewport: Viewport) => void;
  handTool?: boolean;
  disabled?: boolean;
}

/**
 * Подопытный контейнер. Вид держит у себя, как это делал бы стор:
 * без этого второе событие подряд считалось бы от устаревшего вида.
 */
function Harness({
  initialViewport = IDENTITY,
  onChange = () => {},
  handTool = false,
  disabled = false,
}: HarnessProps) {
  const [viewport, setViewport] = useState<Viewport>(initialViewport);

  const { bind, cursor, isPanning } = useCanvasGestures({
    viewport,
    size: SIZE,
    onViewportChange: (next) => {
      setViewport(next);
      onChange(next);
    },
    handTool,
    disabled,
  });

  return (
    <div
      data-testid="canvas"
      data-cursor={cursor}
      data-panning={isPanning ? 'yes' : 'no'}
      {...bind()}
    >
      <input data-testid="editor" />
    </div>
  );
}

interface Mounted {
  canvas: HTMLElement;
  editor: HTMLElement;
  changes: Viewport[];
}

const mount = (props: HarnessProps = {}): Mounted => {
  const changes: Viewport[] = [];

  const view = render(
    <Harness
      {...props}
      onChange={(viewport) => {
        changes.push(viewport);
        props.onChange?.(viewport);
      }}
    />,
  );

  const canvas = view.getByTestId('canvas');
  const editor = view.getByTestId('editor');

  const rect: DOMRect = {
    x: OFFSET.left,
    y: OFFSET.top,
    left: OFFSET.left,
    top: OFFSET.top,
    right: OFFSET.left + SIZE.width,
    bottom: OFFSET.top + SIZE.height,
    width: SIZE.width,
    height: SIZE.height,
    toJSON: () => ({}),
  };
  canvas.getBoundingClientRect = () => rect;

  return { canvas, editor, changes };
};

const lastViewport = (changes: Viewport[]): Viewport => {
  const viewport = changes.at(-1);
  if (!viewport) throw new Error('onViewportChange ни разу не вызвался');
  return viewport;
};

/** Экранная точка внутри контейнера по координатам окна. */
const inCanvas = (clientX: number, clientY: number) => ({
  x: clientX - OFFSET.left,
  y: clientY - OFFSET.top,
});

afterEach(cleanup);

describe('колесо без модификатора', () => {
  it('сдвигает вид и не трогает зум', () => {
    const { canvas, changes } = mount();

    fireEvent.wheel(canvas, {
      deltaX: 0,
      deltaY: 120,
      clientX: 400,
      clientY: 300,
    });

    expect(changes).toHaveLength(1);
    // Колесо вниз уводит вид вверх: контент едет за жестом.
    expect(lastViewport(changes)).toEqual({ x: 0, y: -120, zoom: 1 });
  });

  it('складывает несколько событий подряд, а не считает от старого вида', () => {
    const { canvas, changes } = mount();

    fireEvent.wheel(canvas, { deltaX: 40, deltaY: 100, clientX: 0, clientY: 0 });
    fireEvent.wheel(canvas, { deltaX: 10, deltaY: 50, clientX: 0, clientY: 0 });

    expect(changes).toHaveLength(2);
    expect(lastViewport(changes)).toEqual({ x: -50, y: -150, zoom: 1 });
  });

  it('гасит прокрутку и зум самой страницы', () => {
    const { canvas } = mount();

    const scroll = createEvent.wheel(canvas, {
      deltaY: 120,
      clientX: 400,
      clientY: 300,
    });
    fireEvent(canvas, scroll);
    expect(scroll.defaultPrevented).toBe(true);

    // Cmd/Ctrl + колесо в браузере зумит всю страницу — этого быть не должно.
    const zoom = createEvent.wheel(canvas, {
      deltaY: -120,
      ctrlKey: true,
      clientX: 400,
      clientY: 300,
    });
    fireEvent(canvas, zoom);
    expect(zoom.defaultPrevented).toBe(true);
  });

  it('по Shift скроллит по горизонтали', () => {
    const { canvas, changes } = mount();

    fireEvent.wheel(canvas, {
      deltaX: 0,
      deltaY: 90,
      shiftKey: true,
      clientX: 0,
      clientY: 0,
    });

    expect(lastViewport(changes)).toEqual({ x: -90, y: 0, zoom: 1 });
  });
});

describe('зум колесом с Cmd/Ctrl', () => {
  it('держит мировую точку под курсором на месте', () => {
    const start: Viewport = { x: 120, y: -40, zoom: 1.5 };
    const { canvas, changes } = mount({ initialViewport: start });

    const clientX = 400;
    const clientY = 260;
    const pointer = inCanvas(clientX, clientY);
    const before = toWorld(pointer, start);

    fireEvent.wheel(canvas, {
      deltaY: -100,
      metaKey: true,
      clientX,
      clientY,
    });

    const next = lastViewport(changes);
    expect(next.zoom).toBeGreaterThan(start.zoom);

    const after = toWorld(pointer, next);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('считает курсор от контейнера, а не от окна', () => {
    const start: Viewport = { x: 0, y: 0, zoom: 1 };
    const { canvas, changes } = mount({ initialViewport: start });

    const clientX = 400;
    const clientY = 260;

    fireEvent.wheel(canvas, {
      deltaY: -100,
      metaKey: true,
      clientX,
      clientY,
    });

    const next = lastViewport(changes);

    // Точка окна (без вычета смещения канваса) обязана уехать —
    // иначе зум привязан не к той системе координат.
    const windowPointBefore = toWorld({ x: clientX, y: clientY }, start);
    const windowPointAfter = toWorld({ x: clientX, y: clientY }, next);

    expect(windowPointAfter.x).not.toBeCloseTo(windowPointBefore.x, 6);
    expect(windowPointAfter.y).not.toBeCloseTo(windowPointBefore.y, 6);
  });

  it('pinch на трекпаде (wheel с ctrlKey) — тот же зум к курсору', () => {
    const { canvas, changes } = mount();

    const clientX = 300;
    const clientY = 400;
    const pointer = inCanvas(clientX, clientY);
    const before = toWorld(pointer, IDENTITY);

    // Трекпад присылает мелкие дельты — жест обязан быть плавным.
    fireEvent.wheel(canvas, { deltaY: -8, ctrlKey: true, clientX, clientY });

    const next = lastViewport(changes);
    expect(next.zoom).toBeGreaterThan(1);
    expect(next.zoom).toBeLessThan(1.1);

    const after = toWorld(pointer, next);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('не выходит за границы диапазона [0.1, 4]', () => {
    const zoomIn = mount();
    for (let i = 0; i < 20; i += 1) {
      fireEvent.wheel(zoomIn.canvas, {
        deltaY: -200,
        metaKey: true,
        clientX: 400,
        clientY: 300,
      });
    }
    expect(lastViewport(zoomIn.changes).zoom).toBe(ZOOM_MAX);

    cleanup();

    const zoomOut = mount();
    for (let i = 0; i < 30; i += 1) {
      fireEvent.wheel(zoomOut.canvas, {
        deltaY: 200,
        metaKey: true,
        clientX: 400,
        clientY: 300,
      });
    }
    expect(lastViewport(zoomOut.changes).zoom).toBe(ZOOM_MIN);
  });
});

describe('пробел', () => {
  it('переводит курсор в grab и не даёт странице прокрутиться', () => {
    const { canvas } = mount();

    const keyDown = createEvent.keyDown(document.body, {
      code: 'Space',
      key: ' ',
    });
    fireEvent(document.body, keyDown);

    expect(canvas.dataset['cursor']).toBe('grab');
    expect(keyDown.defaultPrevented).toBe(true);
  });

  it('не срабатывает, пока пользователь печатает в поле ввода', () => {
    const { canvas, editor } = mount();

    editor.focus();
    const keyDown = createEvent.keyDown(editor, { code: 'Space', key: ' ' });
    fireEvent(editor, keyDown);

    expect(canvas.dataset['cursor']).toBe('default');
    expect(keyDown.defaultPrevented).toBe(false);
  });

  it('снимается по keyup', () => {
    const { canvas } = mount();

    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
    expect(canvas.dataset['cursor']).toBe('grab');

    fireEvent.keyUp(document.body, { code: 'Space', key: ' ' });
    expect(canvas.dataset['cursor']).toBe('default');
  });

  it('не залипает при потере фокуса окном', () => {
    const { canvas } = mount();

    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
    expect(canvas.dataset['cursor']).toBe('grab');

    fireEvent.blur(window);
    expect(canvas.dataset['cursor']).toBe('default');
  });
});

describe('панорамирование перетаскиванием', () => {
  it('с зажатым пробелом двигает вид и показывает grabbing', () => {
    const { canvas, changes } = mount();

    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });

    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      button: 0,
      buttons: 1,
      clientX: 200,
      clientY: 200,
    });

    expect(canvas.dataset['cursor']).toBe('grabbing');
    expect(canvas.dataset['panning']).toBe('yes');

    fireEvent.pointerMove(window, {
      pointerId: 1,
      buttons: 1,
      clientX: 230,
      clientY: 250,
    });

    expect(lastViewport(changes)).toEqual({ x: 30, y: 50, zoom: 1 });

    fireEvent.pointerUp(window, {
      pointerId: 1,
      buttons: 0,
      clientX: 230,
      clientY: 250,
    });

    expect(canvas.dataset['panning']).toBe('no');
    // Пробел всё ещё зажат — значит рука наготове.
    expect(canvas.dataset['cursor']).toBe('grab');
  });

  it('средней кнопкой мыши работает без пробела', () => {
    const { canvas, changes } = mount();

    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      button: 1,
      buttons: 4,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 1,
      buttons: 4,
      clientX: 60,
      clientY: 130,
    });

    expect(lastViewport(changes)).toEqual({ x: -40, y: 30, zoom: 1 });
    expect(canvas.dataset['cursor']).toBe('grabbing');

    fireEvent.pointerUp(window, { pointerId: 1, buttons: 0 });
    expect(canvas.dataset['panning']).toBe('no');
  });

  it('гасит mousedown средней кнопки — иначе браузер включит автопрокрутку', () => {
    const { canvas } = mount();

    const middle = createEvent.mouseDown(canvas, { button: 1 });
    fireEvent(canvas, middle);
    expect(middle.defaultPrevented).toBe(true);

    // Обычный клик левой кнопкой трогать нельзя — на нём выделение и фокус.
    const left = createEvent.mouseDown(canvas, { button: 0 });
    fireEvent(canvas, left);
    expect(left.defaultPrevented).toBe(false);
  });

  it('левой кнопкой без пробела и без «руки» вид не двигает', () => {
    const { canvas, changes } = mount();

    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      button: 0,
      buttons: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 1,
      buttons: 1,
      clientX: 300,
      clientY: 400,
    });
    fireEvent.pointerUp(window, { pointerId: 1, buttons: 0 });

    expect(changes).toHaveLength(0);
    expect(canvas.dataset['cursor']).toBe('default');
  });

  it('с handTool двигает вид просто перетаскиванием', () => {
    const { canvas, changes } = mount({ handTool: true });

    expect(canvas.dataset['cursor']).toBe('grab');

    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      button: 0,
      buttons: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 1,
      buttons: 1,
      clientX: 90,
      clientY: 80,
    });

    expect(lastViewport(changes)).toEqual({ x: -10, y: -20, zoom: 1 });
    expect(canvas.dataset['cursor']).toBe('grabbing');

    fireEvent.pointerUp(window, { pointerId: 1, buttons: 0 });
    expect(canvas.dataset['cursor']).toBe('grab');
  });
});

describe('disabled', () => {
  it('выключает колесо, зум, пробел и перетаскивание', () => {
    const { canvas, changes } = mount({ disabled: true, handTool: true });

    const scroll = createEvent.wheel(canvas, {
      deltaY: 120,
      clientX: 400,
      clientY: 300,
    });
    fireEvent(canvas, scroll);

    fireEvent.wheel(canvas, {
      deltaY: -120,
      metaKey: true,
      clientX: 400,
      clientY: 300,
    });

    const keyDown = createEvent.keyDown(document.body, {
      code: 'Space',
      key: ' ',
    });
    fireEvent(document.body, keyDown);

    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      button: 0,
      buttons: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 1,
      buttons: 1,
      clientX: 300,
      clientY: 300,
    });
    fireEvent.pointerUp(window, { pointerId: 1, buttons: 0 });

    expect(changes).toHaveLength(0);
    expect(keyDown.defaultPrevented).toBe(false);
    // Пока идёт правка текста, страница ведёт себя как обычная страница.
    expect(scroll.defaultPrevented).toBe(false);
    expect(canvas.dataset['cursor']).toBe('default');
    expect(canvas.dataset['panning']).toBe('no');
  });
});
