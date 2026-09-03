# Синхронизация досок между устройствами — план реализации

> **Для агентов:** ОБЯЗАТЕЛЬНЫЙ ПОД-СКИЛЛ: выполнять этот план через
> superpowers:subagent-driven-development (рекомендуется) или
> superpowers:executing-plans, задача за задачей. Шаги отмечены чекбоксами
> `- [ ]` — по ним и отслеживается ход.

**Цель:** доски и картинки живут в аккаунте и открываются на любом устройстве;
доской можно поделиться ссылкой на чтение.

**Архитектура:** локальное хранилище остаётся главным — всё пишется в IndexedDB
и работает без сети, а синхронизация догоняет фоном. Сервер — Supabase:
готовые вход, Postgres и хранилище файлов, своего серверного кода нет. Одна
строка на доску, документ целиком в `jsonb`; при расхождении побеждает версия
с более поздним `updated_at`.

**Стек:** `@supabase/supabase-js@2`, поверх нынешних React 19, Zustand, `idb`,
zod, Vitest, Playwright.

**Спека:** [docs/superpowers/specs/2026-09-02-cloud-sync-design.md](../specs/2026-09-02-cloud-sync-design.md)
— план спорит со спекой, читать оба.

## Общие ограничения

- **Единственная новая зависимость — `@supabase/supabase-js@^2`.** Список
  библиотек в проекте закрытый (CLAUDE.md): пакет обязан появиться в
  `docs/TOOLING.md`, раздел 1, в той же задаче, где ставится. Больше ничего
  не добавлять — ни клиента запросов, ни библиотеки форм.
- **`src/features/canvas` не трогать вовсе.** Это чужая зона (зона A).
- **`src/shared/types/document.ts` и `src/shared/store/` не трогать.** Если
  правка туда всё же понадобилась — остановиться и спросить: это общий шов,
  он меняется парой и коммитом с префиксом `contract:`.
- **Без переменных окружения приложение работает как раньше**, полностью
  локально, и кнопки входа нет вовсе. Это не «режим по умолчанию», а
  проверяемое свойство: тест на критерий 12 ТЗ его закрепляет.
- **Ни одна ошибка сети не портит локальные данные.** Выгрузка и скачивание —
  операции поверх готового локального состояния, а не вместо него.
- **Юнит-тесты только на чистой логике.** `fake-indexeddb` в проекте нет и
  ставить его нельзя; всё, что трогает IndexedDB или UI, проверяется
  Playwright с подменённым клиентом.
- **Сети в e2e нет.** Клиент подменяется через `window.__cloud.setCloud(...)`
  (только в DEV). Тест, который ходит в настоящий Supabase, — сломанный тест.
- Каждая задача заканчивается зелёными `npm run typecheck`, `npm run lint`,
  `npm test`. Коммит — в конце задачи, префикс `feat:`, `fix:` или `docs:`.

## Карта файлов

Создаётся:

| Файл | За что отвечает |
|---|---|
| `src/features/cloud/model/client.ts` | создание клиента из переменных окружения, единственная точка доступа к нему |
| `src/features/cloud/model/session.ts` | текущий пользователь, вход, регистрация, выход |
| `src/features/cloud/model/merge.ts` | чистое правило: что делать с каждой доской |
| `src/features/cloud/model/push.ts` | выгрузка доски на сервер |
| `src/features/cloud/model/pull.ts` | список с сервера, скачивание документов, применение решений |
| `src/features/cloud/model/images.ts` | выгрузка и скачивание картинок |
| `src/features/cloud/model/share.ts` | публичная ссылка |
| `src/features/cloud/model/useCloudSync.ts` | когда синхронизировать: вход, правка, уход с доски |
| `src/features/cloud/ui/AuthDialog.tsx` | форма входа и регистрации |
| `src/features/cloud/ui/AccountMenu.tsx` | кто вошёл, выход |
| `src/features/cloud/ui/ShareButton.tsx` | «Поделиться» |
| `src/features/cloud/index.ts` | публичный список слайса |
| `src/features/persistence/syncStore.ts` | метаданные синхронизации в IndexedDB |
| `src/app/PublicBoardScreen.tsx` | доска по публичной ссылке, только чтение |
| `docs/cloud-setup.md` | что человек делает руками: SQL, bucket, переменные, пинг |

Меняется:

| Файл | Что именно |
|---|---|
| `src/features/persistence/db.ts` | версия базы 2 → 3, стор `sync` |
| `src/features/persistence/blobStore.ts` | `getBlob` падает в Storage, если файла нет локально |
| `src/features/persistence/projectsRepo.ts` | удаление проекта сносит и удалённую строку |
| `src/features/persistence/autosave.ts` | состояние «сохранено локально, не выгружено» |
| `src/features/persistence/SaveIndicator.tsx` | показ этого состояния |
| `src/app/ProjectsHeader.tsx` | кнопка входа и меню аккаунта |
| `src/app/CanvasScreen.tsx` | «Поделиться», подключение синхронизации |
| `src/app/router.tsx` | маршрут `/s/:projectId` |
| `e2e/global.d.ts` | тип `window.__cloud` |
| `e2e/smoke.spec.ts` | критерий 12 сужается до «без входа» |
| `README.md`, `docs/DECISIONS.md`, `docs/TOOLING.md` | честные формулировки |

---

### Задача 1: Клиент облака и ручная настройка

**Файлы:**
- Создать: `src/features/cloud/model/client.ts`
- Создать: `src/features/cloud/model/client.test.ts`
- Создать: `src/features/cloud/index.ts`
- Создать: `.env.example`
- Создать: `docs/cloud-setup.md`
- Изменить: `package.json` (зависимость), `docs/TOOLING.md` (раздел 1.3)

**Интерфейсы:**
- Отдаёт наружу: `createCloudClient(env: CloudEnv): SupabaseClient | null`,
  `getCloud(): SupabaseClient | null`, `setCloud(client: SupabaseClient | null): void`,
  `cloudEnabled(): boolean`.

- [ ] **Шаг 1: Поставить зависимость**

```bash
npm install @supabase/supabase-js@^2
```

- [ ] **Шаг 2: Написать падающий тест**

Создать `src/features/cloud/model/client.test.ts`:

```ts
/**
 * Создание клиента из переменных окружения.
 *
 * Проверяется главное свойство: без переменных облака нет, и приложение
 * обязано работать локально, а не падать на старте.
 */

import { describe, expect, it } from 'vitest';

import { createCloudClient } from './client';

describe('createCloudClient', () => {
  it('без переменных окружения клиента нет', () => {
    expect(createCloudClient({})).toBeNull();
  });

  it('половины настроек мало', () => {
    expect(createCloudClient({ url: 'https://x.supabase.co' })).toBeNull();
    expect(createCloudClient({ anonKey: 'ключ' })).toBeNull();
  });

  it('пустые строки — это тоже «не настроено»', () => {
    expect(createCloudClient({ url: '', anonKey: '' })).toBeNull();
  });

  it('с обеими настройками клиент создаётся', () => {
    const client = createCloudClient({ url: 'https://x.supabase.co', anonKey: 'ключ' });
    expect(client).not.toBeNull();
  });
});
```

- [ ] **Шаг 3: Запустить тест и убедиться, что он падает**

Запуск: `npx vitest run src/features/cloud/model/client.test.ts`
Ожидание: FAIL, `Failed to resolve import "./client"`.

- [ ] **Шаг 4: Написать клиент**

Создать `src/features/cloud/model/client.ts`:

```ts
/**
 * Единственная точка доступа к Supabase.
 *
 * Клиент создаётся лениво и ровно один раз: `createClient` держит сессию
 * и подписки, второй экземпляр даёт два независимых состояния входа.
 *
 * Переменных нет — облака нет. Это не ошибка и не отключённая функция,
 * а обычный режим работы: приложение остаётся полностью локальным, каким
 * оно и было до синхронизации.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface CloudEnv {
  url?: string | undefined;
  anonKey?: string | undefined;
}

/** Чистая фабрика: настройки внутрь, клиент или `null` наружу. Тестируется. */
export const createCloudClient = ({ url, anonKey }: CloudEnv): SupabaseClient | null => {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
};

/** `undefined` — ещё не создавали, `null` — создавали, настроек не было. */
let cached: SupabaseClient | null | undefined;

export const getCloud = (): SupabaseClient | null => {
  cached ??= createCloudClient({
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  });
  return cached;
};

/**
 * Подмена клиента. Нужна e2e: сети в тестах нет, а проверять надо весь путь
 * от кнопки до записи в IndexedDB.
 */
export const setCloud = (client: SupabaseClient | null): void => {
  cached = client;
};

export const cloudEnabled = (): boolean => getCloud() !== null;

// Ручка для e2e. Только в DEV: в сборке её нет, подменить клиент снаружи
// нельзя — иначе это дыра, а не тестовая ручка.
if (import.meta.env.DEV) {
  (window as unknown as { __cloud: { setCloud: typeof setCloud } }).__cloud = { setCloud };
}
```

- [ ] **Шаг 5: Запустить тест и убедиться, что он проходит**

Запуск: `npx vitest run src/features/cloud/model/client.test.ts`
Ожидание: PASS, 4 теста.

- [ ] **Шаг 6: Завести публичный список слайса**

Создать `src/features/cloud/index.ts`:

```ts
/** Публичный список слайса «облако». Без `export *` — правило проекта. */

export { cloudEnabled, getCloud, setCloud } from './model/client';
```

- [ ] **Шаг 7: Записать переменные окружения**

Создать `.env.example`:

```
# Скопируйте в .env.local и подставьте значения своего проекта Supabase.
# Без этих двух переменных приложение работает полностью локально.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Шаг 8: Написать инструкцию по ручной настройке**

Создать `docs/cloud-setup.md` — SQL таблицы и правил доступа из спеки
(раздел «Данные на сервере»), создание bucket `images` с публичным чтением,
заполнение `.env.local`, те же переменные в настройках хостинга и ежедневный
пинг, чтобы бесплатный проект не засыпал:

```yaml
# .github/workflows/keep-awake.yml
name: keep supabase awake
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -sS -o /dev/null -w '%{http_code}\n' "$URL/rest/v1/projects?select=id&limit=1" -H "apikey: $KEY"
        env:
          URL: ${{ secrets.SUPABASE_URL }}
          KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

- [ ] **Шаг 9: Внести пакет в список библиотек**

В `docs/TOOLING.md`, раздел 1.3 «Состояние и данные», добавить строку:

```
| `@supabase/supabase-js` | вход, база и хранилище картинок для синхронизации между устройствами |
```

- [ ] **Шаг 10: Проверить и закоммитить**

```bash
npm run typecheck && npm run lint && npm test
git add package.json package-lock.json .env.example docs/TOOLING.md docs/cloud-setup.md src/features/cloud
git commit -m "feat(cloud): клиент Supabase и ручная настройка проекта"
```

---

### Задача 2: Вход, регистрация, выход

**Файлы:**
- Создать: `src/features/cloud/model/session.ts`, `src/features/cloud/model/session.test.ts`
- Создать: `src/features/cloud/ui/AuthDialog.tsx`, `src/features/cloud/ui/AccountMenu.tsx`
- Создать: `e2e/cloud-auth.spec.ts`
- Изменить: `src/app/ProjectsHeader.tsx`, `src/features/cloud/index.ts`, `e2e/global.d.ts`

**Интерфейсы:**
- Берёт из задачи 1: `getCloud`, `cloudEnabled`, `setCloud`.
- Отдаёт наружу: `useSession()` — стор `{ userId: string | null; email: string | null; ready: boolean }`;
  `initSession(): void`; `signIn(email, password): Promise<string | null>`;
  `signUp(email, password): Promise<string | null>`; `signOut(): Promise<void>`;
  `authErrorText(message: string): string`. Функции входа возвращают текст
  ошибки для человека или `null` при успехе.

- [ ] **Шаг 1: Написать падающий тест на перевод ошибок**

Создать `src/features/cloud/model/session.test.ts`:

```ts
/**
 * Ответ сервера — не сообщение пользователю. Здесь закреплён перевод:
 * человек должен понять, что делать, а не читать английскую строку из API.
 */

import { describe, expect, it } from 'vitest';

import { authErrorText } from './session';

describe('authErrorText', () => {
  it('неверная пара логин-пароль', () => {
    expect(authErrorText('Invalid login credentials')).toBe('Неверная почта или пароль');
  });

  it('такой пользователь уже есть', () => {
    expect(authErrorText('User already registered')).toBe(
      'Эта почта уже зарегистрирована — войдите',
    );
  });

  it('короткий пароль', () => {
    expect(authErrorText('Password should be at least 6 characters')).toBe(
      'Пароль короче шести символов',
    );
  });

  it('незнакомую ошибку показываем как есть, а не глотаем', () => {
    expect(authErrorText('Service unavailable')).toBe('Service unavailable');
  });

  it('пустой ответ тоже должен что-то сказать', () => {
    expect(authErrorText('')).toBe('Не удалось связаться с сервером');
  });
});
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Запуск: `npx vitest run src/features/cloud/model/session.test.ts`
Ожидание: FAIL, `Failed to resolve import "./session"`.

- [ ] **Шаг 3: Написать сессию**

Создать `src/features/cloud/model/session.ts`:

```ts
/**
 * Кто вошёл. Тонкая обёртка над Supabase Auth: наружу отдаётся id и почта,
 * сам объект сессии за пределы слайса не выходит.
 *
 * `ready` отделяет «ещё не спросили» от «не вошёл»: без него интерфейс на
 * первом кадре показывает кнопку «Войти» тому, кто уже вошёл, и она моргает.
 */

import { create } from 'zustand';

import { getCloud } from './client';

interface SessionState {
  userId: string | null;
  email: string | null;
  ready: boolean;
}

export const useSession = create<SessionState>()(() => ({
  userId: null,
  email: null,
  ready: false,
}));

/** Подписка на вход и выход. Зовётся один раз при старте приложения. */
export const initSession = (): void => {
  const cloud = getCloud();
  if (!cloud) {
    useSession.setState({ ready: true });
    return;
  }

  void cloud.auth.getSession().then(({ data }) => {
    useSession.setState({
      userId: data.session?.user.id ?? null,
      email: data.session?.user.email ?? null,
      ready: true,
    });
  });

  cloud.auth.onAuthStateChange((_event, session) => {
    useSession.setState({
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      ready: true,
    });
  });
};

const MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Неверная почта или пароль',
  'User already registered': 'Эта почта уже зарегистрирована — войдите',
  'Password should be at least 6 characters': 'Пароль короче шести символов',
  'Email not confirmed': 'Почта не подтверждена — проверьте письмо',
};

/** Ответ сервера → фраза для человека. Незнакомое пропускаем как есть. */
export const authErrorText = (message: string): string =>
  MESSAGES[message] ?? (message || 'Не удалось связаться с сервером');

export const signIn = async (email: string, password: string): Promise<string | null> => {
  const cloud = getCloud();
  if (!cloud) return 'Синхронизация не настроена';
  const { error } = await cloud.auth.signInWithPassword({ email, password });
  return error ? authErrorText(error.message) : null;
};

export const signUp = async (email: string, password: string): Promise<string | null> => {
  const cloud = getCloud();
  if (!cloud) return 'Синхронизация не настроена';
  const { error } = await cloud.auth.signUp({ email, password });
  return error ? authErrorText(error.message) : null;
};

export const signOut = async (): Promise<void> => {
  await getCloud()?.auth.signOut();
};
```

- [ ] **Шаг 4: Запустить тест и убедиться, что он проходит**

Запуск: `npx vitest run src/features/cloud/model/session.test.ts`
Ожидание: PASS, 5 тестов.

- [ ] **Шаг 5: Форма входа**

Создать `src/features/cloud/ui/AuthDialog.tsx` — диалог `radix-ui` с двумя
полями (`type="email"`, `type="password"`), переключателем «Вход / Регистрация»
и строкой ошибки. Классы — как в `features/projects/dialogs/ProjectDialogs.tsx`,
новых стилей не изобретать. Поля обязаны иметь `<label>`: по ним ищет e2e.
Кнопка отправки заблокирована, пока идёт запрос.

- [ ] **Шаг 6: Меню аккаунта в шапке**

Создать `src/features/cloud/ui/AccountMenu.tsx`: если `cloudEnabled()` ложно —
не рисовать ничего; вошёл — почта и «Выйти»; не вошёл — кнопка «Войти»,
открывающая `AuthDialog`. Подключить в `src/app/ProjectsHeader.tsx` рядом
с `ThemeToggle`. Позвать `initSession()` один раз в `src/main.tsx`.

- [ ] **Шаг 7: Тип тестовой ручки**

В `e2e/global.d.ts` добавить в `interface Window`:

```ts
    /** Подмена клиента Supabase из тестов. Ставится в DEV, см. cloud/model/client.ts. */
    __cloud: { setCloud: (client: unknown) => void };
```

- [ ] **Шаг 8: E2e на вход и выход**

Создать `e2e/cloud-auth.spec.ts`: подменить клиент заглушкой, у которой
`auth.getSession()` отдаёт пустую сессию, `auth.signInWithPassword` — сессию
с почтой `test@example.com`, `auth.onAuthStateChange` запоминает колбэк
и зовёт его после входа. Проверить: до входа в шапке кнопка «Войти»;
после отправки формы — почта и кнопка «Выйти»; после «Выйти» — снова «Войти».

- [ ] **Шаг 9: Прогнать и закоммитить**

```bash
npm run typecheck && npm run lint && npm test
npx playwright test e2e/cloud-auth.spec.ts --project=e2e
git add src/features/cloud src/app/ProjectsHeader.tsx src/main.tsx e2e/cloud-auth.spec.ts e2e/global.d.ts
git commit -m "feat(cloud): вход, регистрация и выход"
```

---

### Задача 3: Метаданные синхронизации и правило слияния

**Файлы:**
- Изменить: `src/features/persistence/db.ts` (версия 2 → 3, стор `sync`)
- Создать: `src/features/persistence/syncStore.ts`
- Создать: `src/features/cloud/model/merge.ts`, `src/features/cloud/model/merge.test.ts`

**Интерфейсы:**
- Отдаёт наружу: тип `SyncState`; `readSyncState(projectId)`, `writeSyncState(state)`,
  `allSyncStates()`, `forgetSyncState(projectId)`; чистая функция
  `decide(local: LocalBoard[], remote: RemoteBoard[], owner: string): Decision[]`.
- Задачи 4 и 5 применяют решения; сама эта задача ничего не синхронизирует.

- [ ] **Шаг 1: Написать падающий тест на правило**

Создать `src/features/cloud/model/merge.test.ts`:

```ts
/**
 * Правило слияния. Чистая таблица «что локально × что на сервере → что делать».
 *
 * Тут закреплён самый опасный случай: доска, которой нет на сервере, удаляется
 * локально ТОЛЬКО если она там раньше была. Иначе первый же вход стёр бы всё,
 * что человек успел нарисовать до регистрации.
 */

import { describe, expect, it } from 'vitest';

import { decide } from './merge';

const ME = 'user-1';
const local = (projectId: string, updatedAt: number, state?: object) => ({
  projectId,
  updatedAt,
  ...(state ? { state: { projectId, dirty: false, ...state } } : {}),
});

describe('decide', () => {
  it('локальная новее — выгружаем', () => {
    const out = decide([local('a', 200, { owner: ME, remoteUpdatedAt: 100 })], [{ id: 'a', updatedAt: 100 }], ME);
    expect(out).toEqual([{ kind: 'push', projectId: 'a' }]);
  });

  it('на сервере новее — скачиваем', () => {
    const out = decide([local('a', 100, { owner: ME, remoteUpdatedAt: 100 })], [{ id: 'a', updatedAt: 200 }], ME);
    expect(out).toEqual([{ kind: 'pull', projectId: 'a' }]);
  });

  it('времена равны и правок нет — ничего', () => {
    const out = decide([local('a', 100, { owner: ME, remoteUpdatedAt: 100 })], [{ id: 'a', updatedAt: 100 }], ME);
    expect(out).toEqual([{ kind: 'nothing', projectId: 'a' }]);
  });

  it('времена равны, но есть невыгруженные правки — выгружаем', () => {
    const out = decide(
      [local('a', 100, { owner: ME, remoteUpdatedAt: 100, dirty: true })],
      [{ id: 'a', updatedAt: 100 }],
      ME,
    );
    expect(out).toEqual([{ kind: 'push', projectId: 'a' }]);
  });

  it('была на сервере, там её больше нет — удаляем локально', () => {
    const out = decide([local('a', 100, { owner: ME, remoteUpdatedAt: 100 })], [], ME);
    expect(out).toEqual([{ kind: 'delete-local', projectId: 'a' }]);
  });

  it('НИКОГДА не выгружалась и не наша — не трогаем', () => {
    // Доска, нарисованная до входа. Забирать её в аккаунт молча нельзя.
    expect(decide([local('a', 100)], [], ME)).toEqual([{ kind: 'nothing', projectId: 'a' }]);
  });

  it('закреплена за нами, но ещё не уехала — выгружаем', () => {
    const out = decide([local('a', 100, { owner: ME })], [], ME);
    expect(out).toEqual([{ kind: 'push', projectId: 'a' }]);
  });

  it('доска другого пользователя на этом устройстве — не трогаем', () => {
    const out = decide([local('a', 100, { owner: 'user-2', remoteUpdatedAt: 100 })], [], ME);
    expect(out).toEqual([{ kind: 'nothing', projectId: 'a' }]);
  });

  it('есть на сервере, нет локально — скачиваем', () => {
    expect(decide([], [{ id: 'b', updatedAt: 500 }], ME)).toEqual([{ kind: 'pull', projectId: 'b' }]);
  });
});
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Запуск: `npx vitest run src/features/cloud/model/merge.test.ts`
Ожидание: FAIL, `Failed to resolve import "./merge"`.

- [ ] **Шаг 3: Завести стор метаданных**

В `src/features/persistence/db.ts`: поднять `DB_VERSION` до 3, добавить в
`ProstorDB` поле `sync: { key: Id; value: SyncState }`, а в `upgrade` — ветку:

```ts
      if (oldVersion < 3) {
        db.createObjectStore('sync', { keyPath: 'projectId' });
      }
```

Комментарий к версии обновить: «1 — проекты и документы. 2 — картинки (FR-06).
3 — метаданные синхронизации».

Создать `src/features/persistence/syncStore.ts`:

```ts
/**
 * Что вкладка знает о синхронизации каждой доски.
 *
 * Живёт отдельно от `Project` намеренно: `Project` — общий шов (зона A и B
 * договорились о нём в shared/types), и расширять его ради облака значило бы
 * менять контракт из-за детали одной зоны.
 */

import type { Id } from '@/shared/types/document';
import { getDB as db } from './db';

export interface SyncState {
  projectId: Id;
  /** Владелец, за которым закреплена доска. Нет — доска ничья, локальная. */
  owner?: string;
  /** `updatedAt` версии, которая точно доехала до сервера. */
  remoteUpdatedAt?: number;
  /** Есть локальные правки, не уехавшие на сервер. */
  dirty: boolean;
  /** Опубликована ли доска по ссылке. Хранится здесь, чтобы выгрузка
   *  не ходила за флагом в сеть на каждый круг. */
  isPublic?: boolean;
}

export const readSyncState = async (projectId: Id): Promise<SyncState | undefined> =>
  (await db()).get('sync', projectId);

export const writeSyncState = async (state: SyncState): Promise<void> => {
  await (await db()).put('sync', state);
};

export const allSyncStates = async (): Promise<SyncState[]> => (await db()).getAll('sync');

export const forgetSyncState = async (projectId: Id): Promise<void> => {
  await (await db()).delete('sync', projectId);
};
```

- [ ] **Шаг 4: Написать правило**

Создать `src/features/cloud/model/merge.ts`:

```ts
/**
 * Что делать с каждой доской. Чистая функция: ни сети, ни базы, ни времени —
 * поэтому её можно прогнать таблицей случаев, а не ловить их руками.
 *
 * Правило конфликта простое и объявленное: побеждает версия с более поздним
 * `updatedAt`, целиком. Слияние по узлам здесь было бы догадкой о намерении.
 */

import type { SyncState } from '@/features/persistence/syncStore';
import type { Id } from '@/shared/types/document';

export interface LocalBoard {
  projectId: Id;
  updatedAt: number;
  state?: SyncState;
}

export interface RemoteBoard {
  id: Id;
  updatedAt: number;
}

export type Decision =
  | { kind: 'push'; projectId: Id }
  | { kind: 'pull'; projectId: Id }
  | { kind: 'delete-local'; projectId: Id }
  | { kind: 'nothing'; projectId: Id };

export function decide(local: LocalBoard[], remote: RemoteBoard[], owner: string): Decision[] {
  const remoteById = new Map(remote.map((board) => [board.id, board]));
  const decisions: Decision[] = [];

  for (const board of local) {
    const { projectId, state } = board;
    const mine = state?.owner === undefined || state.owner === owner;
    // Доска другого пользователя на этом же устройстве — не наша забота.
    if (!mine) {
      decisions.push({ kind: 'nothing', projectId });
      continue;
    }

    const twin = remoteById.get(projectId);
    if (twin) {
      remoteById.delete(projectId);
      if (board.updatedAt > twin.updatedAt) decisions.push({ kind: 'push', projectId });
      else if (board.updatedAt < twin.updatedAt) decisions.push({ kind: 'pull', projectId });
      else decisions.push({ kind: state?.dirty ? 'push' : 'nothing', projectId });
      continue;
    }

    // На сервере доски нет. Была ли она там когда-нибудь — вот весь вопрос.
    if (state?.remoteUpdatedAt !== undefined) {
      decisions.push({ kind: 'delete-local', projectId });
    } else if (state?.owner === owner) {
      decisions.push({ kind: 'push', projectId });
    } else {
      // Нарисована до входа и в аккаунт не переносилась — не трогаем.
      decisions.push({ kind: 'nothing', projectId });
    }
  }

  for (const board of remoteById.values()) {
    decisions.push({ kind: 'pull', projectId: board.id });
  }

  return decisions;
}
```

- [ ] **Шаг 5: Запустить тест и убедиться, что он проходит**

Запуск: `npx vitest run src/features/cloud/model/merge.test.ts`
Ожидание: PASS, 9 тестов.

- [ ] **Шаг 6: Проверить, что база поднимается**

Запуск: `npx playwright test e2e/smoke.spec.ts --project=e2e`
Ожидание: PASS. Смысл прогона — миграция базы 2 → 3 на живом приложении:
у всех уже есть база версии 2, и сломанный `upgrade` виден только так.

- [ ] **Шаг 7: Закоммитить**

```bash
npm run typecheck && npm run lint && npm test
git add src/features/persistence/db.ts src/features/persistence/syncStore.ts src/features/cloud/model/merge.ts src/features/cloud/model/merge.test.ts
git commit -m "feat(cloud): метаданные синхронизации и правило слияния"
```

---

### Задача 4: Выгрузка доски на сервер

**Файлы:**
- Создать: `src/features/cloud/model/push.ts`, `src/features/cloud/model/push.test.ts`
- Создать: `src/features/cloud/model/useCloudSync.ts`
- Создать: `e2e/cloud-push.spec.ts`
- Изменить: `src/features/persistence/projectsRepo.ts` (удаление сносит и удалённую строку),
  `src/app/CanvasScreen.tsx` (подключить хук), `src/features/cloud/index.ts`

**Интерфейсы:**
- Берёт из задач 1–3: `getCloud`, `useSession`, `readSyncState`, `writeSyncState`, `SyncState`.
- Отдаёт наружу: `toRow(project, document, owner, isPublic): ProjectRow` (чистая),
  `pushProject(projectId: Id, owner: string): Promise<boolean>` — `true`, если
  доехало; `deleteRemote(projectId: Id): Promise<void>`; хук `useCloudSync()`.

- [ ] **Шаг 1: Написать падающий тест на строку таблицы**

Создать `src/features/cloud/model/push.test.ts`:

```ts
/**
 * Форма строки, которая уезжает на сервер. Проверяется то, что молча разъедется:
 * время в Postgres — строка ISO, а сравниваем мы миллисекунды, и обратный разбор
 * обязан давать ровно то же число.
 */

import { describe, expect, it } from 'vitest';

import { doc, shape } from '@/shared/model/fixtures';
import { rowUpdatedAt, toRow } from './push';

const project = {
  id: 'p1',
  name: 'Доска',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_500_000,
};

describe('toRow', () => {
  it('кладёт документ целиком и владельца', () => {
    const row = toRow(project, doc([shape('a')]), 'user-1', false);

    expect(row.id).toBe('p1');
    expect(row.owner).toBe('user-1');
    expect(row.is_public).toBe(false);
    expect(Object.keys(row.document.nodes)).toEqual(['a']);
  });

  it('время уходит строкой ISO и разбирается обратно без потерь', () => {
    const row = toRow(project, doc([]), 'user-1', false);

    expect(row.updated_at).toBe(new Date(1_700_000_500_000).toISOString());
    expect(rowUpdatedAt(row.updated_at)).toBe(1_700_000_500_000);
  });

  it('превью может не быть — это null, а не undefined', () => {
    // undefined в jsonb превращается в отсутствие поля, и строка на сервере
    // начинает отличаться от строки локально.
    expect(toRow(project, doc([]), 'user-1', false).thumbnail).toBeNull();
  });
});
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Запуск: `npx vitest run src/features/cloud/model/push.test.ts`
Ожидание: FAIL, `Failed to resolve import "./push"`.

- [ ] **Шаг 3: Написать выгрузку**

Создать `src/features/cloud/model/push.ts`:

```ts
/**
 * Выгрузка доски. Одна строка на доску, документ целиком в `jsonb`.
 *
 * Порядок внутри выгрузки: сначала картинки (задача 6), потом строка. Обратный
 * порядок даёт мгновение, когда на сервере лежит доска со ссылками на ещё
 * не загруженные файлы, и другое устройство успевает её скачать именно тогда.
 *
 * Ошибка сети не откатывает ничего локально — она только ставит `dirty`.
 */

import { getDocument, getProject } from '@/features/persistence';
import { readSyncState, writeSyncState } from '@/features/persistence/syncStore';
import type { BoardDocument, Id, Project } from '@/shared/types/document';

import { getCloud } from './client';

export interface ProjectRow {
  id: string;
  owner: string;
  name: string;
  created_at: string;
  updated_at: string;
  thumbnail: string | null;
  document: BoardDocument;
  is_public: boolean;
}

export const toRow = (
  project: Pick<Project, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'thumbnail'>,
  document: BoardDocument,
  owner: string,
  isPublic: boolean,
): ProjectRow => ({
  id: project.id,
  owner,
  name: project.name,
  created_at: new Date(project.createdAt).toISOString(),
  updated_at: new Date(project.updatedAt).toISOString(),
  thumbnail: project.thumbnail ?? null,
  document,
  is_public: isPublic,
});

/** Время строки обратно в миллисекунды — тем же способом во всех местах. */
export const rowUpdatedAt = (value: string): number => Date.parse(value);

export const pushProject = async (projectId: Id, owner: string): Promise<boolean> => {
  const cloud = getCloud();
  if (!cloud) return false;

  const [project, document, state] = await Promise.all([
    getProject(projectId),
    getDocument(projectId),
    readSyncState(projectId),
  ]);
  if (!project || !document) return false;

  const row = toRow(project, document, owner, state?.isPublic ?? false);
  const { error } = await cloud.from('projects').upsert(row);

  await writeSyncState({
    projectId,
    owner,
    ...(error ? {} : { remoteUpdatedAt: project.updatedAt }),
    dirty: Boolean(error),
    isPublic: state?.isPublic ?? false,
  });

  return !error;
};

export const deleteRemote = async (projectId: Id): Promise<void> => {
  await getCloud()?.from('projects').delete().eq('id', projectId);
};
```

- [ ] **Шаг 4: Запустить тест и убедиться, что он проходит**

Запуск: `npx vitest run src/features/cloud/model/push.test.ts`
Ожидание: PASS, 3 теста.

- [ ] **Шаг 5: Когда выгружать**

Создать `src/features/cloud/model/useCloudSync.ts`: хук на экране холста.
Подписывается на `useSaveStatus`; после каждого перехода в `saved` заводит
таймер на 3000 мс и по нему зовёт `pushProject`. Свой дебаунс, а не общий
с автосохранением: у того 500 мс, и выгрузка на каждый штрих съест квоту.
При размонтировании — выгрузить немедленно, без ожидания таймера. Если
`useSession` не даёт `userId` — хук не делает ничего.

Подключить в `src/app/CanvasScreen.tsx` рядом с `useAutosave()`.

- [ ] **Шаг 6: Удаление проекта сносит и удалённую строку**

В `src/features/persistence/projectsRepo.ts`, в `deleteProject`, после удаления
локальных записей — `forgetSyncState(id)`. Сам вызов `deleteRemote` поставить
в `useCloudSync`/`AccountMenu`-слое, а не в persistence: persistence не должен
знать про облако. Проще всего — обработчик удаления в `features/projects`
после успешного `deleteProject` зовёт `deleteRemote(id)`, если есть `userId`.

- [ ] **Шаг 7: E2e на выгрузку**

Создать `e2e/cloud-push.spec.ts`: подменить клиент заглушкой, которая пишет
все вызовы `from('projects').upsert(row)` в массив на `window`. Сценарий:
войти, открыть доску, добавить узел через `window.__board`, подождать 3.5 с,
проверить, что `upsert` вызван ровно один раз и в строке лежит документ
с этим узлом. Второй сценарий: заглушка возвращает ошибку — проверить,
что доска осталась на месте, а в базе `sync` у неё `dirty: true`.

- [ ] **Шаг 8: Прогнать и закоммитить**

```bash
npm run typecheck && npm run lint && npm test
npx playwright test e2e/cloud-push.spec.ts --project=e2e
git add src/features/cloud src/features/persistence/projectsRepo.ts src/features/projects src/app/CanvasScreen.tsx e2e/cloud-push.spec.ts
git commit -m "feat(cloud): выгрузка доски на сервер"
```

---

### Задача 5: Скачивание и применение решений

**Файлы:**
- Создать: `src/features/cloud/model/pull.ts`, `src/features/cloud/model/pull.test.ts`
- Создать: `e2e/cloud-pull.spec.ts`
- Изменить: `src/features/persistence/projectsRepo.ts` (`overwriteProject`),
  `src/features/cloud/model/useCloudSync.ts` (синхронизация при входе)

**Интерфейсы:**
- Берёт из задач 3–4: `decide`, `LocalBoard`, `RemoteBoard`, `Decision`,
  `pushProject`, `rowUpdatedAt`, `readSyncState`, `writeSyncState`, `forgetSyncState`.
- Отдаёт наружу: `remoteList(owner): Promise<RemoteBoard[]>`,
  `pullProject(projectId): Promise<boolean>`, `syncNow(owner): Promise<void>`,
  `localBoards(): Promise<LocalBoard[]>`.
- В `projectsRepo` появляется `overwriteProject(project: Project, document: BoardDocument): Promise<void>`
  — запись проекта и документа как есть, без сдвига `updatedAt` и без проверки
  сессии вкладки: пришедшее с сервера не «правка», а другая версия.

- [ ] **Шаг 1: Написать падающий тест на применение решений**

Создать `src/features/cloud/model/pull.test.ts`:

```ts
/**
 * Применение решений. Сами операции подменены — проверяется, что каждое
 * решение вызывает своё действие и ровно один раз: молчаливое «скачали вместо
 * выгрузили» стирает работу, и увидеть это постфактум нечем.
 */

import { describe, expect, it, vi } from 'vitest';

import { applyDecisions } from './pull';

const spies = () => ({
  push: vi.fn(async () => true),
  pull: vi.fn(async () => true),
  deleteLocal: vi.fn(async () => {}),
});

describe('applyDecisions', () => {
  it('каждое решение зовёт своё действие', async () => {
    const actions = spies();

    await applyDecisions(
      [
        { kind: 'push', projectId: 'a' },
        { kind: 'pull', projectId: 'b' },
        { kind: 'delete-local', projectId: 'c' },
        { kind: 'nothing', projectId: 'd' },
      ],
      actions,
    );

    expect(actions.push).toHaveBeenCalledExactlyOnceWith('a');
    expect(actions.pull).toHaveBeenCalledExactlyOnceWith('b');
    expect(actions.deleteLocal).toHaveBeenCalledExactlyOnceWith('c');
  });

  it('отказ на одной доске не останавливает остальные', async () => {
    const actions = spies();
    actions.push.mockRejectedValueOnce(new Error('нет сети'));

    await applyDecisions(
      [
        { kind: 'push', projectId: 'a' },
        { kind: 'pull', projectId: 'b' },
      ],
      actions,
    );

    expect(actions.pull).toHaveBeenCalledExactlyOnceWith('b');
  });
});
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Запуск: `npx vitest run src/features/cloud/model/pull.test.ts`
Ожидание: FAIL, `Failed to resolve import "./pull"`.

- [ ] **Шаг 3: Написать скачивание**

Создать `src/features/cloud/model/pull.ts`:

```ts
/**
 * Скачивание и применение решений.
 *
 * Пришедший документ проходит `repairDocument` — ту же починку, что и файл
 * при импорте. Причина та же: строка в базе могла быть записана другой
 * версией приложения, и это граница доверия, а не «наши же данные».
 */

import {
  deleteProject,
  getDocument,
  listProjects,
  overwriteProject,
} from '@/features/persistence';
import { repairDocument } from '@/features/persistence/repair';
import {
  allSyncStates,
  forgetSyncState,
  readSyncState,
  writeSyncState,
} from '@/features/persistence/syncStore';
import type { Id } from '@/shared/types/document';

import { getCloud } from './client';
import { decide, type Decision, type LocalBoard, type RemoteBoard } from './merge';
import { pushProject, type ProjectRow, rowUpdatedAt } from './push';

export const remoteList = async (owner: string): Promise<RemoteBoard[]> => {
  const cloud = getCloud();
  if (!cloud) return [];

  const { data, error } = await cloud.from('projects').select('id, updated_at').eq('owner', owner);
  if (error || !data) return [];

  return data.map((row) => ({ id: row.id as Id, updatedAt: rowUpdatedAt(row.updated_at) }));
};

export const localBoards = async (): Promise<LocalBoard[]> => {
  const [projects, states] = await Promise.all([listProjects(), allSyncStates()]);
  const byId = new Map(states.map((state) => [state.projectId, state]));

  return projects.map((project) => {
    const state = byId.get(project.id);
    return { projectId: project.id, updatedAt: project.updatedAt, ...(state ? { state } : {}) };
  });
};

export const pullProject = async (projectId: Id): Promise<boolean> => {
  const cloud = getCloud();
  if (!cloud) return false;

  const { data, error } = await cloud.from('projects').select('*').eq('id', projectId).single();
  if (error || !data) return false;

  const row = data as ProjectRow;
  const updatedAt = rowUpdatedAt(row.updated_at);
  const repaired = repairDocument(row.document);

  await overwriteProject(
    {
      id: row.id,
      name: row.name,
      createdAt: rowUpdatedAt(row.created_at),
      updatedAt,
      ...(row.thumbnail ? { thumbnail: row.thumbnail } : {}),
    },
    repaired.document,
  );

  await writeSyncState({
    projectId: row.id,
    owner: row.owner,
    remoteUpdatedAt: updatedAt,
    dirty: false,
    isPublic: row.is_public,
  });

  return true;
};

const deleteLocal = async (projectId: Id): Promise<void> => {
  await deleteProject(projectId);
  await forgetSyncState(projectId);
};

export interface SyncActions {
  push(projectId: Id): Promise<boolean>;
  pull(projectId: Id): Promise<boolean>;
  deleteLocal(projectId: Id): Promise<void>;
}

/**
 * Применение решений по одному. Последовательно, а не `Promise.all`: пачка
 * параллельных записей в IndexedDB и в сеть на двадцати досках — это способ
 * получить таймаут вместо синхронизации.
 *
 * Отказ на одной доске не отменяет остальные: связь могла оборваться посреди
 * списка, и половина синхронизированных досок лучше нуля.
 */
export async function applyDecisions(
  decisions: Decision[],
  actions: SyncActions,
): Promise<void> {
  for (const decision of decisions) {
    try {
      if (decision.kind === 'push') await actions.push(decision.projectId);
      else if (decision.kind === 'pull') await actions.pull(decision.projectId);
      else if (decision.kind === 'delete-local') await actions.deleteLocal(decision.projectId);
    } catch (error) {
      console.warn('Не удалось синхронизировать доску', decision.projectId, error);
    }
  }
}

export const syncNow = async (owner: string): Promise<void> => {
  const [local, remote] = await Promise.all([localBoards(), remoteList(owner)]);

  await applyDecisions(decide(local, remote, owner), {
    push: (projectId) => pushProject(projectId, owner),
    pull: pullProject,
    deleteLocal,
  });
};
```

Дополнительно: `getDocument` и `readSyncState` в этом файле не нужны — если
редактор оставил импорт, убрать, иначе `biome` покраснеет на неиспользуемом.

- [ ] **Шаг 4: Запись проекта как есть**

В `src/features/persistence/projectsRepo.ts` добавить:

```ts
/**
 * Запись проекта и документа как есть — для того, что пришло с сервера.
 *
 * `updatedAt` НЕ сдвигается и проверка сессии вкладки не делается: это не
 * правка пользователя, а другая версия той же доски. Подвинуть время здесь —
 * значит на следующем круге синхронизации выгрузить её обратно и зациклиться.
 */
export const overwriteProject = async (
  project: Project,
  document: BoardDocument,
): Promise<void> => {
  const database = await db();
  const tx = database.transaction(['projects', 'documents'], 'readwrite');
  await Promise.all([
    tx.objectStore('projects').put(project),
    tx.objectStore('documents').put(document),
    tx.done,
  ]);
  publish({ kind: 'projects-changed' });
};
```

Экспортировать его из `src/features/persistence/index.ts`.

- [ ] **Шаг 5: Запустить тест и убедиться, что он проходит**

Запуск: `npx vitest run src/features/cloud/model/pull.test.ts`
Ожидание: PASS, 2 теста.

- [ ] **Шаг 6: Синхронизация при входе**

В `src/features/cloud/model/useCloudSync.ts` подписаться на `useSession`:
появился `userId` — позвать `syncNow(userId)` один раз. Повторный вход тем же
пользователем не должен запускать второй круг: сравнивать с предыдущим
значением, а не звать на каждый рендер.

- [ ] **Шаг 7: E2e на скачивание**

Создать `e2e/cloud-pull.spec.ts`: заглушка отдаёт список из одной доски,
которой нет локально, и её строку целиком. Сценарий: войти → дождаться,
что карточка появилась в списке проектов → открыть её и убедиться, что узлы
на месте. Второй сценарий: доска, которая раньше синхронизировалась
(в базе `sync` есть `remoteUpdatedAt`), а в списке с сервера её нет —
после входа она исчезает из списка.

- [ ] **Шаг 8: Прогнать и закоммитить**

```bash
npm run typecheck && npm run lint && npm test
npx playwright test e2e/cloud-pull.spec.ts --project=e2e
git add src/features/cloud src/features/persistence e2e/cloud-pull.spec.ts
git commit -m "feat(cloud): скачивание досок и применение решений слияния"
```

---

### Задача 6: Картинки

**Файлы:**
- Создать: `src/features/cloud/model/images.ts`, `src/features/cloud/model/images.test.ts`
- Создать: `e2e/cloud-images.spec.ts`
- Изменить: `src/features/persistence/blobStore.ts`, `src/features/cloud/model/push.ts`,
  `src/main.tsx`

**Интерфейсы:**
- Отдаёт наружу: `collectBlobIds(document): Id[]` (чистая),
  `uploadImages(document, owner): Promise<void>`,
  `downloadImage(blobId, owner): Promise<Blob | undefined>`,
  `connectRemoteImages(): void` — ставит фолбэк в `blobStore`.
- В `blobStore` появляется `setRemoteBlobSource(source: ((blobId: Id) => Promise<Blob | undefined>) | null): void`.

- [ ] **Шаг 1: Написать падающий тест на сбор картинок**

Создать `src/features/cloud/model/images.test.ts`:

```ts
/**
 * Какие файлы нужны доске. Ошибка здесь тихая и злая: не выгрузили картинку —
 * на другом устройстве доска открылась с дырой вместо изображения.
 */

import { describe, expect, it } from 'vitest';

import { doc, shape } from '@/shared/model/fixtures';
import type { ImageNode } from '@/shared/types/document';
import { collectBlobIds } from './images';

const image = (id: string, blobId: string): ImageNode => ({
  id,
  type: 'image',
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  rotation: 0,
  opacity: 1,
  locked: false,
  blobId,
  naturalWidth: 200,
  naturalHeight: 160,
});

describe('collectBlobIds', () => {
  it('собирает картинки документа', () => {
    expect(collectBlobIds(doc([image('i1', 'b1'), shape('s1'), image('i2', 'b2')]))).toEqual([
      'b1',
      'b2',
    ]);
  });

  it('одна и та же картинка в двух узлах — один файл', () => {
    expect(collectBlobIds(doc([image('i1', 'b1'), image('i2', 'b1')]))).toEqual(['b1']);
  });

  it('доска без картинок — пусто', () => {
    expect(collectBlobIds(doc([shape('s1')]))).toEqual([]);
  });
});
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Запуск: `npx vitest run src/features/cloud/model/images.test.ts`
Ожидание: FAIL, `Failed to resolve import "./images"`.

- [ ] **Шаг 3: Написать работу с картинками**

Создать `src/features/cloud/model/images.ts`:

```ts
/**
 * Картинки в Storage. Путь — `owner/blobId`: писать в свою папку может только
 * владелец, читать может кто угодно, у кого есть ссылка (bucket публичный
 * на чтение). `blobId` неугадываем, и это вся защита — так и записано в спеке.
 *
 * Скачивание ленивое: файл тянется в тот момент, когда его попросили нарисовать,
 * а не пачкой после синхронизации. Доска на сорок картинок иначе тормозила бы
 * весь вход ради изображений, которых человек может и не увидеть.
 */

import { getBlob, putBlobDirect, setRemoteBlobSource } from '@/features/persistence/blobStore';
import type { BoardDocument, Id } from '@/shared/types/document';

import { getCloud } from './client';

const BUCKET = 'images';

/** Какие файлы упоминает документ. Порядок — как в `order`, дубли убраны. */
export const collectBlobIds = (document: BoardDocument): Id[] => {
  const found: Id[] = [];
  const seen = new Set<Id>();

  for (const id of document.order) {
    const node = document.nodes[id];
    if (node?.type !== 'image' || seen.has(node.blobId)) continue;
    seen.add(node.blobId);
    found.push(node.blobId);
  }

  return found;
};

export const uploadImages = async (document: BoardDocument, owner: string): Promise<void> => {
  const cloud = getCloud();
  if (!cloud) return;

  for (const blobId of collectBlobIds(document)) {
    const blob = await getBlob(blobId);
    if (!blob) continue;

    // upsert: false — файл неизменяемый, второй раз его заливать незачем.
    // «Уже есть» здесь не ошибка, а нормальный исход повторной выгрузки.
    await cloud.storage.from(BUCKET).upload(`${owner}/${blobId}`, blob, { upsert: false });
  }
};

export const downloadImage = async (blobId: Id, owner: string): Promise<Blob | undefined> => {
  const cloud = getCloud();
  if (!cloud) return undefined;

  const { data } = await cloud.storage.from(BUCKET).download(`${owner}/${blobId}`);
  return data ?? undefined;
};

/**
 * Подключает фолбэк: `blobStore` не знает про облако и не должен — иначе
 * зона хранения начинает зависеть от зоны синхронизации, а не наоборот.
 */
export const connectRemoteImages = (owner: string | null): void => {
  if (!owner) {
    setRemoteBlobSource(null);
    return;
  }

  setRemoteBlobSource(async (blobId) => {
    const blob = await downloadImage(blobId, owner);
    // Скачали — кладём локально: второй раз за тем же файлом в сеть не ходим.
    if (blob) await putBlobDirect(blobId, blob);
    return blob;
  });
};
```

- [ ] **Шаг 4: Фолбэк в хранилище картинок**

В `src/features/persistence/blobStore.ts`:

```ts
/**
 * Откуда брать картинку, которой нет локально. Ставится слайсом облака;
 * без него хранилище работает ровно как раньше — только локально.
 */
type RemoteBlobSource = (blobId: Id) => Promise<Blob | undefined>;
let remoteSource: RemoteBlobSource | null = null;

export const setRemoteBlobSource = (source: RemoteBlobSource | null): void => {
  remoteSource = source;
};

/** Прямая запись блоба с известным id — для скачанного с сервера. */
export const putBlobDirect = async (blobId: Id, blob: Blob): Promise<void> => {
  await withDB((db) => db.put('blobs', { blobId, blob }));
};
```

и в `getBlob` — падение в источник, когда локально пусто:

```ts
export const getBlob = async (blobId: Id): Promise<Blob | undefined> => {
  const local = await withDB((db) => db.get('blobs', blobId));
  if (local) return local.blob;
  return remoteSource ? remoteSource(blobId) : undefined;
};
```

Точную нынешнюю форму `getBlob` посмотреть в файле и сохранить её —
здесь показан только смысл правки, а не дословная замена.

- [ ] **Шаг 5: Запустить тест и убедиться, что он проходит**

Запуск: `npx vitest run src/features/cloud/model/images.test.ts`
Ожидание: PASS, 3 теста.

- [ ] **Шаг 6: Выгружать картинки перед строкой**

В `pushProject` (задача 4) — вызов `await uploadImages(document, owner)` ДО
`upsert` строки. Комментарий про порядок там уже есть, теперь он становится
правдой.

`connectRemoteImages(userId)` звать из `useCloudSync` при смене пользователя.

- [ ] **Шаг 7: E2e на ленивое скачивание**

Создать `e2e/cloud-images.spec.ts`: заглушка отдаёт доску с узлом-картинкой,
блоба которой локально нет, а `storage.from('images').download` возвращает
маленький PNG. Проверить: после открытия доски `download` был вызван ровно
один раз с путём `owner/blobId`, а повторное открытие доски в сеть не ходит —
файл уже лежит локально.

- [ ] **Шаг 8: Прогнать и закоммитить**

```bash
npm run typecheck && npm run lint && npm test
npx playwright test e2e/cloud-images.spec.ts --project=e2e
git add src/features/cloud src/features/persistence/blobStore.ts src/main.tsx e2e/cloud-images.spec.ts
git commit -m "feat(cloud): выгрузка и ленивое скачивание картинок"
```

---

### Задача 7: Публичная ссылка на чтение

**Файлы:**
- Создать: `src/features/cloud/model/share.ts`, `src/features/cloud/model/share.test.ts`
- Создать: `src/features/cloud/ui/ShareButton.tsx`
- Создать: `src/app/PublicBoardScreen.tsx`
- Создать: `e2e/cloud-share.spec.ts`
- Изменить: `src/app/router.tsx`, `src/app/CanvasScreen.tsx`, `docs/CONTRACT-REQUESTS.md`

**Интерфейсы:**
- Берёт из задач 1–5: `getCloud`, `writeSyncState`, `readSyncState`, `rowUpdatedAt`,
  `repairDocument`, `ProjectRow`.
- Отдаёт наружу: `publicUrl(projectId: Id): string`,
  `setPublic(projectId: Id, isPublic: boolean): Promise<boolean>`,
  `loadPublicBoard(projectId: Id): Promise<BoardDocument | null>`.

- [ ] **Шаг 1: Написать падающий тест на адрес ссылки**

Создать `src/features/cloud/model/share.test.ts`:

```ts
/**
 * Адрес публичной доски. Проверяется на подставленном origin: тест не должен
 * зависеть от того, на каком домене его запустили.
 */

import { describe, expect, it } from 'vitest';

import { publicPath, publicUrl } from './share';

describe('публичная ссылка', () => {
  it('путь строится от id доски', () => {
    expect(publicPath('p1')).toBe('/s/p1');
  });

  it('полный адрес берёт origin страницы', () => {
    expect(publicUrl('p1', 'https://prostor.example')).toBe('https://prostor.example/s/p1');
  });

  it('лишний слэш на конце origin не даёт двойного', () => {
    expect(publicUrl('p1', 'https://prostor.example/')).toBe('https://prostor.example/s/p1');
  });
});
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Запуск: `npx vitest run src/features/cloud/model/share.test.ts`
Ожидание: FAIL, `Failed to resolve import "./share"`.

- [ ] **Шаг 3: Написать публикацию**

Создать `src/features/cloud/model/share.ts`:

```ts
/**
 * Публикация доски на чтение.
 *
 * Читателю доска НЕ кладётся в IndexedDB: человек, перешедший по чужой ссылке,
 * не должен обнаружить чужую доску в своём списке проектов. Документ живёт
 * только в памяти вкладки, пока её не закрыли.
 */

import { repairDocument } from '@/features/persistence/repair';
import { readSyncState, writeSyncState } from '@/features/persistence/syncStore';
import type { BoardDocument, Id } from '@/shared/types/document';

import { getCloud } from './client';
import type { ProjectRow } from './push';

export const publicPath = (projectId: Id): string => `/s/${projectId}`;

export const publicUrl = (projectId: Id, origin: string = window.location.origin): string =>
  `${origin.replace(/\/$/, '')}${publicPath(projectId)}`;

export const setPublic = async (projectId: Id, isPublic: boolean): Promise<boolean> => {
  const cloud = getCloud();
  if (!cloud) return false;

  const { error } = await cloud.from('projects').update({ is_public: isPublic }).eq('id', projectId);
  if (error) return false;

  const state = await readSyncState(projectId);
  await writeSyncState({ projectId, dirty: false, ...state, isPublic });
  return true;
};

export const loadPublicBoard = async (projectId: Id): Promise<BoardDocument | null> => {
  const cloud = getCloud();
  if (!cloud) return null;

  // Без входа: правило доступа в базе само отдаст строку, только если
  // `is_public` истинно. Проверять это здесь ещё раз незачем — и опасно:
  // две проверки в разных местах разъезжаются.
  const { data, error } = await cloud.from('projects').select('*').eq('id', projectId).single();
  if (error || !data) return null;

  return repairDocument((data as ProjectRow).document).document;
};
```

- [ ] **Шаг 4: Запустить тест и убедиться, что он проходит**

Запуск: `npx vitest run src/features/cloud/model/share.test.ts`
Ожидание: PASS, 3 теста.

- [ ] **Шаг 5: Кнопка «Поделиться»**

Создать `src/features/cloud/ui/ShareButton.tsx`: показывается только когда
`cloudEnabled()` и человек вошёл, и доска — его. Нажатие зовёт `setPublic`,
кладёт адрес в буфер (`navigator.clipboard.writeText`) и показывает тост
«Ссылка скопирована». Повторное нажатие открывает меню с «Закрыть доступ».
Подключить в шапке `src/app/CanvasScreen.tsx` рядом с `ExportMenu`.

- [ ] **Шаг 6: Экран публичной доски**

Создать `src/app/PublicBoardScreen.tsx`: читает `projectId` из адреса, зовёт
`loadPublicBoard`, кладёт документ в стор через `loadDocument` и рисует
`CanvasStage` без `Toolbar`, без `InspectorPanel`, без `useAutosave`,
`useShortcuts` и `useCloudSync`. Ничего не найдено — понятное состояние
«Доска не найдена или доступ закрыт» со ссылкой на главную.

В `src/app/router.tsx` добавить маршрут:

```tsx
        <Route
          path="/s/:projectId"
          element={
            <Suspense fallback={<div className="h-screen bg-paper" />}>
              <PublicBoardScreen />
            </Suspense>
          }
        />
```

Экран грузить через `lazy`, как `CanvasScreen`: Konva не должна приезжать
на список проектов.

- [ ] **Шаг 7: Записать честное ограничение**

Узлы на публичной доске всё ещё перетаскиваются мышью: `draggable` живёт
в зоне A (`NodesLayer`), и запрет — правка чужой зоны. Правки никуда не
сохраняются, но это неприятная полуправда, и её надо назвать. В
`docs/CONTRACT-REQUESTS.md` добавить запрос зоне A: «режим только чтения для
холста — флаг в сторе, отключающий `draggable` и трансформер». В
`PublicBoardScreen` до тех пор — короткая подпись «Только просмотр».

- [ ] **Шаг 8: E2e на публичную ссылку**

Создать `e2e/cloud-share.spec.ts`: заглушка отдаёт строку доски с
`is_public: true`. Открыть `/s/<id>` без входа: холст виден, узлы нарисованы,
панели инструментов нет, кнопки «Экспорт» — есть. Второй сценарий: заглушка
отвечает ошибкой — на экране «Доска не найдена или доступ закрыт», а не
белый лист. Третий: после открытия публичной доски список проектов на `/`
пуст — чужая доска не осела локально.

- [ ] **Шаг 9: Прогнать и закоммитить**

```bash
npm run typecheck && npm run lint && npm test
npx playwright test e2e/cloud-share.spec.ts --project=e2e
git add src/features/cloud src/app docs/CONTRACT-REQUESTS.md e2e/cloud-share.spec.ts
git commit -m "feat(cloud): публичная ссылка на просмотр доски"
```

---

### Задача 8: Индикатор, честные обещания, критерий 12

**Файлы:**
- Изменить: `src/features/persistence/autosave.ts`, `src/features/persistence/SaveIndicator.tsx`
- Изменить: `e2e/smoke.spec.ts`
- Изменить: `README.md`, `docs/DECISIONS.md`

**Интерфейсы:**
- Берёт из задач 4–5: состояние `dirty` из `SyncState`, факт входа из `useSession`.
- Ничего нового наружу не отдаёт: задача закрывает обещания, а не открывает API.

- [ ] **Шаг 1: Третье состояние индикатора**

В `src/features/persistence/autosave.ts` добавить в `SaveStatus` значение
`'local-only'` — «сохранено на этом устройстве, на сервер не уехало».
Ставится из `useCloudSync`, когда выгрузка вернула `false`; сбрасывается
в `'saved'`, когда следующая выгрузка удалась.

В `src/features/persistence/SaveIndicator.tsx` добавить строку
`'local-only': 'Сохранено только здесь'` и иконку `CloudOff`. В `ALARMING`
это состояние НЕ добавлять: данные целы, тревожить нечем — это сообщение
о ходе работы, а не о потере.

- [ ] **Шаг 2: Проверить индикатор в e2e**

В `e2e/cloud-push.spec.ts` (задача 4) добавить сценарий: заглушка отвечает
ошибкой на `upsert` → в шапке появляется «Сохранено только здесь», а после
успешной попытки — «Все изменения сохранены».

Запуск: `npx playwright test e2e/cloud-push.spec.ts --project=e2e`
Ожидание: PASS.

- [ ] **Шаг 3: Уточнить критерий 12**

В `e2e/smoke.spec.ts` тест «после загрузки и правок доска не ходит в сеть»
переименовать в «**без входа** доска не ходит в сеть (критерий 12)» и
дополнить комментарий: обещание сузилось, потому что появилась синхронизация;
без аккаунта оно выполняется по-прежнему и проверяется здесь.

Сам тест менять по существу не надо — он и так работает без входа. Добавить
в него явную проверку, что кнопка «Войти» на экране есть, но её не нажимали:
иначе через полгода кто-нибудь решит, что тест просто устарел.

Запуск: `npx playwright test e2e/smoke.spec.ts --project=e2e`
Ожидание: PASS.

- [ ] **Шаг 4: Переписать обещания в README**

В `README.md`:

- в шапке — «бэкенда нет, данные живут в браузере» заменить на честное:
  «без аккаунта данные не покидают браузер; с аккаунтом доски синхронизируются
  через Supabase»;
- в таблицу возможностей добавить строку про синхронизацию и публичную ссылку;
- в разделе «Чего не умеет» оставить совместное редактирование и добавить
  ограничение публичной доски (узлы перетаскиваются, правки не сохраняются),
  со ссылкой на запрос в `docs/CONTRACT-REQUESTS.md`;
- дописать, что бесплатный проект Supabase засыпает через неделю без запросов,
  и как это лечится.

- [ ] **Шаг 5: Записать решение**

В `docs/DECISIONS.md` — запись «2026-09-XX · Синхронизация через Supabase»:
что выбрано, что отвергнуто (Firebase — Storage требует карты с февраля 2026;
своё API на Cloudflare — аутентификация руками), и цена: обещание «данные
никуда не уходят» перестало быть безусловным.

- [ ] **Шаг 6: Полный прогон и коммит**

```bash
npm run typecheck && npm run lint && npm test && npm run e2e
git add -A
git commit -m "docs: честные обещания про синхронизацию, критерий 12 без входа"
```

---

### Задача 9: Перенос локальных досок в аккаунт при первом входе

**Файлы:**
- Создать: `src/features/cloud/ui/AdoptDialog.tsx`
- Создать: `src/features/cloud/model/adopt.ts`, `src/features/cloud/model/adopt.test.ts`
- Создать: `e2e/cloud-adopt.spec.ts`
- Изменить: `src/features/cloud/model/useCloudSync.ts`

**Интерфейсы:**
- Берёт из задач 3–5: `localBoards`, `writeSyncState`, `readSyncState`, `syncNow`.
- Отдаёт наружу: `adoptable(local: LocalBoard[]): Id[]` (чистая),
  `adoptBoards(ids: Id[], owner: string): Promise<void>`,
  `declineAdoption(ids: Id[]): Promise<void>`.

Задача идёт последней намеренно: до появления выгрузки переносить доски
некуда, а без неё приложение уже ведёт себя предсказуемо — доски, созданные
до входа, просто остаются локальными.

- [ ] **Шаг 1: Написать падающий тест на отбор досок**

Создать `src/features/cloud/model/adopt.test.ts`:

```ts
/**
 * Какие доски вообще можно предложить перенести. Ошибка здесь означает
 * вопрос «перенести 12 досок?» тому, у кого все двенадцать уже в аккаунте,
 * — или, хуже, предложение утащить доски другого пользователя.
 */

import { describe, expect, it } from 'vitest';

import { adoptable } from './adopt';

describe('adoptable', () => {
  it('доска без владельца — можно предложить', () => {
    expect(adoptable([{ projectId: 'a', updatedAt: 1 }])).toEqual(['a']);
  });

  it('доска уже за кем-то закреплена — не предлагаем', () => {
    expect(
      adoptable([
        { projectId: 'a', updatedAt: 1, state: { projectId: 'a', dirty: false, owner: 'user-2' } },
      ]),
    ).toEqual([]);
  });

  it('на вопрос уже ответили «нет» — второй раз не спрашиваем', () => {
    expect(
      adoptable([
        { projectId: 'a', updatedAt: 1, state: { projectId: 'a', dirty: false, declined: true } },
      ]),
    ).toEqual([]);
  });
});
```

- [ ] **Шаг 2: Запустить тест и убедиться, что он падает**

Запуск: `npx vitest run src/features/cloud/model/adopt.test.ts`
Ожидание: FAIL, `Failed to resolve import "./adopt"`.

- [ ] **Шаг 3: Написать отбор и перенос**

В `SyncState` (задача 3) добавить поле `declined?: boolean` — «на перенос
этой доски человек ответил отказом». Создать `src/features/cloud/model/adopt.ts`:

```ts
/**
 * Перенос локальных досок в аккаунт.
 *
 * Молча забирать их нельзя: вход на чужом компьютере утащил бы чужие доски
 * в свой аккаунт. Поэтому один явный вопрос — и запомненный ответ, чтобы
 * не спрашивать при каждом входе.
 */

import { writeSyncState } from '@/features/persistence/syncStore';
import type { Id } from '@/shared/types/document';

import type { LocalBoard } from './merge';

/** Доски, которые никому не принадлежат и от которых ещё не отказались. */
export const adoptable = (local: LocalBoard[]): Id[] =>
  local
    .filter((board) => board.state?.owner === undefined && board.state?.declined !== true)
    .map((board) => board.projectId);

export const adoptBoards = async (ids: Id[], owner: string): Promise<void> => {
  for (const projectId of ids) {
    await writeSyncState({ projectId, owner, dirty: true });
  }
};

export const declineAdoption = async (ids: Id[]): Promise<void> => {
  for (const projectId of ids) {
    await writeSyncState({ projectId, dirty: false, declined: true });
  }
};
```

`dirty: true` при переносе — не хитрость: доска закреплена за владельцем,
но на сервер ещё не уехала, и следующий круг синхронизации обязан её выгрузить.

- [ ] **Шаг 4: Запустить тест и убедиться, что он проходит**

Запуск: `npx vitest run src/features/cloud/model/adopt.test.ts`
Ожидание: PASS, 3 теста.

- [ ] **Шаг 5: Диалог**

Создать `src/features/cloud/ui/AdoptDialog.tsx`: показывается один раз после
входа, если `adoptable(...)` не пуст. Текст: «На этом устройстве N досок,
не привязанных ни к какому аккаунту. Перенести их в <почта>?» Кнопки
«Перенести» и «Оставить локальными». Обе закрывают вопрос навсегда:
первая зовёт `adoptBoards`, вторая — `declineAdoption`, после чего
`useCloudSync` запускает `syncNow`.

- [ ] **Шаг 6: E2e**

Создать `e2e/cloud-adopt.spec.ts`: создать доску до входа, войти, увидеть
вопрос, нажать «Перенести» → доска уходит в `upsert`. Второй сценарий:
нажать «Оставить локальными» → `upsert` не вызывался, и после выхода
и повторного входа вопрос больше не появляется.

- [ ] **Шаг 7: Прогнать и закоммитить**

```bash
npm run typecheck && npm run lint && npm test
npx playwright test e2e/cloud-adopt.spec.ts --project=e2e
git add src/features/cloud e2e/cloud-adopt.spec.ts
git commit -m "feat(cloud): перенос локальных досок в аккаунт по согласию"
```

---

## Самопроверка плана

Пройдено по спеке раздел за разделом:

| Раздел спеки | Где реализуется |
|---|---|
| Границы зон, слайс `features/cloud` | задачи 1–7, карта файлов |
| Данные на сервере (таблица, RLS, bucket) | задача 1, `docs/cloud-setup.md` |
| Локальные метаданные (`sync`) | задача 3 |
| Чьё время сравниваем | задача 4 (`toRow`, `rowUpdatedAt`) |
| Локальные доски при первом входе | задача 3 (правило `nothing`) и задача 9 (диалог переноса) |
| Поток: pull, push, удаление | задачи 4 и 5 |
| Картинки | задача 6 |
| Публичная ссылка | задача 7 |
| Ошибки и деградация | задачи 4, 5, 8 |
| Проверки, критерий 12 | задачи 3–8 |
| Ручные шаги | задача 1 |

**Что нашла самопроверка.** Спека обещает вопрос «перенести N локальных досок
в аккаунт?» при первом входе, а в первых восьми задачах его не было — правило
`decide` такие доски просто не трогает. Дыра закрыта девятой задачей, и она
намеренно последняя: до появления выгрузки переносить доски некуда, а без
переноса поведение остаётся предсказуемым.

Проверено также: поле `isPublic` объявлено там же, где остальные метаданные
(задача 3), а не дописывается задним числом в задаче 4; имена `pushProject`,
`pullProject`, `syncNow`, `rowUpdatedAt`, `collectBlobIds`, `setRemoteBlobSource`
одинаковы во всех задачах, где встречаются; заглушек «TBD» и шагов без кода
в плане нет.
