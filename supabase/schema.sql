-- Полная схема для нового проекта. Для существующего проекта применяйте migration через Supabase CLI.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.projects (
  id text primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  thumbnail text,
  document jsonb not null,
  is_public boolean not null default false
);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_role') then
    create type public.project_role as enum ('editor', 'viewer');
  end if;
end
$$;

alter table public.projects
  add column if not exists revision bigint not null default 0,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create table if not exists public.project_members (
  project_id text not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.project_role not null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  role public.project_role not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, email)
);

create or replace function private.is_project_owner(
  p_project_id text,
  p_actor uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id and p.owner = p_actor
  );
$$;

create or replace function private.project_role_for(
  p_project_id text,
  p_actor uuid default auth.uid()
)
returns public.project_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.project_members m
  where m.project_id = p_project_id and m.user_id = p_actor;
$$;

create or replace function private.can_view_project(
  p_project_id text,
  p_actor uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (p.is_public or p.owner = p_actor)
  ) or exists (
    select 1
    from public.project_members m
    where m.project_id = p_project_id and m.user_id = p_actor
  );
$$;

create or replace function private.can_edit_project(
  p_project_id text,
  p_actor uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_project_owner(p_project_id, p_actor)
    or private.project_role_for(p_project_id, p_actor) = 'editor'::public.project_role;
$$;

create or replace function private.reject_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.projects p
    where p.id = new.project_id and p.owner = new.user_id
  ) then
    raise exception 'project owner cannot be a member' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_owner_membership on public.project_members;
create trigger reject_owner_membership
before insert or update on public.project_members
for each row execute function private.reject_owner_membership();

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;

drop policy if exists "владелец видит своё, остальные — только публичное" on public.projects;
drop policy if exists "писать может только владелец" on public.projects;
drop policy if exists project_select on public.projects;
drop policy if exists project_insert on public.projects;
drop policy if exists project_delete on public.projects;

create policy project_select on public.projects
for select to anon, authenticated
using (private.can_view_project(id));

create policy project_insert on public.projects
for insert to authenticated
with check (owner = auth.uid());

create policy project_delete on public.projects
for delete to authenticated
using (owner = auth.uid());

drop policy if exists member_select on public.project_members;
drop policy if exists member_insert on public.project_members;
drop policy if exists member_update on public.project_members;
drop policy if exists member_delete on public.project_members;

create policy member_select on public.project_members
for select to authenticated
using (user_id = auth.uid() or private.is_project_owner(project_id));

create policy member_insert on public.project_members
for insert to authenticated
with check (private.is_project_owner(project_id));

create policy member_update on public.project_members
for update to authenticated
using (private.is_project_owner(project_id))
with check (private.is_project_owner(project_id));

create policy member_delete on public.project_members
for delete to authenticated
using (private.is_project_owner(project_id));

drop policy if exists invite_select on public.project_invites;
create policy invite_select on public.project_invites
for select to authenticated
using (private.is_project_owner(project_id));

revoke all on public.projects from anon, authenticated;
grant select on public.projects to anon, authenticated;
grant insert, delete on public.projects to authenticated;
grant all on public.projects to service_role;

revoke all on public.project_members from anon, authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant all on public.project_members to service_role;

revoke all on public.project_invites from anon, authenticated;
grant select on public.project_invites to authenticated;
grant all on public.project_invites to service_role;

grant usage on schema private to anon, authenticated, service_role;
revoke all on all functions in schema private from public;
grant execute on function private.is_project_owner(text, uuid) to anon, authenticated, service_role;
grant execute on function private.project_role_for(text, uuid) to authenticated, service_role;
grant execute on function private.can_view_project(text, uuid) to anon, authenticated, service_role;
grant execute on function private.can_edit_project(text, uuid) to authenticated, service_role;

create or replace function public.save_project(
  p_project_id text,
  p_name text,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_thumbnail text,
  p_document jsonb
)
returns table(revision bigint, updated_at timestamptz, updated_by uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.projects p where p.id = p_project_id) then
    insert into public.projects (
      id, owner, name, created_at, updated_at, thumbnail, document,
      is_public, revision, updated_by
    ) values (
      p_project_id, v_actor, p_name, p_created_at, p_updated_at, p_thumbnail,
      p_document, false, 1, v_actor
    );
  elsif private.can_edit_project(p_project_id, v_actor) then
    update public.projects p
    set name = p_name,
        updated_at = p_updated_at,
        thumbnail = p_thumbnail,
        document = p_document,
        revision = p.revision + 1,
        updated_by = v_actor
    where p.id = p_project_id;
  else
    raise exception 'project update denied' using errcode = '42501';
  end if;

  return query
  select p.revision, p.updated_at, p.updated_by
  from public.projects p
  where p.id = p_project_id;
end;
$$;

create or replace function public.set_project_public(
  p_project_id text,
  p_is_public boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_project_owner(p_project_id, auth.uid()) then
    raise exception 'project access management denied' using errcode = '42501';
  end if;

  update public.projects p
  set is_public = p_is_public
  where p.id = p_project_id;
  return found;
end;
$$;

create or replace function public.accept_my_project_invites()
returns table(project_id text, role public.project_role)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_invite record;
begin
  select lower(trim(u.email)) into v_email
  from auth.users u
  where u.id = v_actor and u.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'confirmed email required' using errcode = '42501';
  end if;

  for v_invite in
    select i.project_id, i.role
    from public.project_invites i
    join public.projects p on p.id = i.project_id
    where i.email = v_email and p.owner <> v_actor
    order by i.created_at
  loop
    insert into public.project_members (project_id, user_id, role)
    values (v_invite.project_id, v_actor, v_invite.role)
    on conflict on constraint project_members_pkey
    do update set role = excluded.role;

    delete from public.project_invites i
    where i.project_id = v_invite.project_id and i.email = v_email;

    return query select v_invite.project_id::text, v_invite.role::public.project_role;
  end loop;
end;
$$;

create or replace function public.list_project_members(p_project_id text)
returns table(user_id uuid, email text, role public.project_role, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_project_owner(p_project_id, auth.uid()) then
    raise exception 'project access management denied' using errcode = '42501';
  end if;

  return query
  select m.user_id, u.email::text, m.role, m.created_at
  from public.project_members m
  join auth.users u on u.id = m.user_id
  where m.project_id = p_project_id
  order by lower(u.email);
end;
$$;

create or replace function public.lookup_auth_user(p_email text)
returns table(user_id uuid, confirmed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email_confirmed_at is not null
  from auth.users u
  where lower(trim(u.email)) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.save_project(text, text, timestamptz, timestamptz, text, jsonb) from public, anon;
revoke all on function public.set_project_public(text, boolean) from public, anon;
revoke all on function public.accept_my_project_invites() from public, anon;
revoke all on function public.list_project_members(text) from public, anon;
revoke all on function public.lookup_auth_user(text) from public, anon, authenticated;

grant execute on function public.save_project(text, text, timestamptz, timestamptz, text, jsonb) to authenticated;
grant execute on function public.set_project_public(text, boolean) to authenticated;
grant execute on function public.accept_my_project_invites() to authenticated;
grant execute on function public.list_project_members(text) to authenticated;
grant execute on function public.lookup_auth_user(text) to service_role;

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "владелец пишет в свою папку" on storage.objects;
drop policy if exists "владелец читает свою папку" on storage.objects;
drop policy if exists project_images_select on storage.objects;
drop policy if exists project_images_insert on storage.objects;
drop policy if exists project_images_update on storage.objects;
drop policy if exists project_images_delete on storage.objects;

create policy project_images_select on storage.objects
for select to authenticated
using (
  bucket_id = 'images'
  and (
    private.can_view_project((storage.foldername(name))[1])
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

create policy project_images_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'images'
  and (
    private.can_edit_project((storage.foldername(name))[1])
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

create policy project_images_update on storage.objects
for update to authenticated
using (bucket_id = 'images' and private.can_edit_project((storage.foldername(name))[1]))
with check (bucket_id = 'images' and private.can_edit_project((storage.foldername(name))[1]));

create policy project_images_delete on storage.objects
for delete to authenticated
using (bucket_id = 'images' and private.can_edit_project((storage.foldername(name))[1]));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
end
$$;

drop policy if exists project_access_broadcast on realtime.messages;
create policy project_access_broadcast on realtime.messages
for select to authenticated
using (
  extension = 'broadcast'
  and realtime.topic() like ('project-access:%:' || auth.uid()::text)
);

drop policy if exists project_presence_select on realtime.messages;
create policy project_presence_select on realtime.messages
for select to authenticated
using (
  extension = 'presence'
  and realtime.topic() like 'project-presence:%'
  and (
    private.is_project_owner(
      substring(realtime.topic() from char_length('project-presence:') + 1),
      (select auth.uid())
    )
    or private.project_role_for(
      substring(realtime.topic() from char_length('project-presence:') + 1),
      (select auth.uid())
    ) is not null
  )
);

drop policy if exists project_presence_insert on realtime.messages;
create policy project_presence_insert on realtime.messages
for insert to authenticated
with check (
  extension = 'presence'
  and realtime.topic() like 'project-presence:%'
  and (
    private.is_project_owner(
      substring(realtime.topic() from char_length('project-presence:') + 1),
      (select auth.uid())
    )
    or private.project_role_for(
      substring(realtime.topic() from char_length('project-presence:') + 1),
      (select auth.uid())
    ) is not null
  )
);

create or replace function private.broadcast_project_access_revoked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('projectId', old.project_id),
    'access-revoked',
    'project-access:' || old.project_id || ':' || old.user_id,
    true
  );
  return old;
end;
$$;

revoke all on function private.broadcast_project_access_revoked() from public, anon, authenticated;

drop trigger if exists broadcast_project_access_revoked on public.project_members;
create trigger broadcast_project_access_revoked
before delete on public.project_members
for each row execute function private.broadcast_project_access_revoked();
