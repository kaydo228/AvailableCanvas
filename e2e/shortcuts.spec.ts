import { expect, test } from '@playwright/test';

/**
 * Горячие клавиши, ТЗ 6.2 и 6.3.
 *
 * Здесь закреплены два места, на которых такое ломается всегда: глушение
 * клавиш во время ввода и двухступенчатый Esc. Проверяется Playwright'ом,
 * а не встроенной автоматизацией браузера, потому что привязки сделаны
 * по `event.code` (независимость от раскладки), а `code` заполняет только
 * настоящая клавиатура.
 */

const openBoard = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('Клавиши');
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  // Холст появляется только когда экран догрузил документ из IndexedDB.
  // Класть фикстуру раньше бесполезно: та загрузка приедет и затрёт её.
  await expect(page.locator('canvas').first()).toBeVisible();

  await page.evaluate(() => {
    const board = window.__board;
    board.getState().loadDocument({
      ...board.getState().document,
      nodes: {
        s1: {
          id: 's1',
          type: 'shape',
          shape: 'rect',
          x: 80,
          y: 80,
          width: 180,
          height: 120,
          rotation: 0,
          opacity: 1,
          locked: false,
          fill: '#dbeafe',
          stroke: '#1d4ed8',
          strokeWidth: 2,
        },
        k1: {
          id: 'k1',
          type: 'sticky',
          x: 320,
          y: 80,
          width: 180,
          height: 180,
          rotation: 0,
          opacity: 1,
          locked: false,
          fill: '#FEF3A8',
          text: { value: 'заметка', fontSize: 16, color: '#4A3E0B', align: 'left' },
        },
      },
      order: ['s1', 'k1'],
    });
  });
  // Клик по холсту не нужен и вреден: Konva кладёт два канваса друг на друга,
  // верхний перехватывает pointer. После загрузки фокус и так на body.
  await expect
    .poll(() => page.evaluate(() => window.__board.getState().document?.order.length ?? 0))
    .toBe(2);
};

const state = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const s = window.__board.getState();
    return {
      tool: s.activeTool,
      selection: s.selection,
      editing: s.editingNodeId,
      order: s.document?.order ?? [],
      nodeCount: Object.keys(s.document?.nodes ?? {}).length,
    };
  });

test('одиночные буквы переключают инструменты', async ({ page }) => {
  await openBoard(page);

  for (const [key, tool] of [
    ['s', 'sticky'],
    ['t', 'text'],
    ['r', 'rect'],
    ['o', 'ellipse'],
    ['d', 'diamond'],
    ['l', 'connector'],
    ['i', 'image'],
    ['h', 'hand'],
    ['v', 'select'],
  ] as const) {
    await page.keyboard.press(key);
    expect((await state(page)).tool, `клавиша ${key}`).toBe(tool);
  }
});

test('во время правки текста ВСЕ глобальные клавиши выключены', async ({ page }) => {
  await openBoard(page);
  await page.keyboard.press('v');

  // Входим в режим правки узла — как по двойному клику на холсте.
  await page.evaluate(() => window.__board.getState().startEditing('k1'));
  expect((await state(page)).editing).toBe('k1');

  // Та самая классика: печатаем «view» — три буквы из таблицы инструментов.
  for (const key of ['v', 'i', 'e', 'w']) await page.keyboard.press(key);

  const after = await state(page);
  expect(after.tool, 'инструмент не должен меняться во время ввода').toBe('select');
  expect(after.editing, 'режим правки не должен слетать').toBe('k1');
});

test('во время ввода в панели свойств клавиши тоже выключены', async ({ page }) => {
  await openBoard(page);
  await page.keyboard.press('v');
  await page.evaluate(() => window.__board.getState().select(['s1']));

  // Набор «12» в поле ширины: 1 и 2 безобидны, но проверяем и буквенные поля.
  const width = page.getByLabel('Ширина');
  await width.click();
  await page.keyboard.press('s');
  await page.keyboard.press('t');

  expect((await state(page)).tool, 'фокус в поле панели — инструмент не меняется').toBe('select');
});

test('Esc двухступенчатый: сначала выход из ввода, потом снятие выделения', async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => {
    window.__board.getState().select(['k1']);
    window.__board.getState().startEditing('k1');
  });

  const before = await state(page);
  expect(before.editing).toBe('k1');
  expect(before.selection).toEqual(['k1']);

  // Первый Esc — только выход из ввода. Выделение обязано остаться.
  await page.keyboard.press('Escape');
  const afterFirst = await state(page);
  expect(afterFirst.editing, 'первый Esc выходит из ввода').toBe(null);
  expect(afterFirst.selection, 'первый Esc НЕ снимает выделение').toEqual(['k1']);

  // Второй Esc — снимает выделение.
  await page.keyboard.press('Escape');
  expect((await state(page)).selection, 'второй Esc снимает выделение').toEqual([]);
});

test('«?» открывает и закрывает справку', async ({ page }) => {
  await openBoard(page);

  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Горячие клавиши')).toBeVisible();
  // Ищем внутри модалки: «Ромб» есть ещё и кнопкой в панели инструментов.
  await expect(dialog.getByText('Ромб')).toBeVisible();
  await expect(dialog.getByText('Отменить')).toBeVisible();
  await expect(dialog.getByText('пока не готово').first()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('команды, у которых есть рабочее действие в сторе', async ({ page }) => {
  await openBoard(page);

  // Cmd+A выделяет всё.
  await page.keyboard.press('ControlOrMeta+a');
  expect((await state(page)).selection.length).toBe(2);

  // Delete удаляет выделенное.
  await page.keyboard.press('Delete');
  expect((await state(page)).nodeCount).toBe(0);
});

test('Cmd+1 и Cmd+0 меняют вид', async ({ page }) => {
  await openBoard(page);

  await page.keyboard.press('ControlOrMeta+1');
  const fitted = await page.evaluate(() => window.__board.getState().document?.viewport.zoom);

  await page.keyboard.press('ControlOrMeta+0');
  const reset = await page.evaluate(() => window.__board.getState().document?.viewport.zoom);

  expect(reset).toBe(1);
  expect(fitted).not.toBe(reset);
});

test('клавиши правки: реализованные работают, нереализованные безобидны', async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => window.__board.getState().select(['s1']));

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Cmd+D — рабочее действие с 27 августа (ветка feat/duplicate-nodes).
  await page.keyboard.press('ControlOrMeta+d');
  const afterDuplicate = await state(page);
  expect(afterDuplicate.nodeCount, 'Cmd+D добавляет копию').toBe(3);
  expect(afterDuplicate.selection, 'выделение переезжает на копию').not.toEqual(['s1']);

  // Порядок слоёв тоже рабочий: копия уходит вниз и возвращается наверх.
  const copyId = afterDuplicate.selection[0];
  await page.keyboard.press('ControlOrMeta+[');
  expect((await state(page)).order[0], 'Cmd+[ отправляет в самый низ').toBe(copyId);
  await page.keyboard.press(']');
  expect((await state(page)).order[1], '] поднимает на шаг вперёд').toBe(copyId);
  await page.keyboard.press('ControlOrMeta+]');
  const raised = await state(page);
  expect(raised.order[raised.order.length - 1], 'Cmd+] поднимает в самый верх').toBe(copyId);

  // Cmd+G на одиночном выделении — осознанный no-op: группа из одного узла
  // не собирается (store.group возвращает null при members < 2).
  await page.keyboard.press('ControlOrMeta+g');
  expect((await state(page)).nodeCount, 'группа из одного узла не собирается').toBe(3);

  // Cmd+C и Cmd+V действия в сторе не имеют: в таблице клавиш они есть,
  // но `run` у них нет. Нажатие обязано быть безобидным, а не ронять доску.
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');

  expect(errors, 'нажатия не должны бросать').toEqual([]);
  expect((await state(page)).nodeCount, 'копирование пока ничего не делает').toBe(3);
});

test('Cmd+Z отменяет действие, Shift+Cmd+Z возвращает (FR-10)', async ({ page }) => {
  await openBoard(page);
  // Фикстура приезжает через loadDocument прямо в стор, в обход экрана, —
  // для истории это правка, а не открытие проекта, и она даёт свой шаг.
  // Ждём, пока он закроется, иначе удаление приклеится к нему.
  await page.waitForTimeout(600);

  await page.evaluate(() => window.__board.getState().select(['s1']));

  await page.keyboard.press('Delete');
  expect((await state(page)).nodeCount, 'узел удалён').toBe(1);

  // Шаг истории закрывается паузой после последнего изменения: пока она идёт,
  // отменять нечего. Ждём чуть дольше дебаунса.
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    window.__zPrevented = null;
    window.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'z') window.__zPrevented = event.defaultPrevented;
    });
  });

  await page.keyboard.press('ControlOrMeta+z');

  expect((await state(page)).order, 'узел вернулся на своё место в порядке').toEqual(['s1', 'k1']);
  // Отмену обязаны перехватить: иначе поверх нашей сработает браузерная.
  expect(await page.evaluate(() => window.__zPrevented)).toBe(true);

  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect((await state(page)).nodeCount, 'возврат снова удалил узел').toBe(1);
});

test('лишние Cmd+Z и Shift+Cmd+Z не роняют доску', async ({ page }) => {
  await openBoard(page);
  await page.waitForTimeout(600);

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Отменять больше, чем было сделано, — обычное дело: пользователь жмёт
  // Cmd+Z до упора. Дно стека должно быть тихим, а не исключением.
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ControlOrMeta+z');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ControlOrMeta+Shift+z');

  expect(errors).toEqual([]);
  expect((await state(page)).nodeCount, 'доска вернулась в исходное').toBe(2);
});
