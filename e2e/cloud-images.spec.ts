import { expect, test } from '@playwright/test';

/**
 * Ленивое скачивание картинок и выгрузка перед строкой доски (задача 6 плана
 * cloud-sync, раунд правок 1). Сети нет — клиент подменяется заглушкой:
 * `storage.from('images').download` отдаёт маленький PNG и считает свои пути
 * в `window.__downloads`; `storage.from('images').upload` управляется опцией
 * `uploadError` — так проверяются оба исхода настоящей ошибки выгрузки картинки.
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

interface StubOptions {
  png: string;
  /** Что вернуть на `storage.upload`. Без опции — успех. */
  uploadError?: { statusCode: string; message: string };
}

const stubCloudClient = ({ png, uploadError }: StubOptions) => {
  const user = { id: 'user-1', email: 'test@example.com' };
  type FakeSession = { user: typeof user };
  let session: FakeSession | null = null;
  let onChange: ((event: string, session: FakeSession | null) => void) | null = null;

  window.__downloads = [];
  window.__upserts = [];

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
      upsert: async (row: Window['__upserts'][number]) => {
        window.__upserts.push(row);
        return { error: null };
      },
      select: (_columns: string) => ({
        eq: async () => ({ data: [], error: null }),
      }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    storage: {
      from: (_bucket: string) => ({
        upload: async () => (uploadError ? { error: uploadError } : { error: null }),
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

/** Читает строку `sync` напрямую из IndexedDB — как в e2e/cloud-push.spec.ts. */
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

/**
 * Картинка, реально положенная в локальный blobStore (через `putImage`, как
 * при вставке файла пользователем) — именно такую `uploadImages` пытается
 * выгрузить. Узел со «серверным» blobId из `addRemoteImage` для этого не
 * годится: `getBlob` на него не находит файл локально и выгрузка молча
 * пропускает его, не вызывая `storage.upload` вовсе.
 */
const addLocalImage = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => {
    const { putImage } = await import('/src/features/persistence/blobStore.ts');

    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    canvas.getContext('2d')?.fillRect(0, 0, 2, 2);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('toBlob вернул null'))),
        'image/png',
      );
    });
    const stored = await putImage(blob);

    window.__board.getState().addNode({
      id: 'img-local',
      type: 'image',
      x: 10,
      y: 10,
      width: 100,
      height: 80,
      rotation: 0,
      opacity: 1,
      locked: false,
      blobId: stored.blobId,
      naturalWidth: stored.naturalWidth,
      naturalHeight: stored.naturalHeight,
    });
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
});

test('картинка без локального файла скачивается один раз по owner/blobId, а второй раз в сеть не идёт', async ({
  page,
}) => {
  await page.addInitScript(stubCloudClient, { png: PNG_BASE64 });
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

test('настоящая ошибка выгрузки картинки не даёт уйти строке доски, sync помечен dirty', async ({
  page,
}) => {
  await page.addInitScript(stubCloudClient, {
    png: PNG_BASE64,
    uploadError: { statusCode: '400', message: 'quota exceeded' },
  });
  await page.goto('/');

  await signIn(page);
  const projectId = await createProject(page, 'Доска, которая не выгрузится');
  await addLocalImage(page);

  // expect.poll вместо фиксированного waitForTimeout: этот файл делит воркеры
  // с cloud-push.spec.ts (два тяжёлых теста на холсте разом), и под нагрузкой
  // 500 мс автосохранения + 3000 мс дебаунса не всегда укладываются день в день —
  // poll ждёт ровно столько, сколько нужно, а не гадает с запасом.
  await expect
    .poll(
      async () =>
        ((await readSyncState(page, projectId)) as { dirty?: boolean } | undefined)?.dirty,
      { timeout: 8000 },
    )
    .toBe(true);

  // Строка доски не должна была уйти вовсе: иначе на сервере лежал бы документ
  // со ссылкой на файл, которого там нет.
  expect(await page.evaluate(() => window.__upserts.length)).toBe(0);
});

test('ошибка 409 («уже есть») выгрузку не ломает — строка доски уходит, dirty не ставится', async ({
  page,
}) => {
  await page.addInitScript(stubCloudClient, {
    png: PNG_BASE64,
    uploadError: { statusCode: '409', message: 'Duplicate' },
  });
  await page.goto('/');

  await signIn(page);
  const projectId = await createProject(page, 'Доска с уже выгруженной картинкой');
  await addLocalImage(page);

  await expect.poll(() => page.evaluate(() => window.__upserts.length), { timeout: 8000 }).toBe(1);

  const state = (await readSyncState(page, projectId)) as { dirty: boolean } | undefined;
  expect(state?.dirty).toBe(false);
});
