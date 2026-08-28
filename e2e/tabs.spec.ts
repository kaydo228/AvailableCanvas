import { expect, test } from '@playwright/test';

/**
 * Две вкладки над одним хранилищем (П3, П4 из
 * docs/nightly/shell/01-план-починки.md).
 *
 * До этих проверок обе вкладки писали документ вслепую: побеждала последняя,
 * правки первой исчезали, и обе показывали «Все изменения сохранены».
 * Здесь проверяется не то, что конфликт разрешается, а то, что о нём СКАЗАНО:
 * автоматического слияния досок нет и не планируется.
 */

const create = async (page: import('@playwright/test').Page, name: string) => {
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill(name);
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  // Экран холста приезжает отдельным чанком (ленивый маршрут, 28.08), поэтому
  // адрес меняется раньше, чем экран смонтирован. Фикстура, положенная до этого
  // момента, будет затёрта чтением документа из IndexedDB.
  await expect(page.locator('canvas').first()).toBeVisible();
  return page.url().split('/p/')[1] as string;
};

const addShape = (page: import('@playwright/test').Page, id: string) =>
  page.evaluate((nodeId) => {
    window.__board.getState().addNode({
      id: nodeId,
      type: 'shape',
      shape: 'rect',
      x: 10,
      y: 10,
      width: 80,
      height: 40,
      rotation: 0,
      opacity: 1,
      locked: false,
      fill: '#ff0000',
      stroke: '#111111',
      strokeWidth: 1,
    });
  }, id);

/** Индикатор в шапке холста, а не тост: тексты у них совпадают. */
const indicator = (page: import('@playwright/test').Page) =>
  page.locator('header span[aria-live="polite"]');

const storedNodes = (page: import('@playwright/test').Page, projectId: string) =>
  page.evaluate(async (id) => {
    const repo = await import('/src/features/persistence/projectsRepo.ts');
    const document = await repo.getDocument(id);
    return Object.keys(document?.nodes ?? {}).sort();
  }, projectId);

test('вторая вкладка не затирает правки первой молча', async ({ context }) => {
  const first = await context.newPage();
  await first.goto('/');
  await first.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await first.reload();

  const projectId = await create(first, 'Общая доска');

  const second = await context.newPage();
  await second.goto(`/p/${projectId}`);
  await expect(second.locator('canvas').first()).toBeVisible();

  // Вторая вкладка пишет свой узел и двигает updatedAt.
  await addShape(second, 'изВторой');
  await expect(indicator(second)).toHaveText('Все изменения сохранены');

  // Первая вкладка об этом узнаёт через канал, ещё до собственной записи.
  await expect(indicator(first)).toHaveText('Изменена в другой вкладке');

  // И её последующая правка чужую работу не стирает.
  await addShape(first, 'изПервой');
  await first.waitForTimeout(1200);

  expect(await storedNodes(first, projectId)).toEqual(['изВторой']);
});

test('удаление проекта в другой вкладке видно на холсте и не плодит сирот', async ({ context }) => {
  const canvas = await context.newPage();
  await canvas.goto('/');
  await canvas.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await canvas.reload();

  const projectId = await create(canvas, 'Обречённый');

  const list = await context.newPage();
  await list.goto('/');
  await list.evaluate(async (id) => {
    const repo = await import('/src/features/persistence/projectsRepo.ts');
    await repo.deleteProject(id);
  }, projectId);

  await expect(indicator(canvas)).toHaveText('Проект удалён');

  // Правка после удаления не воскрешает документ.
  await addShape(canvas, 'поздно');
  await canvas.waitForTimeout(1200);

  const leftovers = await list.evaluate(async () => {
    const request = indexedDB.open('prostor');
    const db: IDBDatabase = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const count = (store: string) =>
      new Promise<number>((resolve) => {
        const query = db.transaction(store).objectStore(store).count();
        query.onsuccess = () => resolve(query.result);
      });
    return { projects: await count('projects'), documents: await count('documents') };
  });

  expect(leftovers).toEqual({ projects: 0, documents: 0 });
});

test('список проектов обновляется от соседней вкладки без перезагрузки', async ({ context }) => {
  const list = await context.newPage();
  await list.goto('/');
  await list.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await list.reload();

  const other = await context.newPage();
  await other.goto('/');
  await create(other, 'Заведён соседом');

  await expect(list.getByText('Заведён соседом')).toBeVisible();
});
