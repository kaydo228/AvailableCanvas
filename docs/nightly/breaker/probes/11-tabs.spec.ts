import { test } from '@playwright/test';
import { shape } from './helpers';

test.setTimeout(120_000);

test('11.1 две вкладки на одной доске правят одновременно', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const errA: string[] = [];
  a.on('pageerror', (e) => errA.push(e.message));

  await a.goto('/');
  await a.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await a.reload();
  await a.getByRole('button', { name: 'Создать проект' }).last().click();
  await a.getByLabel('Имя проекта').fill('Две вкладки');
  await a.getByRole('button', { name: 'Создать' }).click();
  await a.waitForFunction(() => window.__board.getState().document !== null);
  const url = a.url();

  const b = await ctx.newPage();
  const errB: string[] = [];
  b.on('pageerror', (e) => errB.push(e.message));
  await b.goto(url);
  await b.waitForFunction(() => window.__board.getState().document !== null);

  // обе правят
  await a.evaluate((n) => window.__board.getState().addNode(n as never), shape('fromA', 0, 0));
  await b.evaluate((n) => window.__board.getState().addNode(n as never), shape('fromB', 400, 0));
  await a.waitForTimeout(2500);
  await b.waitForTimeout(2500);

  const status = async (p: import('@playwright/test').Page) =>
    p.evaluate(async () => {
      const mod = await import('/src/features/persistence/autosave.ts');
      return mod.useSaveStatus.getState().status;
    });
  console.log('статус A:', await status(a), '| статус B:', await status(b));
  console.log('индикатор A:', JSON.stringify(await a.locator('header, [aria-live=polite]').allInnerTexts()));
  console.log('индикатор B:', JSON.stringify(await b.locator('[aria-live=polite]').allInnerTexts()));
  console.log('тосты A:', JSON.stringify(await a.locator('[data-sonner-toast]').allInnerTexts()));
  console.log('тосты B:', JSON.stringify(await b.locator('[data-sonner-toast]').allInnerTexts()));

  // кто победил в базе
  await a.reload();
  await a.waitForFunction(() => window.__board.getState().document !== null);
  await a.waitForTimeout(600);
  console.log('в базе оказались узлы:', JSON.stringify(await a.evaluate(() => Object.keys(window.__board.getState().document!.nodes))));

  // вкладка B продолжает править после конфликта
  await b.evaluate((n) => window.__board.getState().addNode(n as never), shape('fromB2', 800, 0));
  await b.waitForTimeout(2000);
  console.log('статус B после новой правки:', await status(b));
  console.log('индикатор B после новой правки:', JSON.stringify(await b.locator('[aria-live=polite]').allInnerTexts()));
  console.log('тостов B стало:', (await b.locator('[data-sonner-toast]').allInnerTexts()).length);
  console.log('errors A:', JSON.stringify(errA), 'errors B:', JSON.stringify(errB));
  await ctx.close();
});

test('11.2 одна вкладка удаляет проект, вторая продолжает рисовать', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const errA: string[] = [];
  a.on('pageerror', (e) => errA.push(e.message));

  await a.goto('/');
  await a.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await a.reload();
  await a.getByRole('button', { name: 'Создать проект' }).last().click();
  await a.getByLabel('Имя проекта').fill('Удаляемая');
  await a.getByRole('button', { name: 'Создать' }).click();
  await a.waitForFunction(() => window.__board.getState().document !== null);
  const url = a.url();
  const projectId = url.split('/p/')[1];

  const b = await ctx.newPage();
  const errB: string[] = [];
  b.on('pageerror', (e) => errB.push(e.message));
  await b.goto(url);
  await b.waitForFunction(() => window.__board.getState().document !== null);

  // A удаляет проект из базы (как из списка)
  await a.evaluate(async (id) => {
    const repo = await import('/src/features/persistence/projectsRepo.ts');
    await repo.deleteProject(id);
    const sync = await import('/src/features/persistence/sync.ts');
    sync.publish({ kind: 'deleted', projectId: id });
  }, projectId);
  await b.waitForTimeout(1500);

  await b.evaluate((n) => window.__board.getState().addNode(n as never), shape('после', 0, 0));
  await b.waitForTimeout(2500);
  console.log('тосты B:', JSON.stringify(await b.locator('[data-sonner-toast]').allInnerTexts()));
  console.log('URL B:', new URL(b.url()).pathname);
  const st = await b.evaluate(async () => {
    const mod = await import('/src/features/persistence/autosave.ts');
    return mod.useSaveStatus.getState().status;
  });
  console.log('статус B:', st);
  console.log('errors A:', JSON.stringify(errA), 'errors B:', JSON.stringify(errB));
  await ctx.close();
});
