import { expect, test } from '@playwright/test';

/**
 * Ленивое скачивание картинок (задача 6 плана cloud-sync). Сети нет — клиент
 * подменяется заглушкой: `storage.from('images').download` отдаёт маленький
 * PNG и считает свои пути в `window.__downloads`.
 *
 * Подмену ставим через `addInitScript`, а не `page.evaluate` после навигации —
 * как и в остальных `cloud-*.spec.ts`: `main.tsx` зовёт `initSession()`
 * синхронно при загрузке модулей, до первого доступного тесту момента после
 * `page.goto`.
 *
 * Узел-картинка со «серверным» blobId добавляется напрямую через `window.__board`
 * — так же, как `addShape` в `cloud-push.spec.ts` — это имитирует документ,
 * пришедший с сервера: blobId есть, а файла локально ещё нет.
 */

/** 1×1 PNG. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const stubCloudClient = (png: string) => {
  const user = { id: 'user-1', email: 'test@example.com' };
  type FakeSession = { user: typeof user };
  let session: FakeSession | null = null;
  let onChange: ((event: string, session: FakeSession | null) => void) | null = null;

  window.__downloads = [];

  const toBlob = (base64: string): Blob => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  };

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
      upsert: async () => ({ error: null }),
      select: (_columns: string) => ({
        eq: async () => ({ data: [], error: null }),
      }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    storage: {
      from: (_bucket: string) => ({
        upload: async () => ({ error: null }),
        download: async (path: string) => {
          window.__downloads.push(path);
          return { data: toBlob(png), error: null };
        },
      }),
    },
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

/** Узел-картинка со «серверным» blobId — файла под ним локально ещё нет. */
const addRemoteImage = (page: import('@playwright/test').Page, blobId: string) =>
  page.evaluate((id) => {
    window.__board.getState().addNode({
      id: 'img-remote',
      type: 'image',
      x: 10,
      y: 10,
      width: 100,
      height: 80,
      rotation: 0,
      opacity: 1,
      locked: false,
      blobId: id,
      naturalWidth: 200,
      naturalHeight: 160,
    });
  }, blobId);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
});

test('картинка без локального файла скачивается один раз по owner/blobId, а второй раз в сеть не идёт', async ({
  page,
}) => {
  await page.addInitScript(stubCloudClient, PNG_BASE64);
  await page.goto('/');

  await signIn(page);
  await createProject(page, 'Доска с чужой картинкой');
  await addRemoteImage(page, 'server-blob-1');

  // Скачивание ленивое: ждём, пока ImageView сам попросит файл при рендере.
  await expect.poll(() => page.evaluate(() => window.__downloads.length)).toBe(1);
  expect(await page.evaluate(() => window.__downloads)).toEqual(['user-1/server-blob-1']);

  // Уход с холста освобождает кэш элементов картинок (releaseImageCache) —
  // повторное открытие честно перечитывает blobStore, а не отдаёт кэш из памяти.
  await page.getByRole('link', { name: 'Назад к списку' }).click();
  await expect(page).toHaveURL('/');
  await page.getByText('Доска с чужой картинкой').click();
  await expect(page.locator('canvas').first()).toBeVisible();

  // Файл уже лежит в IndexedDB (putBlobDirect после первого скачивания) —
  // второе открытие обслуживается локально, download больше не зовётся.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__downloads.length)).toBe(1);
});
