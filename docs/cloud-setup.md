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

## Таблицы и правила доступа

Создайте таблицу в SQL Editor проекта Supabase. Доска — это одна строка, документ целиком
хранится в колонке `document` (JSON), `thumbnail` содержит превью для списка проектов.

```sql
create table public.projects (
  id          text primary key,
  owner       uuid not null references auth.users on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null,
  thumbnail   text,
  document    jsonb not null,
  is_public   boolean not null default false
);

alter table public.projects enable row level security;

create policy "владелец видит своё, остальные — только публичное"
  on public.projects for select
  using (owner = auth.uid() or is_public);

create policy "писать может только владелец"
  on public.projects for all
  using (owner = auth.uid()) with check (owner = auth.uid());
```

**Колонки:**
- `id` — идентификатор доски, ставится клиентом (nanoid)
- `owner` — UUID пользователя, владельца доски
- `name` — имя доски (отображается в списке)
- `created_at` / `updated_at` — время создания и последнего обновления
- `thumbnail` — превью доски для сетки в списке (PNG в base64 или ссылка)
- `document` — весь документ целиком (JSON из `Project` клиента)
- `is_public` — флаг публичной доски (читаемой по ссылке)

## Хранилище изображений

Создайте bucket `images` и настройте доступ. Картинки хранятся по пути `owner/blobId` —
писать в свою папку может только владелец, на чтение bucket открыт всем (для публичных досок).

```sql
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

create policy "владелец пишет в свою папку"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "картинки читаются по ссылке"
  on storage.objects for select
  using (bucket_id = 'images');
```

**Как это работает:**
- Клиент выгружает картинку с путём `uuid-пользователя/blobId.png`
- Политика `insert` проверяет, что первая часть пути совпадает с `auth.uid()` — никто не может писать в чужую папку
- Политика `select` позволяет читать любые картинки из bucket (безопасно, потому что путь неугадываем)

## Развёртывание на хостинге

При развёртывании на Vercel, Netlify или другом хостинге добавьте переменные окружения
в настройки проекта:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Убедитесь, что это **публичные переменные** (префикс `VITE_`), они будут встроены в клиентский код.

## Пинг проекта для бесплатного плана

Supabase бесплатные проекты засыпают после неактивности. Чтобы этого избежать, добавьте
GitHub Action для ежедневного пинга:

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

Это отправит HTTP запрос к Supabase каждый день в 06:00 UTC и "разбудит" проект.
