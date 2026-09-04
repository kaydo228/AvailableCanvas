import { expect, test } from '@playwright/test';

/**
 * Перенос локальных досок в аккаунт при первом входе (задача 9 плана
 * cloud-sync). Сети нет — клиент подменяется заглушкой, как в
 * `cloud-pull.spec.ts` и `cloud-push.spec.ts`; этот файл делит с
 * `cloud-pull.spec.ts` один и тот же хук входа (`useCloudSyncOnLogin`),
 * поэтому оба гоняются вместе перед коммитом.
 *
 * Заглушка сервера здесь всегда пуста (ни одной чужой доски): весь сценарий —
 * про то, что происходит с доской, нарисованной ДО входа, на этом устройстве.
 * `upsert` (в `window.__upserts`) считается отдельно от круга синхронизации,
 * чтобы отличить «доска ушла на сервер» от «круг просто прошёл».
 */

const stubCloudClient = () => {
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
      // remoteList: select('id, updated_at').eq('owner', owner) — сервер пуст.
      select: (_columns: string) => ({
        eq: (_column: string, _value: string) => Promise.resolve({ data: [], error: null }),
      }),
      // pushProject: cloud.from('projects').upsert(row) — фиксируем факт выгрузки.
      upsert: async (row: Window['__upserts'][number]) => {
        window.__upserts.push(row);
        return { error: null };
      },
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
  const authDialog = page.getByRole('dialog').filter({ hasText: 'Вход' });
  await authDialog.getByLabel('Почта').fill('test@example.com');
  await authDialog.getByLabel('Пароль').fill('secret123');
  await authDialog.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(authDialog).toBeHidden();
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

const adoptDialog = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog').filter({ hasText: 'Перенести доски в аккаунт?' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
});

test('«Перенести» закрепляет доску за аккаунтом и выгружает её', async ({ page }) => {
  await page.addInitScript(stubCloudClient);
  await page.goto('/');

  const projectId = await createProject(page, 'Доска до входа');
  await goBackToList(page);

  await signIn(page);

  const dialog = adoptDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('1 доска');
  await expect(dialog).toContainText('test@example.com');

  await dialog.getByRole('button', { name: 'Перенести' }).click();
  await expect(dialog).toBeHidden();

  // Перенос закрепил доску, круг синхронизации следом обязан выгрузить её:
  // без этого дожидаться пришлось бы следующего входа.
  await expect
    .poll(() => page.evaluate(() => window.__upserts.map((row) => row.id)))
    .toContain(projectId);
});

test('«Оставить локальными» не выгружает доску и не спрашивает снова', async ({ page }) => {
  await page.addInitScript(stubCloudClient);
  await page.goto('/');

  await createProject(page, 'Останется локальной');
  await goBackToList(page);

  await signIn(page);

  const dialog = adoptDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Оставить локальными' }).click();
  await expect(dialog).toBeHidden();

  // Круг синхронизации после отказа всё равно проходит (задача 9 не отменяет
  // его), но для доски без владельца решение — «ничего не делать»: выгрузки
  // быть не должно.
  await expect(page.getByText('Останется локальной')).toBeVisible();
  expect(await page.evaluate(() => window.__upserts.length)).toBe(0);

  await signOut(page);
  await signIn(page);

  // На вопрос уже ответили — второй раз при повторном входе он не появляется.
  await expect(dialog).toBeHidden();
});

test('вопрос не появляется, когда переносить нечего', async ({ page }) => {
  await page.addInitScript(stubCloudClient);
  await page.goto('/');

  await signIn(page);

  await expect(adoptDialog(page)).toBeHidden();
});
