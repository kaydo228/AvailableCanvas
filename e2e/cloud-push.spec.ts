import { expect, test } from '@playwright/test';

/**
 * Выгрузка доски на сервер (задача 4 плана cloud-sync). Сети нет — клиент
 * подменяется заглушкой, которая пишет вызовы `upsert` в массив на `window`.
 *
 * Заглушку ставим через `addInitScript`, а не `page.evaluate` после навигации:
 * `main.tsx` зовёт `initSession()` синхронно при загрузке модулей, до первого
 * доступного тесту момента после `page.goto` — см. `e2e/cloud-auth.spec.ts`.
 */

const stubCloudClient = (opts: { failUpsert: boolean }) => {
  const user = { id: 'user-1', email: 'test@example.com' };
  type FakeSession = { user: typeof user };
  let session: FakeSession | null = null;
  let onChange: ((event: string, session: FakeSession | null) => void) | null = null;

  window.__upserts = [];

  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (cb: (event: string, session: FakeSession | null) => void) => {
        onChange = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: async () => {
        session = { user };
        onChange?.('SIGNED_IN', session);
        return { data: { session, user }, error: null };
      },
      signUp: async () => ({ data: { session: null, user: null }, error: null }),
      signOut: async () => {
        session = null;
        onChange?.('SIGNED_OUT', null);
        return { error: null };
      },
    },
    from: (_table: string) => ({
      upsert: async (row: Window['__upserts'][number]) => {
        window.__upserts.push(row);
        return opts.failUpsert ? { error: { message: 'сеть недоступна' } } : { error: null };
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  };

  Object.defineProperty(window, '__cloud', {
    configurable: true,
    set(value: { setCloud: (client: unknown) => void }) {
      value.setCloud(client);
    },
    get() {
      return { setCloud: () => {} };
    },
  });
};

const signIn = async (page: import('@playwright/test').Page) => {
  const header = page.locator('header');
  await header.getByRole('button', { name: 'Войти' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Почта').fill('test@example.com');
  await dialog.getByLabel('Пароль').fill('secret123');
  await dialog.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(dialog).toBeHidden();
};

const createProject = async (page: import('@playwright/test').Page, name: string) => {
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill(name);
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
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

/** Читает строку `sync` напрямую из IndexedDB — так же, как e2e/blobs-gc.spec.ts читает `blobs`. */
const readSyncState = (page: import('@playwright/test').Page, projectId: string) =>
  page.evaluate(async (id) => {
    const request = indexedDB.open('prostor');
    const db: IDBDatabase = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise((resolve) => {
      const query = db.transaction('sync').objectStore('sync').get(id);
      query.onsuccess = () => resolve(query.result);
    });
  }, projectId);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
});

test('правка доезжает на сервер один раз, с новым узлом внутри', async ({ page }) => {
  await page.addInitScript(stubCloudClient, { failUpsert: false });
  await page.goto('/');

  await signIn(page);
  const projectId = await createProject(page, 'Облачная доска');

  await addShape(page, 'shape-1');
  await expect(page.getByText('Все изменения сохранены')).toBeVisible();

  // 500 мс автосохранения + 3000 мс дебаунса выгрузки — с запасом.
  await page.waitForTimeout(3500);

  const upserts = await page.evaluate(() => window.__upserts);
  expect(upserts).toHaveLength(1);
  expect(upserts[0].id).toBe(projectId);
  expect(Object.keys(upserts[0].document.nodes)).toContain('shape-1');
});

test('отказ сети не портит доску — узел на месте, sync помечен dirty', async ({ page }) => {
  await page.addInitScript(stubCloudClient, { failUpsert: true });
  await page.goto('/');

  await signIn(page);
  const projectId = await createProject(page, 'Доска без сети');

  await addShape(page, 'shape-2');
  await expect(page.getByText('Все изменения сохранены')).toBeVisible();

  await page.waitForTimeout(3500);

  // Доска осталась на месте — локальные данные отказ сети не тронул.
  const nodes = await page.evaluate(() => window.__board.getState().document?.nodes ?? {});
  expect(Object.keys(nodes)).toContain('shape-2');

  const state = (await readSyncState(page, projectId)) as { dirty: boolean } | undefined;
  expect(state?.dirty).toBe(true);
});
