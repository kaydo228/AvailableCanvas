import { expect, test } from '@playwright/test';

/**
 * Публичная ссылка на просмотр доски (задача 7 плана cloud-sync).
 *
 * Сети нет — клиент подменяется заглушкой, которая знает ровно один запрос
 * публичного экрана: `select('*').eq('id', ...).single()`. Роль правила
 * доступа в базе играет сам список строк: доски нет в списке — заглушка
 * отвечает ошибкой, ровно как ответил бы сервер на закрытую доску. Второй
 * проверки `is_public` в коде нет намеренно (см. шапку `cloud/model/share.ts`),
 * поэтому и подделывать её в тесте нечем.
 *
 * Вход нигде не выполняется: смысл сценария в том, что чужая доска
 * открывается без него.
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
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
    },
    from: (_table: string) => ({
      select: (_columns: string) => ({
        eq: (column: string, value: string) => {
          // Списка своих досок неавторизованный не запрашивает, но если круг
          // синхронизации всё же завёлся — пусть это будет пустой ответ,
          // а не падение внутри заглушки.
          if (column === 'owner') return Promise.resolve({ data: [], error: null });
          return {
            single: async () => {
              const row = rows.find((r) => r.id === value);
              return row
                ? { data: row, error: null }
                : { data: null, error: { message: 'строка недоступна' } };
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

const publicRow = (): Row => ({
  id: 'shared-1',
  owner: 'user-1',
  name: 'Общая доска',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  thumbnail: null,
  is_public: true,
  document: {
    projectId: 'shared-1',
    schemaVersion: 1,
    nodes: {
      'shape-shared': {
        id: 'shape-shared',
        type: 'shape',
        shape: 'rect',
        x: 260,
        y: 180,
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
    order: ['shape-shared'],
    viewport: { x: 0, y: 0, zoom: 1 },
    background: { color: '#fbfbfd', grid: 'dots' },
  },
});

const documentContent = async (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const document = window.__board.getState().document;
    if (!document) return null;
    return structuredClone({
      nodes: document.nodes,
      order: document.order,
      background: document.background,
    });
  });

const tryToEditBoard = async (page: import('@playwright/test').Page) => {
  const canvas = page.getByRole('application', { name: 'Холст доски' });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Холст не имеет размеров');

  const point = { x: box.x + 300, y: box.y + 200 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 80, point.y + 50, { steps: 5 });
  await page.mouse.up();
  await page.mouse.dblclick(point.x, point.y);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');

  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.setData(
      'text/plain',
      JSON.stringify({
        format: 'prostor-nodes',
        version: 1,
        nodes: [
          {
            id: 'pasted-by-viewer',
            type: 'shape',
            shape: 'rect',
            x: 80,
            y: 80,
            width: 80,
            height: 40,
            rotation: 0,
            opacity: 1,
            locked: false,
            fill: '#ff0000',
            stroke: '#111111',
            strokeWidth: 1,
          },
        ],
      }),
    );
    window.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: transfer }));
  });

  await canvas.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>',
        ],
        'viewer.svg',
        { type: 'image/svg+xml' },
      ),
    );
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => indexedDB.deleteDatabase('prostor'));
  await page.reload();
});

test('доска по ссылке открывается без входа: узлы есть, панели инструментов нет', async ({
  page,
}) => {
  await page.addInitScript(stubCloudClient, [publicRow()]);
  await page.goto('/s/shared-1');

  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByText('Только просмотр')).toBeVisible();

  const nodeIds = await page.evaluate(() =>
    Object.keys(window.__board.getState().document?.nodes ?? {}),
  );
  expect(nodeIds).toContain('shape-shared');

  // Панели инструментов нет — «Выбор (V)» есть только в ней.
  await expect(page.getByRole('button', { name: 'Выбор (V)' })).toHaveCount(0);
  // Выгрузка есть: она читает доску и ничего в ней не меняет.
  await expect(page.getByRole('button', { name: 'Экспорт' })).toBeVisible();
});

test('публичную доску нельзя изменить мышью, клавиатурой или сбросом файла', async ({ page }) => {
  await page.addInitScript(stubCloudClient, [publicRow()]);
  await page.goto('/s/shared-1');
  await expect(page.locator('canvas').first()).toBeVisible();

  const before = await documentContent(page);
  await tryToEditBoard(page);

  expect(await documentContent(page)).toEqual(before);
  await expect(page.locator('textarea')).toHaveCount(0);
});

test('участник с ролью viewer видит доску, но не может её изменить', async ({ page }) => {
  await page.getByRole('button', { name: 'Создать проект' }).last().click();
  await page.getByLabel('Имя проекта').fill('Доска зрителя');
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page.locator('canvas').first()).toBeVisible();

  const projectId = page.url().split('/').at(-1);
  if (!projectId) throw new Error('Не удалось определить id проекта');

  await page.evaluate(async (id) => {
    const store = window.__board.getState();
    store.addNode({
      id: 'shape-viewer',
      type: 'shape',
      shape: 'rect',
      x: 260,
      y: 180,
      width: 80,
      height: 40,
      rotation: 0,
      opacity: 1,
      locked: false,
      fill: '#ff0000',
      stroke: '#111111',
      strokeWidth: 1,
    });

    const request = indexedDB.open('prostor');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('sync', 'readwrite');
    tx.objectStore('sync').put({
      projectId: id,
      owner: 'another-user',
      access: 'viewer',
      remoteUpdatedAt: Date.now(),
      remoteRevision: 1,
      dirty: false,
      isPublic: false,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }, projectId);

  await expect(page.getByText('Все изменения сохранены')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Только просмотр')).toBeVisible();

  const before = await documentContent(page);
  await tryToEditBoard(page);

  expect(await documentContent(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Выбор (V)' })).toHaveCount(0);
  await expect(page.locator('textarea')).toHaveCount(0);
});

test('закрытая доска даёт понятное состояние, а не белый лист', async ({ page }) => {
  // Сервер не отдаёт строку — то же, что он ответит на доску без `is_public`.
  await page.addInitScript(stubCloudClient, []);
  await page.goto('/s/shared-1');

  await expect(page.getByText('Доска не найдена или доступ закрыт')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);

  await page.getByRole('link', { name: 'На главную' }).click();
  await expect(page).toHaveURL('/');
});

test('чужая доска не оседает в списке проектов у того, кто перешёл по ссылке', async ({ page }) => {
  await page.addInitScript(stubCloudClient, [publicRow()]);
  await page.goto('/s/shared-1');
  await expect(page.locator('canvas').first()).toBeVisible();

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Чистый лист без края' })).toBeVisible();
  await expect(page.getByText('Общая доска')).toHaveCount(0);

  // И в хранилище тоже ничего: список на экране мог бы просто не успеть
  // обновиться, а здесь проверяется сам факт записи.
  const stored = await page.evaluate(async () => {
    const request = indexedDB.open('prostor');
    const db: IDBDatabase = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    if (!db.objectStoreNames.contains('projects')) return 0;
    return new Promise<number>((resolve) => {
      const count = db.transaction('projects', 'readonly').objectStore('projects').count();
      count.onsuccess = () => resolve(count.result);
    });
  });
  expect(stored).toBe(0);
});

test('битая строка с сервера даёт понятное состояние, а не бесконечный спиннер', async ({
  page,
}) => {
  // Сервер отдаёт строку, но в поле `document` лежит не документ
  // (например, null). `repairDocument` должен его обработать, но если
  // это всё же будет ошибка — экран обязан показать понятное состояние.
  const brokenRow = {
    ...publicRow(),
    document: null, // или 'не документ', или что-то ещё неправильное
  };
  await page.addInitScript(stubCloudClient, [brokenRow]);
  await page.goto('/s/shared-1');

  // Не должны видеть спиннер бесконечно — должно быть понятное состояние.
  // Даём 3 секунды для перехода в состояние ошибки.
  await expect(page.getByText('Доска не найдена или доступ закрыт')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('canvas')).toHaveCount(0);
});
