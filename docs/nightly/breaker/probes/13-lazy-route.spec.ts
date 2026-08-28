import { test } from '@playwright/test';
import { doc, shape, violations, watchErrors } from './helpers';

test.setTimeout(180_000);

/** Проект с парой узлов; возвращает его URL. */
const makeProject = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('Ленивый маршрут');
  await page.getByRole('button', { name: 'Создать' }).click();
  await page.waitForFunction(() => window.__board.getState().document !== null);
  await page.evaluate((nodes) => {
    const b = window.__board.getState();
    for (const n of nodes) b.addNode(n as never);
  }, [shape('a', 100, 100), shape('b', 400, 100)]);
  await page.waitForTimeout(1500);
  return page.url();
};

test('13.1 клавиши в окно между сменой адреса и монтированием холста', async ({ page }) => {
  const errors = watchErrors(page);
  const url = await makeProject(page);

  // тормозим загрузку куска холста, чтобы окно стало широким
  await page.route('**/CanvasScreen*', async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });

  await page.goto('/');
  await page.waitForTimeout(500);
  const nav = page.goto(url).catch(() => undefined);
  await page.waitForTimeout(150);
  // в это окно бьём по клавишам, которые на холсте что-то делают
  for (const key of ['Delete', 'Control+a', 'Control+d', 'Control+g', 'Control+z', 'Escape']) {
    await page.keyboard.press(key);
  }
  await nav;
  await page.waitForFunction(() => window.__board.getState().document !== null, undefined, { timeout: 30_000 });
  await page.waitForTimeout(1000);

  const d = await doc(page);
  console.log('узлы после клавиш в окне ожидания:', JSON.stringify(Object.keys(d!.nodes)));
  console.log('выделение:', JSON.stringify(await page.evaluate(() => window.__board.getState().selection)));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors));
});

test('13.2 уйти назад, не дождавшись монтирования холста', async ({ page }) => {
  const errors = watchErrors(page);
  const url = await makeProject(page);
  await page.route('**/CanvasScreen*', async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });

  await page.goto('/');
  await page.waitForTimeout(300);
  const nav = page.goto(url).catch(() => undefined);
  await page.waitForTimeout(200);
  await page.goBack().catch(() => undefined);
  await nav;
  await page.waitForTimeout(4000);
  console.log('где оказались:', new URL(page.url()).pathname);
  console.log('документ в сторе:', await page.evaluate(() => window.__board.getState().document?.projectId ?? null));
  console.log('errors:', JSON.stringify(errors));

  // база не должна быть затёрта пустым документом
  await page.goto(url);
  await page.waitForFunction(() => window.__board.getState().document !== null, undefined, { timeout: 30_000 });
  await page.waitForTimeout(500);
  const d = await doc(page);
  console.log('узлы после возвращения:', JSON.stringify(Object.keys(d!.nodes)));
});

test('13.3 быстрые метания между списком и доской', async ({ page }) => {
  const errors = watchErrors(page);
  const url = await makeProject(page);
  for (let i = 0; i < 8; i += 1) {
    await page.evaluate((u) => window.history.pushState({}, '', new URL(u).pathname), url);
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
    await page.waitForTimeout(60);
    await page.evaluate(() => window.history.pushState({}, '', '/'));
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
    await page.waitForTimeout(60);
  }
  await page.goto(url);
  await page.waitForFunction(() => window.__board.getState().document !== null, undefined, { timeout: 30_000 });
  await page.waitForTimeout(1000);
  const d = await doc(page);
  console.log('узлы после метаний:', JSON.stringify(Object.keys(d!.nodes)));
  console.log('violations:', JSON.stringify(await violations(page)));
  console.log('errors:', JSON.stringify(errors.slice(0, 5)), 'всего', errors.length);
});

test('13.4 адрес несуществующего проекта', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
  await page.goto('/p/такого-нет');
  await page.waitForTimeout(3000);
  console.log('где оказались:', new URL(page.url()).pathname);
  console.log('тосты:', JSON.stringify(await page.locator('[data-sonner-toast]').allInnerTexts()));
  console.log('errors:', JSON.stringify(errors));
});
