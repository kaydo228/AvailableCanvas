import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';

/**
 * Экспорт и импорт (FR-12).
 *
 * Проверяется через настоящие скачивания и настоящий выбор файла: экспорт,
 * который «работает, но файл не скачивается», — ровно тот случай, ради которого
 * этот сценарий и написан.
 */

/** Сигнатура PNG. Файл, который открывается как картинка, начинается с неё. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const openBoard = async (page: Page, name: string) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill(name);
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
          x: 100,
          y: 100,
          width: 200,
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
          x: 900,
          y: 700,
          width: 180,
          height: 180,
          rotation: 0,
          opacity: 1,
          locked: false,
          fill: '#FEF3A8',
          text: { value: 'далеко от начала', fontSize: 16, color: '#4A3E0B', align: 'left' },
        },
      },
      order: ['s1', 'k1'],
    });
  });
  await expect
    .poll(() => page.evaluate(() => window.__board.getState().document?.order.length ?? 0))
    .toBe(2);
};

/** Открывает меню и жмёт пункт, дожидаясь скачивания. */
const exportVia = async (page: Page, item: RegExp) => {
  await page.getByRole('button', { name: 'Экспорт' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem').filter({ hasText: item }).first().click(),
  ]);
  return download;
};

test('PNG всей доски — настоящий PNG, и в нём вся доска, а не экран', async ({ page }) => {
  await openBoard(page, 'Картинка');

  const download = await exportVia(page, /Вся доска\s*1×/);
  expect(download.suggestedFilename()).toBe('Картинка 1x.png');

  const path = await download.path();
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 8), 'файл начинается сигнатурой PNG').toEqual(PNG_MAGIC);

  // Стикер лежит в точке 900×700 — далеко за краем окна. Размер считается
  // по узлам, поэтому он обязан попасть в картинку целиком:
  // ширина 100…1080 плюс поля 24 с каждой стороны, высота 100…880 так же.
  const size = await page.evaluate(async () => {
    const { renderPng } = await import('/src/features/export/model/exportPng.ts');
    const png = await renderPng({ scope: 'board', scale: 1 });
    return { width: png.width, height: png.height };
  });
  expect(size.width).toBe(1028);
  expect(size.height).toBe(828);
});

test('2× даёт ровно вдвое больший файл по стороне', async ({ page }) => {
  await openBoard(page, 'Картинка');

  const sizes = await page.evaluate(async () => {
    const { renderPng } = await import('/src/features/export/model/exportPng.ts');
    const one = await renderPng({ scope: 'board', scale: 1 });
    const two = await renderPng({ scope: 'board', scale: 2 });
    return { one: one.width, two: two.width };
  });

  expect(sizes.two).toBe(sizes.one * 2);
});

test('JSON уезжает целиком и открывается обратно новым проектом', async ({ page }) => {
  await openBoard(page, 'Документ');

  const download = await exportVia(page, /Весь документ/);
  expect(download.suggestedFilename()).toBe('Документ.prostor.json');

  const text = await readFile(await download.path(), 'utf8');
  const file = JSON.parse(text);
  expect(file.format).toBe('prostor-board');
  expect(Object.keys(file.document.nodes)).toEqual(['s1', 'k1']);

  await page.getByRole('link', { name: 'Назад к списку' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'Документ.prostor.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });

  // Импорт заводит НОВЫЙ проект и открывает его.
  await expect(page.getByText('Доска «Документ» открыта')).toBeVisible();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);

  const opened = await page.evaluate(() => {
    const document = window.__board.getState().document;
    return { order: document?.order ?? [], projectId: document?.projectId };
  });
  expect(opened.order).toEqual(['s1', 'k1']);
  expect(opened.projectId).not.toBe(file.document.projectId);
});

test('обрезанный и чужой по версии файл не роняют приложение', async ({ page }) => {
  await openBoard(page, 'Документ');
  const text = await readFile(await (await exportVia(page, /Весь документ/)).path(), 'utf8');

  await page.getByRole('link', { name: 'Назад к списку' }).click();
  const input = page.locator('input[type=file]');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // 1. Обрезанный посередине.
  await input.setInputFiles({
    name: 'Обрезанный.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text.slice(0, Math.floor(text.length / 2))),
  });
  await expect(page.getByText(/повреждён или скачался не полностью/)).toBeVisible();

  // 2. Другая версия схемы плюс лишние поля.
  const future = JSON.parse(text);
  future.version = 2;
  future.exportedBy = 'prostor 9.0';
  future.document.schemaVersion = 2;
  future.document.layers = ['фон'];
  await input.setInputFiles({
    name: 'Будущий.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(future)),
  });
  await expect(page.getByText(/более новой версией Prostor/)).toBeVisible();

  // 3. Просто чужой JSON.
  await input.setInputFiles({
    name: 'Чужой.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(page.getByText(/не файл доски Prostor/)).toBeVisible();

  expect(errors, 'ни одного исключения на всём пути').toEqual([]);
  await expect(page).toHaveURL(/\/$/);
  // Ни один битый файл не завёл проект: в списке только исходный.
  await expect(page.getByText('Документ')).toHaveCount(1);
});

test('картинка по внешнему адресу не скачивается, а отбивается', async ({ page }) => {
  await openBoard(page, 'Документ');
  const text = await readFile(await (await exportVia(page, /Весь документ/)).path(), 'utf8');

  await page.getByRole('link', { name: 'Назад к списку' }).click();

  // Ловим ЛЮБОЙ выход наружу: импорт обязан отказать до сети, а не после.
  const outside: string[] = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (!url.startsWith('http://localhost') && !url.startsWith('data:')) outside.push(url);
    return route.abort();
  });

  const evil = JSON.parse(text);
  evil.document.nodes.img = {
    id: 'img',
    type: 'image',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    locked: false,
    blobId: 'b1',
    naturalWidth: 10,
    naturalHeight: 10,
  };
  evil.document.order.push('img');
  evil.images = { b1: 'https://example.invalid/пиксель.gif' };

  await page.locator('input[type=file]').setInputFiles({
    name: 'Маячок.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(evil)),
  });

  await expect(page.getByText(/не как data-URL/)).toBeVisible();
  expect(outside, 'ни одного запроса за пределы localhost').toEqual([]);
  await expect(page).toHaveURL(/\/$/);
});
