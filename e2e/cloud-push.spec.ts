import { expect, test } from '@playwright/test';

/**
 * Выгрузка доски на сервер (задача 4 плана cloud-sync). Сети нет — клиент
 * подменяется заглушкой, которая пишет вызовы `rpc('save_project')` в массив на `window`.
 *
 * Заглушку ставим через `addInitScript`, а не `page.evaluate` после навигации:
 * `main.tsx` зовёт `initSession()` синхронно при загрузке модулей, до первого
 * доступного тесту момента после `page.goto` — см. `e2e/cloud-auth.spec.ts`.
 */

const stubCloudClient = (opts: { failSave: boolean }) => {
  const user = { id: 'user-1', email: 'test@example.com' };
  type FakeSession = { user: typeof user };
  let session: FakeSession | null = null;
  let onChange: ((event: string, session: FakeSession | null) => void) | null = null;

  window.__saveProjectCalls = [];
  // Читается на каждый вызов, а не один раз при создании клиента: тест на
  // Important 2 должен переключить отказ сети посреди сценария, между двумя
  // выгрузками одной и той же доски.
  window.__failSaveProject = opts.failSave;

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
    rpc: async (name: string, args?: Record<string, unknown>) => {
      if (name === 'accept_my_project_invites') return { data: [], error: null };
      if (name !== 'save_project') return { data: null, error: { message: 'unknown rpc' } };
      window.__saveProjectCalls.push(args as Window['__saveProjectCalls'][number]);
      if (window.__failSaveProject) return { data: null, error: { message: 'сеть недоступна' } };
      return {
        data: [
          {
            revision: window.__saveProjectCalls.length,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          },
        ],
        error: null,
      };
    },
    from: (table: string) => ({
      select: () =>
        table === 'project_members'
          ? { eq: async () => ({ data: [], error: null }) }
          : Promise.resolve({ data: [], error: null }),
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
  // Сужаем до диалога входа по заголовку: сразу после входа приложение
  // может открыть ВТОРОЙ диалог — вопрос AdoptDialog «Перенести доски в
  // аккаунт?» (если на устройстве есть локальная доска без владельца).
  // Без фильтра getByRole('dialog') иногда находит уже его, и проверка
  // «диалог скрылся» ловит гонку вместо реального закрытия формы входа.
  const dialog = page.getByRole('dialog').filter({ hasText: 'Вход' });
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
  await page.addInitScript(stubCloudClient, { failSave: false });
  await page.goto('/');

  await signIn(page);
  const projectId = await createProject(page, 'Облачная доска');

  await addShape(page, 'shape-1');
  await expect(page.getByText('Все изменения сохранены')).toBeVisible();

  // 500 мс автосохранения + 3000 мс дебаунса выгрузки — с запасом.
  await page.waitForTimeout(3500);

  const calls = await page.evaluate(() => window.__saveProjectCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].p_project_id).toBe(projectId);
  expect(Object.keys(calls[0].p_document.nodes)).toContain('shape-1');
});

test('отказ сети не портит доску — узел на месте, sync помечен dirty', async ({ page }) => {
  await page.addInitScript(stubCloudClient, { failSave: true });
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

test('после успешной выгрузки обрыв сети не стирает remoteUpdatedAt (Important 2)', async ({
  page,
}) => {
  await page.addInitScript(stubCloudClient, { failSave: false });
  await page.goto('/');

  await signIn(page);
  const projectId = await createProject(page, 'Сначала успех, потом обрыв');

  await addShape(page, 'shape-3');
  await expect(page.getByText('Все изменения сохранены')).toBeVisible();
  await page.waitForTimeout(3500);

  const afterSuccess = (await readSyncState(page, projectId)) as
    | { dirty: boolean; remoteUpdatedAt?: number }
    | undefined;
  expect(afterSuccess?.dirty).toBe(false);
  expect(afterSuccess?.remoteUpdatedAt).toBeDefined();

  // Сеть отваливается перед следующей правкой той же доски.
  await page.evaluate(() => {
    window.__failSaveProject = true;
  });
  await addShape(page, 'shape-4');
  await expect(page.getByText('Все изменения сохранены')).toBeVisible();
  await page.waitForTimeout(3500);

  const afterFailure = (await readSyncState(page, projectId)) as
    | { dirty: boolean; remoteUpdatedAt?: number }
    | undefined;
  expect(afterFailure?.dirty).toBe(true);
  // `put` — это полная перезапись строки: без починки `remoteUpdatedAt`
  // пропадал бы вовсе, и доска, которая уже уезжала на сервер, становилась
  // неотличима от той, что не уезжала никогда.
  expect(afterFailure?.remoteUpdatedAt).toBe(afterSuccess?.remoteUpdatedAt);
});

test('после уже отправленной выгрузки уход с холста не шлёт лишний save_project (Important 1)', async ({
  page,
}) => {
  await page.addInitScript(stubCloudClient, { failSave: false });
  await page.goto('/');

  await signIn(page);
  await createProject(page, 'Без лишней выгрузки на выходе');

  await addShape(page, 'shape-5');
  await expect(page.getByText('Все изменения сохранены')).toBeVisible();

  // Дожидаемся, пока таймер дебаунса сработает сам — выгрузка уже ушла.
  await page.waitForTimeout(3500);
  expect(await page.evaluate(() => window.__saveProjectCalls.length)).toBe(1);

  // Уход с холста ПОСЛЕ того, как таймер уже отработал: cleanup не должен
  // принять сработавший таймер за ещё не отправленную выгрузку и продублировать её.
  await page.getByRole('link', { name: 'Назад к списку' }).click();
  await expect(page).toHaveURL('/');
  // pushProject в cleanup не ждут (`void`) — даём микрозадачам осесть, иначе
  // проверка успевает раньше, чем ушёл бы лишний вызов.
  await page.waitForTimeout(300);

  expect(await page.evaluate(() => window.__saveProjectCalls.length)).toBe(1);
});

test('индикатор различает «сохранено только здесь» и настоящее сохранение (задача 8)', async ({
  page,
}) => {
  await page.addInitScript(stubCloudClient, { failSave: true });
  await page.goto('/');

  await signIn(page);
  await createProject(page, 'Доска для индикатора');

  await addShape(page, 'shape-6');
  // Автосохранение в IndexedDB прошло — документ цел локально...
  await expect(page.getByText('Все изменения сохранены')).toBeVisible();

  // ...но выгрузка на сервер отказала: индикатор обязан сказать именно это,
  // а не молчать и не путать это с потерей данных.
  await page.waitForTimeout(3500);
  await expect(page.getByText('Сохранено только здесь')).toBeVisible();

  // Сеть починилась, следующая правка уезжает — индикатор возвращается
  // к обычному «сохранено».
  await page.evaluate(() => {
    window.__failSaveProject = false;
  });
  await addShape(page, 'shape-7');
  await expect(page.getByText('Все изменения сохранены')).toBeVisible();
  await page.waitForTimeout(3500);
  await expect(page.getByText('Все изменения сохранены')).toBeVisible();
  await expect(page.getByText('Сохранено только здесь')).toBeHidden();
});
