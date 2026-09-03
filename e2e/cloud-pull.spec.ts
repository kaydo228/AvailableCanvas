import { expect, test } from '@playwright/test';

/**
 * Скачивание досок и применение решений слияния (задача 5 плана cloud-sync),
 * плюс правка раунда 1: круг синхронизации при входе (`useCloudSyncOnLogin`)
 * живёт на уровне приложения (`Router`), а не на экране холста. Кнопка
 * «Войти» стоит в шапке списка проектов — там хука на холсте нет, и до этой
 * правки человек, вошедший на новом устройстве, видел пустой список, пока
 * не откроет хоть одну доску вручную.
 *
 * Сети нет — клиент подменяется заглушкой с фиксированным списком строк на
 * сервере: `select(...).eq('owner', ...)` обслуживает `remoteList` (и заодно
 * считает свои вызовы в `window.__syncCalls` — один вызов на один круг
 * `syncNow`), `select('*').eq('id', ...).single()` — `pullProject`.
 */

interface Row {
  id: string;
  owner: string;
  name: string;
  created_at: string;
  updated_at: string;
  thumbnail: string | null;
  document: unknown;
  is_public: boolean;
}

const stubCloudClient = (rows: Row[]) => {
  const user = { id: 'user-1', email: 'test@example.com' };
  type FakeSession = { user: typeof user };
  let session: FakeSession | null = null;
  let onChange: ((event: string, session: FakeSession | null) => void) | null = null;

  window.__syncCalls = 0;

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
      select: (_columns: string) => ({
        eq: (column: string, value: string) => {
          // remoteList: select('id, updated_at').eq('owner', owner) — без .single(), сразу thenable.
          // Вызывается ровно раз на каждый syncNow — считаем как счётчик кругов синхронизации.
          if (column === 'owner') {
            window.__syncCalls += 1;
            const data = rows
              .filter((row) => row.owner === value)
              .map((row) => ({ id: row.id, updated_at: row.updated_at }));
            return Promise.resolve({ data, error: null });
          }
          // pullProject: select('*').eq('id', projectId).single().
          return {
            single: async () => {
              const row = rows.find((r) => r.id === value);
              return row
                ? { data: row, error: null }
                : { data: null, error: { message: 'доски нет на сервере' } };
            },
          };
        },
      }),
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

const signOut = async (page: import('@playwright/test').Page) => {
  await page.locator('header').getByRole('button', { name: 'Выйти' }).click();
};

const createProject = async (page: import('@playwright/test').Page, name: string) => {
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill(name);
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  await expect(page.locator('canvas').first()).toBeVisible();
  return page.url().split('/p/')[1] as string;
};

const goBackToList = async (page: import('@playwright/test').Page) => {
  await page.getByRole('link', { name: 'Назад к списку' }).click();
  await expect(page).toHaveURL('/');
};

/** Пишет запись `sync` напрямую в IndexedDB — готовит «доска уже синхронизировалась раньше». */
const writeSyncState = (
  page: import('@playwright/test').Page,
  state: { projectId: string; owner: string; remoteUpdatedAt: number; dirty: boolean },
) =>
  page.evaluate(async (value) => {
    const request = indexedDB.open('prostor');
    const db: IDBDatabase = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise((resolve) => {
      const tx = db.transaction('sync', 'readwrite');
      tx.objectStore('sync').put(value);
      tx.oncomplete = () => resolve(undefined);
    });
  }, state);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
});

test('доска появляется в списке сразу после входа, без захода на холст, и открывается с узлами', async ({
  page,
}) => {
  const remoteDocument = {
    projectId: 'remote-1',
    schemaVersion: 1,
    nodes: {
      'shape-server': {
        id: 'shape-server',
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
      },
    },
    order: ['shape-server'],
    viewport: { x: 0, y: 0, zoom: 1 },
    background: { color: '#fbfbfd', grid: 'dots' },
  };

  await page.addInitScript(stubCloudClient, [
    {
      id: 'remote-1',
      owner: 'user-1',
      name: 'Облачная доска',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      thumbnail: null,
      document: remoteDocument,
      is_public: false,
    },
  ]);
  await page.goto('/');

  await signIn(page);

  // Круг синхронизации обязан завестись самим входом — без захода на
  // какую-либо доску: кнопка «Войти» стоит на экране списка, и человек,
  // вошедший на новом устройстве, не должен видеть пустой список.
  await expect(page.getByText('Облачная доска')).toBeVisible();

  await page.getByText('Облачная доска').click();
  await expect(page).toHaveURL('/p/remote-1');
  await expect(page.locator('canvas').first()).toBeVisible();

  const nodeIds = await page.evaluate(() =>
    Object.keys(window.__board.getState().document?.nodes ?? {}),
  );
  expect(nodeIds).toContain('shape-server');
});

test('доска, исчезнувшая с сервера, пропадает из списка после входа', async ({ page }) => {
  // Сервер не знает ни одной доски владельца — ровно то, что нужно для сценария.
  await page.addInitScript(stubCloudClient, []);
  await page.goto('/');

  const projectId = await createProject(page, 'Была на сервере');
  // Имитация «раньше уже уезжала на сервер»: remoteUpdatedAt задан,
  // а по ответу сервера этой доски больше нет.
  await writeSyncState(page, {
    projectId,
    owner: 'user-1',
    remoteUpdatedAt: Date.now(),
    dirty: false,
  });
  await goBackToList(page);
  await expect(page.getByText('Была на сервере')).toBeVisible();

  await signIn(page);

  await expect(page.getByText('Была на сервере')).toHaveCount(0);
});

test('на вход уходит ровно один круг синхронизации, а выход и повторный вход — ещё один', async ({
  page,
}) => {
  await page.addInitScript(stubCloudClient, []);
  await page.goto('/');

  await signIn(page);
  await expect.poll(() => page.evaluate(() => window.__syncCalls)).toBe(1);

  // Заход на доску после входа не должен добавить второй круг: выгрузка
  // (`useCloudSync`, экран холста) и вход (`useCloudSyncOnLogin`, приложение)
  // — теперь два разных хука, и открытие холста не должно повторно дёрнуть syncNow.
  await createProject(page, 'Не удваивает круг');
  await goBackToList(page);
  expect(await page.evaluate(() => window.__syncCalls)).toBe(1);

  // Выход и повторный вход тем же человеком обязаны завести НОВЫЙ круг —
  // без сброса `syncedFor` на logout повторный вход не работал бы никогда.
  await signOut(page);
  await signIn(page);
  await expect.poll(() => page.evaluate(() => window.__syncCalls)).toBe(2);
});
