import { expect, test } from '@playwright/test';

/**
 * Починка документа на обоих входах (П1 из
 * docs/nightly/shell/01-план-починки.md).
 *
 * Проверяется не только импорт. Главное здесь — что порча НЕ переживает
 * круг через IndexedDB: раньше документ с `zoom: 0` и дублями в `order`
 * записывался как есть, открывался таким после перезагрузки, средствами
 * UI не чинился и экспортировался обратно файлом, который проходил
 * собственную валидацию приложения.
 */

const poisoned = {
  format: 'prostor-board',
  version: 1,
  name: 'Порченая',
  document: {
    projectId: 'источник',
    schemaVersion: 1,
    nodes: {
      a: {
        id: 'a',
        type: 'shape',
        shape: 'rect',
        x: 0,
        y: 0,
        width: -500,
        height: -500,
        rotation: 0,
        opacity: 42,
        locked: false,
        fill: '#ffcc00',
        stroke: '#000000',
        strokeWidth: 1,
      },
    },
    order: ['a', 'a', 'нет-такого'],
    viewport: { x: 0, y: 0, zoom: 0 },
    background: { color: '#ffffff', grid: 'dots' },
  },
  images: {},
};

const viewState = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const document = window.__board.getState().document;
    const node = document?.nodes.a as { width: number; opacity: number } | undefined;
    return {
      zoom: document?.viewport.zoom,
      order: document?.order ?? [],
      width: node?.width,
      opacity: node?.opacity,
    };
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
});

test('порча не переживает круг через IndexedDB', async ({ page }) => {
  await page.setInputFiles('input[type=file]', {
    name: 'bad.prostor.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(poisoned), 'utf8'),
  });
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  await expect(page.locator('[data-sonner-toast]')).toContainText(/пришлось поправить/);
  // URL и тост появляются раньше, чем документ доедет в стор: загрузка идёт
  // отдельным чтением из IndexedDB уже на экране холста.
  await page.waitForFunction(() => window.__board.getState().document !== null);

  const healthy = { zoom: 0.1, order: ['a'], width: 1, opacity: 1 };
  expect(await viewState(page)).toEqual(healthy);

  // Перезагрузка читает документ уже из базы: он должен быть записан
  // починенным, а не чиниться заново при каждом открытии.
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForFunction(() => window.__board.getState().document !== null);

  expect(await viewState(page)).toEqual(healthy);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
});

test('экспорт порченой доски отдаёт уже здоровый файл', async ({ page }) => {
  await page.setInputFiles('input[type=file]', {
    name: 'bad.prostor.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(poisoned), 'utf8'),
  });
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  await page.waitForFunction(() => window.__board.getState().document !== null);

  await page.getByRole('button', { name: 'Экспорт' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Весь документ/ }).click();

  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const file = JSON.parse(Buffer.concat(chunks).toString());

  expect(file.document.viewport.zoom).toBe(0.1);
  expect(file.document.order).toEqual(['a']);
  expect(file.document.nodes.a.opacity).toBe(1);
  expect(file.document.nodes.a.width).toBe(1);
});

test('здоровый файл открывается без единого слова о починке', async ({ page }) => {
  const healthy = structuredClone(poisoned);
  healthy.document.order = ['a'];
  healthy.document.viewport.zoom = 1;
  healthy.document.nodes.a.width = 100;
  healthy.document.nodes.a.height = 60;
  healthy.document.nodes.a.opacity = 1;

  await page.setInputFiles('input[type=file]', {
    name: 'good.prostor.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(healthy), 'utf8'),
  });

  await expect(page.locator('[data-sonner-toast]')).toContainText(/открыта/);
  await expect(page.locator('[data-sonner-toast]')).not.toContainText(/поправить/);
});
