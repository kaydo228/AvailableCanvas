begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outside@example.com', '', now(), '{}', '{}', now(), now());

insert into public.projects (
  id, owner, name, created_at, updated_at, document, is_public
)
values (
  'shared',
  '00000000-0000-0000-0000-000000000001',
  'Shared', now(), now(),
  '{"projectId":"shared","schemaVersion":1,"nodes":{},"order":[],"viewport":{"x":0,"y":0,"zoom":1},"background":{"color":"#fff","grid":"dots"}}',
  false
), (
  'public-board',
  '00000000-0000-0000-0000-000000000001',
  'Public', now(), now(),
  '{"projectId":"public-board","schemaVersion":1,"nodes":{},"order":[],"viewport":{"x":0,"y":0,"zoom":1},"background":{"color":"#fff","grid":"dots"}}',
  true
);

insert into public.project_members (project_id, user_id, role)
values
  ('shared', '00000000-0000-0000-0000-000000000002', 'editor'),
  ('shared', '00000000-0000-0000-0000-000000000003', 'viewer');

select ok(private.can_view_project('shared', '00000000-0000-0000-0000-000000000001'), 'owner reads');
select ok(private.can_view_project('shared', '00000000-0000-0000-0000-000000000002'), 'editor reads');
select ok(private.can_view_project('shared', '00000000-0000-0000-0000-000000000003'), 'viewer reads');
select isnt(private.can_view_project('shared', '00000000-0000-0000-0000-000000000004'), true, 'outsider cannot read private project');
select ok(private.can_view_project('public-board', null), 'anonymous reads public project');
select ok(private.can_edit_project('shared', '00000000-0000-0000-0000-000000000001'), 'owner edits');
select ok(private.can_edit_project('shared', '00000000-0000-0000-0000-000000000002'), 'editor edits');
select isnt(private.can_edit_project('shared', '00000000-0000-0000-0000-000000000003'), true, 'viewer cannot edit');
select isnt(private.can_edit_project('shared', '00000000-0000-0000-0000-000000000004'), true, 'outsider cannot edit');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ select * from public.save_project('shared', 'Edited', now(), now(), null, '{"projectId":"shared","schemaVersion":1,"nodes":{},"order":[],"viewport":{"x":0,"y":0,"zoom":1},"background":{"color":"#fff","grid":"dots"}}') $$,
  'editor saves content'
);
select results_eq($$ select revision from public.projects where id = 'shared' $$, array[1::bigint], 'save increments revision once');
select results_eq($$ select owner from public.projects where id = 'shared' $$, array['00000000-0000-0000-0000-000000000001'::uuid], 'save preserves owner');
select results_eq($$ select is_public from public.projects where id = 'shared' $$, array[false], 'save preserves publicity');
select throws_ok($$ select public.set_project_public('shared', true) $$, '42501', null, 'editor cannot change publicity');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.save_project('shared', 'Denied', now(), now(), null, '{}'::jsonb) $$,
  '42501', null, 'viewer save is rejected'
);
select results_eq($$ select id from public.projects order by id $$, array['public-board'::text, 'shared'::text], 'viewer sees member and public projects');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq($$ select id from public.projects order by id $$, array['public-board'::text], 'outsider sees only public projects');
select results_eq(
  $$ with changed as (
       update public.project_members
       set role = 'viewer'
       where project_id = 'shared'
         and user_id = '00000000-0000-0000-0000-000000000002'
       returning 1
     ) select count(*)::bigint from changed $$,
  array[0::bigint],
  'outsider cannot manage members'
);

reset role;
insert into public.project_invites (project_id, email, role, invited_by)
values ('shared', 'outside@example.com', 'viewer', '00000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select lives_ok($$ select * from public.accept_my_project_invites() $$, 'authenticated user accepts matching invite');
select results_eq(
  $$ select role::text from public.project_members where project_id = 'shared' and user_id = '00000000-0000-0000-0000-000000000004' $$,
  array['viewer'::text],
  'acceptance creates membership'
);
select is_empty($$ select 1 from public.project_invites where email = 'outside@example.com' $$, 'acceptance removes invite');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.set_project_public('shared', true) $$, 'owner changes publicity');
select lives_ok(
  $$ update public.project_members set role = 'viewer' where project_id = 'shared' and user_id = '00000000-0000-0000-0000-000000000002' $$,
  'owner changes member role'
);
select results_eq(
  $$ select email from public.list_project_members('shared') order by email $$,
  array['editor@example.com'::text, 'outside@example.com'::text, 'viewer@example.com'::text],
  'owner lists member emails'
);
select ok(has_function_privilege('service_role', 'public.lookup_auth_user(text)', 'EXECUTE'), 'service role can look up auth users');
select isnt(has_function_privilege('authenticated', 'public.lookup_auth_user(text)', 'EXECUTE'), true, 'browser cannot look up auth users');

select * from finish();
rollback;
