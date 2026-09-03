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

Создайте таблицы в SQL Editor проекта Supabase:

```sql
-- Документы пользователя
create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Разрешить чтение и запись только своих документов
alter table documents enable row level security;

create policy "Users can read own documents"
  on documents for select
  using (auth.uid() = user_id);

create policy "Users can insert own documents"
  on documents for insert
  with check (auth.uid() = user_id);

create policy "Users can update own documents"
  on documents for update
  using (auth.uid() = user_id);

create policy "Users can delete own documents"
  on documents for delete
  using (auth.uid() = user_id);

-- Индекс для быстрого поиска документов
create index documents_user_id_idx on documents(user_id);
```

## Хранилище изображений

1. Создайте bucket `images` в Storage:
   - **Name**: `images`
   - **Public bucket**: включите (чтобы изображения были доступны по ссылке)

2. В Storage → Policies включите публичное чтение:

```sql
create policy "Allow public read access"
  on storage.objects for select
  using (bucket_id = 'images');

create policy "Allow authenticated uploads"
  on storage.objects for insert
  with check (
    bucket_id = 'images'
    and auth.role() = 'authenticated'
  );
```

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
