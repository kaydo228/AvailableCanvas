-- Выполнить один раз в Supabase Dashboard → SQL Editor → New query.

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

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

create policy "владелец пишет в свою папку"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "владелец читает свою папку"
  on storage.objects for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
