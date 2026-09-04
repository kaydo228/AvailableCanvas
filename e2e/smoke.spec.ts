import { expect, test } from '@playwright/test';

test('приложение поднимается и монтирует корень', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#root')).not.toBeEmpty();
});

/**
 * Критерий приёмки 12 из ТЗ: «вкладка Network после загрузки пуста — данные
 * никуда не уходят». Обещание, вынесенное в заголовок README («бэкенда нет,
 * данные живут в браузере»), и до 27 августа оно не проверялось ничем,
 * кроме того что мы сами не писали запросов.
 *
 * С задачи 4 плана cloud-sync это обещание сузилось: с аккаунтом доска
 * синхронизируется с Supabase, и вкладка Network пуста больше не бывает.
 * Здесь по-прежнему проверяется то, что осталось верным без входа —
 * это и есть новая формулировка критерия 12, а не старая, которую тест
 * просто перестал бы держать.
 *
 * Проверяем не «нет запросов вообще» — dev-сервер Vite подтягивает модули
 * по одному, и на нём такое требование бессмысленно, — а «ни одного запроса
 * за пределы своего origin». Именно это и означает «данные не уходят».
 *
 * До 28 августа здесь стояло исключение на два хоста Google Fonts и сторож,
 * который краснел бы, если исключение перестанет быть нужным. Он и покраснел:
 * шрифты переехали в public/fonts. Исключений больше нет — проверка стала
 * ровно такой, как записана в критерии приёмки 12.
 *
 * Облако включаем заглушкой (как в e2e/cloud-push.spec.ts), а не оставляем
 * выключенным реальным отсутствием переменных окружения: иначе тест прошёл бы
 * даже если бы кнопки «Войти» вовсе не было, и через полгода стало бы непонятно,
 * проверяет он «без входа» или просто «синхронизации нет в сборке». Кнопка
 * должна быть на экране и остаться ненажатой — вот что сузило критерий 12.
 */
const stubCloudClient = () => {
  Object.defineProperty(window, '__cloud', {
    configurable: true,
    set(value: { setCloud: (client: unknown) => void }) {
      value.setCloud({
        auth: {
          getSession: async () => ({ data: { session: null } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
      });
    },
    get() {
      return { setCloud: () => {} };
    },
  });
};

test('без входа доска не ходит в сеть (критерий 12)', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:5173').origin;
  const outside: string[] = [];

  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith(origin)) return;
    // data: и blob: — это картинки из IndexedDB, они никуда не едут.
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    outside.push(`${request.method()} ${url}`);
  });

  await page.addInitScript(stubCloudClient);
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();

  // Кнопка входа на экране есть — синхронизация в этой сборке включена,
  // просто ей не воспользовались. Без этой строки тест мог бы зеленеть
  // и тогда, когда кнопки «Войти» не существует вовсе, и критерий 12
  // проверял бы не «без входа», а «когда входа нет в принципе».
  await expect(page.locator('header').getByRole('button', { name: 'Войти' })).toBeVisible();

  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('Без сети');
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page).toHaveURL(/\/p\/[\w-]+$/);
  await expect(page.locator('canvas').first()).toBeVisible();

  // Немного живой работы: создать узел, подвигать вид, дать автосохранению
  // отработать. Если бы что-то уезжало наружу, уезжало бы именно здесь.
  await page.evaluate(() => {
    const store = window.__board.getState();
    store.addNode({
      type: 'shape',
      shape: 'rect',
      x: 40,
      y: 40,
      width: 160,
      height: 90,
      rotation: 0,
      opacity: 1,
      locked: false,
      fill: '#dbeafe',
      stroke: '#1d4ed8',
      strokeWidth: 2,
      label: { text: 'Секрет', size: 14, color: '#0f172a' },
    });
    store.panBy(-40, -20);
  });
  await page.waitForTimeout(1200);

  // Ничего наружу не уходит вообще: ни доски, ни картинок, ни шрифтов,
  // ни телеметрии. Это и есть критерий приёмки 12, без оговорок.
  expect(outside, 'запросы за пределы своего origin').toEqual([]);
});
