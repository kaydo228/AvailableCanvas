# Настройка облака (Supabase)

Приложение работает полностью локально по умолчанию. Чтобы добавить синхронизацию между устройствами, нужно подключить Supabase.

## Переменные окружения

1. Создайте файл `.env.local` в корне проекта (он НЕ коммитится).
2. Заполните переменные:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anonKey-here
```

Получить значения можно в [Supabase Dashboard](https://app.supabase.com):
- **Project URL** — в Settings → Configuration
- **Anon Key** — в Settings → API

Без этих переменных приложение работает как раньше, полностью локально.

## Базовая таблица и правила доступа

Откройте [supabase/schema.sql](../supabase/schema.sql), скопируйте его целиком в SQL Editor
проекта Supabase и нажмите **Run**. Доска — это одна строка, документ целиком хранится в
колонке `document` (JSON), `thumbnail` содержит превью для списка проектов.

Этот шаг нужен один раз для нового пустого проекта. Если `schema.sql` уже выполнялся и
таблица `projects` существует, повторять его перед обновлением совместной работы не нужно.

**Колонки:**
- `id` — идентификатор доски, ставится клиентом (nanoid)
- `owner` — UUID пользователя, владельца доски
- `name` — имя доски (отображается в списке)
- `created_at` / `updated_at` — время создания и последнего обновления
- `thumbnail` — превью доски для сетки в списке (PNG в base64 или ссылка)
- `document` — весь документ целиком (JSON из `Project` клиента)
- `is_public` — флаг публичной доски (читаемой по ссылке)

## Совместная работа

Миграция
[`20260918120000_project_collaboration.sql`](../supabase/migrations/20260918120000_project_collaboration.sql)
добавляет:

- `project_members` — зарегистрированных участников с ролью `editor` или `viewer`;
- `project_invites` — приглашения для адресов, которые ещё не зарегистрированы;
- атомарное сохранение с `revision` и `updated_by`;
- RLS-политики для владельца, редактора и зрителя;
- RPC принятия приглашения и управление участниками;
- публикацию `projects` в Supabase Realtime.

Владелец управляет участниками. Редактор может менять доску, а зритель — только
открывать, перемещаться по холсту и экспортировать. Realtime передаёт последнее
сохранённое состояние всей доски; это не CRDT: чужих курсоров и бесконфликтного
слияния одновременных правок одного объекта нет.

### Развёртывание в production

Из корня репозитория выполните:

```bash
npx supabase link --project-ref wfhxobnovnhsimnfnefb
npx supabase db push
npx supabase secrets set APP_URL=https://kaydo228.github.io/AvailableCanvas/
npx supabase functions deploy invite-project-member --project-ref wfhxobnovnhsimnfnefb
```

Затем в Supabase Dashboard откройте **Authentication → URL Configuration →
Redirect URLs** и добавьте точный адрес:

```text
https://kaydo228.github.io/AvailableCanvas/invite
```

После этого письмо-приглашение вернёт пользователя на экран принятия доступа,
где приложение предложит задать пароль, примет приглашение и откроет проект.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` и `SUPABASE_SERVICE_ROLE_KEY` доступны Edge
Function автоматически. В GitHub Pages их копировать нельзя, особенно
`SUPABASE_SERVICE_ROLE_KEY`: это серверный секрет с обходом RLS. В команду
`supabase secrets set` вручную передаётся только `APP_URL`.

## Хранилище изображений

Скрипт также создаёт bucket `images` и правила доступа. Картинки хранятся по
пути `owner/blobId` — и писать, и читать свою папку может только владелец.

**Как это работает:**
- Клиент выгружает картинку с путём `uuid-пользователя/blobId.png`
- Политика `insert` проверяет, что первая часть пути совпадает с `auth.uid()` — никто не может писать в чужую папку
- Политика `select` сужена до собственной папки владельца. Приложение читает картинки
  через `storage.download()` (`src/features/cloud/model/images.ts`), а этот вызов идёт по
  API с проверкой правил — значит, чужую папку им не прочитать и, главное, не перечислить

**Почему не общее правило `using (bucket_id = 'images')`.** Оно разрешало не только
скачивание по точному пути, но и `list()` — перечисление всей папки владельца. А uuid
владельца доставался анонимно: публичная доска отдавала строку целиком (`select('*')`),
вместе с колонкой `owner`. Довод «путь неугадываем» на перечислении не работает —
угадывать не нужно. Теперь публичная доска отдаёт только `name` и `document`
(`src/features/cloud/model/share.ts`), а перечисление закрыто правилом.

**Что при этом остаётся доступно постороннему.** Bucket публичный, поэтому файл
скачивается по точному адресу `<project>.supabase.co/storage/v1/object/public/images/<owner>/<blobId>`
без входа — эта дверь нужна публичным доскам и она же ограничение: защита файла
сводится к неугадываемому `blobId`. Кому нужна настоящая приватность картинок — bucket
делается непубличным (`public = false`), и тогда чтение идёт подписанными ссылками;
у нас этого нет, потому что подписанные ссылки живут ограниченное время и их надо
перевыпускать.

## Переменные GitHub Pages

Workflow сборки уже читает две публичные переменные из GitHub Actions secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Добавьте их в **GitHub → Settings → Secrets and variables → Actions**. Это
публичная конфигурация браузерного клиента: префикс `VITE_` означает, что значения
будут встроены в JavaScript-сборку. Безопасность данных обеспечивает RLS, а не
секретность publishable/anon key.

Серверные переменные Edge Function и `APP_URL` находятся в Supabase и не
передаются в workflow GitHub Pages.

## Пинг проекта для бесплатного плана

Бесплатный проект Supabase приостанавливается после недели без единого запроса.
Сам он из паузы **не выходит**: восстановление — ручное, кнопкой в панели управления
(Dashboard → проект → Restore), и занимает несколько минут. Поэтому ежедневный пинг
нужен не для того, чтобы «разбудить» уснувший проект, а чтобы до паузы не доводить:

1. Создайте файл `.github/workflows/keep-awake.yml`:

```yaml
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

2. Добавьте secrets в GitHub:
   - Settings → Secrets and variables → Actions
   - `SUPABASE_URL` = ваш Project URL
   - `SUPABASE_ANON_KEY` = ваш Anon Key

Это отправляет HTTP-запрос к Supabase каждый день в 06:00 UTC, и неделя без
активности не набирается. Если проект всё-таки успел приостановиться — пинг его
не поднимет, нужно нажать Restore в панели управления.
