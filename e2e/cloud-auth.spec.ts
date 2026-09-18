import { expect, test } from '@playwright/test';

/**
 * Вход, регистрация и выход (задача 2 плана cloud-sync). Сети в e2e нет —
 * клиент подменяется заглушкой.
 *
 * Подмену ставим через `addInitScript`, а не через обычный `page.evaluate`
 * после навигации: `main.tsx` зовёт `initSession()` синхронно при загрузке
 * модулей, ещё до первого доступного тесту момента после `page.goto`. Если
 * подставить клиент позже, `initSession()` уже успеет решить, что облака
 * нет, и подписки на смену сессии не будет вовсе. `addInitScript` гарантированно
 * выполняется до любого скрипта страницы, поэтому здесь ставится перехватчик
 * присваивания `window.__cloud` (его заводит `cloud/model/client.ts` в DEV) —
 * как только приложение выставляет ручку `setCloud`, тут же подставляется
 * заглушка.
 */

const stubCloudClient = () => {
  const user = { id: 'user-1', email: 'test@example.com' };
  type FakeSession = { user: typeof user };
  let session: FakeSession | null = null;
  let onChange: ((event: string, session: FakeSession | null) => void) | null = null;

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

test('вход показывает почту и «Выйти», выход возвращает «Войти»', async ({ page }) => {
  await page.addInitScript(stubCloudClient);
  await page.goto('/');

  const header = page.locator('header');
  await expect(header.getByRole('button', { name: 'Войти' })).toBeVisible();

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
  await expect(header.getByText('test@example.com')).toBeVisible();
  await expect(header.getByRole('button', { name: 'Выйти' })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Войти' })).toHaveCount(0);

  await header.getByRole('button', { name: 'Выйти' }).click();

  await expect(header.getByRole('button', { name: 'Войти' })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Выйти' })).toHaveCount(0);
});

test('регистрация сообщает, что дальше нужно подтвердить почту', async ({ page }) => {
  await page.addInitScript(stubCloudClient);
  await page.goto('/');

  await page.getByRole('button', { name: 'Войти' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Ещё нет аккаунта? Регистрация' }).click();
  await dialog.getByLabel('Почта').fill('new@example.com');
  await dialog.getByLabel('Пароль').fill('secret123');
  await dialog.getByRole('button', { name: 'Зарегистрироваться' }).click();

  await expect(page.locator('[data-sonner-toast]')).toContainText(/Проверьте почту/);
});
