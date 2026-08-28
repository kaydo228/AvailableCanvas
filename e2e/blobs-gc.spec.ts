import { expect, test } from '@playwright/test';

/**
 * Сборка мусора по картинкам (П2 из docs/nightly/shell/01-план-починки.md).
 *
 * Главное, ради чего файл существует: удаление проекта обязано освобождать его
 * картинки, а удаление узла — НЕ обязано. Узел вернётся по Cmd+Z, и стёртая
 * под ним картинка превратила бы отмену в дыру. Разницу между этими двумя
 * случаями легко потерять при рефакторинге, и вручную её никто не проверит.
 */

/** 1×1 PNG. Реальный файл нужен: putImage измеряет картинку через <img>. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const boardWithImages = (count: number) => {
  const nodes: Record<string, unknown> = {};
  const order: string[] = [];
  const images: Record<string, string> = {};

  for (let i = 0; i < count; i++) {
    const id = `img${i}`;
    nodes[id] = {
      id,
      type: 'image',
      x: i * 120,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      locked: false,
      blobId: `b${i}`,
      naturalWidth: 1,
      naturalHeight: 1,
    };
    order.push(id);
    images[`b${i}`] = PNG;
  }

  return {
    format: 'prostor-board',
    version: 1,
    name: `С картинками ${count}`,
    document: {
      projectId: 'источник',
      schemaVersion: 1,
      nodes,
      order,
      viewport: { x: 0, y: 0, zoom: 1 },
      background: { color: '#ffffff', grid: 'dots' },
    },
    images,
  };
};

const blobCount = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => {
    const request = indexedDB.open('prostor');
    const db: IDBDatabase = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise<number>((resolve) => {
      const query = db.transaction('blobs').objectStore('blobs').count();
      query.onsuccess = () => resolve(query.result);
    });
  });

const importBoard = async (page: import('@playwright/test').Page, file: unknown) => {
  await page.setInputFiles('input[type=file]', {
    name: 'board.prostor.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file), 'utf8'),
  });
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  // Экран холста приезжает отдельным чанком (ленивый маршрут, 28.08), поэтому
  // адрес меняется раньше, чем экран смонтирован. Фикстура, положенная до этого
  // момента, будет затёрта чтением документа из IndexedDB.
  await expect(page.locator('canvas').first()).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
});

test('удаление проекта освобождает его картинки', async ({ page }) => {
  await importBoard(page, boardWithImages(3));
  const projectId = page.url().split('/p/')[1] as string;
  expect(await blobCount(page)).toBe(3);

  await page.goto('/');
  await page.evaluate(async (id) => {
    const repo = await import('/src/features/persistence/projectsRepo.ts');
    await repo.deleteProject(id);
  }, projectId);

  expect(await blobCount(page)).toBe(0);
});

test('удаление узла картинку НЕ трогает: узел вернётся по Cmd+Z', async ({ page }) => {
  await importBoard(page, boardWithImages(2));
  expect(await blobCount(page)).toBe(2);

  await page.evaluate(() => window.__board.getState().removeNodes(['img0', 'img1']));
  await page.waitForTimeout(1200); // окно автосохранения

  expect(await blobCount(page)).toBe(2);

  await page.keyboard.press('ControlOrMeta+KeyZ');
  await page.waitForTimeout(400);

  const restored = await page.evaluate(
    () => Object.keys(window.__board.getState().document?.nodes ?? {}).length,
  );
  expect(restored).toBeGreaterThan(0);
  expect(await blobCount(page)).toBe(2);
});

test('картинка, попавшая в копию проекта, при удалении оригинала не пропадает', async ({
  page,
}) => {
  await importBoard(page, boardWithImages(1));
  const original = page.url().split('/p/')[1] as string;

  await page.goto('/');
  const copyId = await page.evaluate(async (id) => {
    const repo = await import('/src/features/persistence/projectsRepo.ts');
    const copy = await repo.duplicateProject(id);
    return copy?.id;
  }, original);
  expect(copyId).toBeTruthy();

  await page.evaluate(async (id) => {
    const repo = await import('/src/features/persistence/projectsRepo.ts');
    await repo.deleteProject(id);
  }, original);

  // Копия ссылается на тот же blobId — сносить его нельзя.
  expect(await blobCount(page)).toBe(1);
});

test('неудачный импорт не оставляет за собой записанных картинок', async ({ page }) => {
  const file = boardWithImages(3) as { images: Record<string, string> };
  file.images.b1 = 'data:image/png;base64,ЭТО-НЕ-BASE64';

  await page.setInputFiles('input[type=file]', {
    name: 'broken.prostor.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file), 'utf8'),
  });

  await expect(page.locator('[data-sonner-toast]')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(await blobCount(page)).toBe(0);
});

test('картинка по чужому URL не скачивается и импорт отклоняется', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/маячок')) requested.push(request.url());
  });

  const file = boardWithImages(1) as {
    images: Record<string, string>;
    document: { nodes: Record<string, { blobId: string }> };
  };
  file.document.nodes.img0.blobId = 'внешняя';
  file.images.внешняя = '/маячок?доска=открыта';

  await page.setInputFiles('input[type=file]', {
    name: 'beacon.prostor.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file), 'utf8'),
  });

  await expect(page.locator('[data-sonner-toast]')).toContainText(/не как data-URL картинки/);
  expect(requested).toEqual([]);
});
