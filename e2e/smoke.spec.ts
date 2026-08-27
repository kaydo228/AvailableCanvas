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
 * Проверяем не «нет запросов вообще» — dev-сервер Vite подтягивает модули
 * по одному, и на нём такое требование бессмысленно, — а «ни одного запроса
 * за пределы своего origin». Именно это и означает «данные не уходят».
 */
test('после загрузки и правок доска не ходит в сеть (критерий 12)', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:5173').origin;
  const outside: string[] = [];

  // Известное и записанное исключение: index.html подключает Golos Text
  // и IBM Plex Mono с Google Fonts. Данных доски там нет, но факт запуска
  // и IP уезжают к Google, а без сети приложение остаётся без шрифтов —
  // для доски, которая обещает работать локально, это дефект. Записан
  // в REPORT.md, «Что не получилось»; чинится самостоятельным хостингом
  // шрифтов, а это решение по составу зависимостей и правится вдвоём.
  const knownFontHosts = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
  const fonts: string[] = [];

  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith(origin)) return;
    // data: и blob: — это картинки из IndexedDB, они никуда не едут.
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (knownFontHosts.some((host) => url.startsWith(host))) {
      fonts.push(url);
      return;
    }
    outside.push(`${request.method()} ${url}`);
  });

  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();

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

  // Главное: ничего, кроме шрифтов, наружу не уходит — ни доски, ни картинок,
  // ни телеметрии. Это и есть смысл критерия 12.
  expect(outside, 'запросы за пределы своего origin, кроме шрифтов').toEqual([]);

  // А это — не проверка, а сторож над исключением: если список внешних хостов
  // однажды станет пустым, тест покраснеет и напомнит убрать этот блок вместе
  // с записью о долге. Молча зарастать исключение не должно.
  expect(fonts.length, 'шрифты по-прежнему тянутся из сети — долг открыт').toBeGreaterThan(0);
});
