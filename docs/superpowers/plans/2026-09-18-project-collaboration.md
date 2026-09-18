# Project Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add invitation-based sharing with owner/editor/viewer roles, secure Supabase persistence, realtime whole-document updates, immediate access revocation, and a quiet save indicator.

**Architecture:** Keep the offline-first IndexedDB model and one JSON document per project. Postgres RLS and narrow RPCs are the security boundary; an Edge Function owns email lookup and invitation delivery; the browser stores resolved access in `SyncState` and receives project changes through Postgres Changes. A user-scoped private broadcast carries only access revocation because a revoked member can no longer receive project rows through RLS.

**Tech Stack:** React 19, TypeScript 5.7, Zustand, IndexedDB/idb, Supabase Auth/Postgres/Storage/Realtime/Edge Functions, Vitest, Playwright, pgTAP, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-18-project-collaboration-design.md`

## Global Constraints

- Invite any normalized email; an unregistered user receives a Supabase Auth invitation.
- Roles are exactly `owner`, `editor`, and `viewer`; the owner is never duplicated in `project_members`.
- Owner manages access/public sharing; editor saves content; viewer and public visitor are read-only.
- RLS/RPC checks are authoritative; hiding controls is not security.
- Save and transmit the complete document; the last committed save wins and atomically increments `revision`.
- Preserve each user's local viewport when applying another user's document update.
- Keep service/secret keys server-side. The frontend uses only `VITE_SUPABASE_URL` and the publishable key.
- Keep `saving` internally but never render a spinner or “Сохранение…”. Keep `error`, `conflict`, `deleted`, and `local-only` visible.
- Do not add CRDT, Presence, cursors, comments, chat, version history, ownership transfer, email for an already registered member, or public edit links.
- Add no runtime dependency. Keep the already installed `supabase@^2.117.0` as a dev dependency.

---

## File Structure

### Supabase

- Create `supabase/config.toml` — local CLI and Edge Function JWT configuration.
- Create `supabase/migrations/20260918120000_project_collaboration.sql` — tables, helpers, RLS, RPCs, Storage, Realtime, revocation trigger.
- Create `supabase/tests/database/project_collaboration.test.sql` — pgTAP authorization matrix.
- Create `supabase/functions/invite-project-member/{logic.ts,logic.test.ts,index.ts}` — tested invitation rules and HTTP adapter.
- Modify `supabase/schema.sql` — clean-project schema matching the migration.

### Client model

- Create `src/features/cloud/model/access.ts`, `access.test.ts` — access types and capability predicates.
- Create `src/features/cloud/model/members.ts`, `members.test.ts` — members, pending invites, acceptance, and Edge Function client.
- Create `src/features/cloud/model/realtime.ts`, `realtime.test.ts` — remote application, reconnect pull, and revocation.
- Modify cloud `merge`, `pull`, `push`, `images`, `share`, `session`, and sync hooks with their tests — access-aware listing and atomic saves.
- Modify `src/features/persistence/{syncStore.ts,autosave.ts,projectsRepo.ts,SaveIndicator.tsx}` — local access/revision, remote-load suppression, revoke cleanup, quiet status.

### UI, routing, and canvas

- Create `src/app/InviteScreen.tsx`, `pagesRedirect.ts`, `pagesRedirect.test.ts` — invite completion and GitHub Pages deep links.
- Create `src/features/cloud/ui/{AccessDialog.tsx,AccessDialog.test.tsx,AccessBadge.tsx}` — owner management and role labels.
- Modify `router.tsx`, `main.tsx`, `CanvasScreen.tsx`, `PublicBoardScreen.tsx`, `ShareButton.tsx` — access-aware composition.
- Modify `CanvasStage`, node renderers/contracts, transformer, editing overlay, tools, connector/image hooks, shortcuts — enforce read-only at every mutation boundary.

### Verification and operations

- Create `e2e/cloud-collaboration.spec.ts`; modify cloud E2E stubs/types — full browser contract.
- Modify `.gitignore`, `package.json`, `package-lock.json`, `docs/cloud-setup.md`, `README.md` — CLI state, setup, and limitations.

---

### Task 1: Database authorization and atomic RPC foundation

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/20260918120000_project_collaboration.sql`
- Create: `supabase/tests/database/project_collaboration.test.sql`
- Modify: `supabase/schema.sql`
- Modify: `.gitignore`, `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: current `public.projects`, `storage.objects`, authenticated JWT claims.
- Produces: `project_role`, `project_members`, `project_invites`; RPCs `save_project`, `set_project_public`, `accept_my_project_invites`, `list_project_members`, `lookup_auth_user`; private access helpers.

- [ ] **Step 1: Initialize Supabase and ignore generated state**

```bash
npx supabase init
```

Set `verify_jwt = true` for `invite-project-member` in `supabase/config.toml`. Add `supabase/.temp/` to `.gitignore`. Keep the existing Supabase dev dependency/lockfile changes; never edit or stage `sessions/alfis/*`.

- [ ] **Step 2: Write the failing pgTAP matrix**

Use fixed UUIDs for owner/editor/viewer/outsider and `set_config('request.jwt.claims', json_build_object('sub', actor)::text, true)`. Start with:

```sql
select plan(24);
select ok(private.can_view_project('shared', :'owner'), 'owner reads');
select ok(private.can_view_project('shared', :'editor'), 'editor reads');
select ok(private.can_view_project('shared', :'viewer'), 'viewer reads');
select isnt(private.can_view_project('shared', :'outsider'), true, 'outsider cannot read');
select ok(private.can_edit_project('shared', :'editor'), 'editor edits');
select isnt(private.can_edit_project('shared', :'viewer'), true, 'viewer cannot edit');
select throws_ok(
  $$ select * from public.save_project('shared','x',now(),now(),null,'{}'::jsonb) $$,
  '42501', null, 'viewer save is rejected'
);
select * from finish();
```

The remaining named assertions are: owner-only member insert/update/delete; owner-only invite listing; service-role-only auth lookup; anonymous public select; outsider private select denial; editor cannot change `is_public`; owner can call `set_project_public`; `save_project` preserves owner/publicity and increments revision once; acceptance upserts membership and deletes the normalized invite; Storage owner/editor/viewer/outsider permissions on `projectId/blobId`; membership deletion emits the user-scoped revocation topic.

- [ ] **Step 3: Prove the test is red**

```bash
npx supabase start
npx supabase test db
```

Expected: FAIL because collaboration types/functions do not exist.

- [ ] **Step 4: Implement schema and narrow privileges**

Use these core shapes:

```sql
create schema if not exists private;
create type public.project_role as enum ('editor', 'viewer');

create table public.project_members (
  project_id text not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.project_role not null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  role public.project_role not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, email)
);

alter table public.projects
  add column revision bigint not null default 0,
  add column updated_by uuid references auth.users(id) on delete set null;
```

Implement `private.is_project_owner`, `project_role_for`, `can_view_project`, and `can_edit_project` as `security definer set search_path = ''`. `can_view_project` permits owner/member/public; `can_edit_project` permits owner/editor.

Implement these signatures and revoke default execution before grants:

```sql
public.save_project(
  p_project_id text, p_name text, p_created_at timestamptz,
  p_updated_at timestamptz, p_thumbnail text, p_document jsonb
) returns table(revision bigint, updated_at timestamptz, updated_by uuid)

public.set_project_public(p_project_id text, p_is_public boolean) returns boolean
public.accept_my_project_invites() returns table(project_id text, role public.project_role)
public.list_project_members(p_project_id text)
  returns table(user_id uuid, email text, role public.project_role, created_at timestamptz)
public.lookup_auth_user(p_email text)
  returns table(user_id uuid, confirmed boolean)
```

`save_project` inserts a missing project with `owner=auth.uid()`, or updates only after `can_edit_project`; it never changes owner/publicity, sets `updated_by=auth.uid()`, increments `revision`, and raises `42501` on denial. Grant `lookup_auth_user` only to `service_role`; grant other RPCs only to `authenticated`. Project direct insert/delete is owner-only; all content update goes through `save_project`. Membership selection is self-or-owner and mutations owner-only; invites are owner-visible and server-written.

Replace Storage rules so `(storage.foldername(name))[1]` is the project id: select through `can_view_project`, write/delete through `can_edit_project`. Add `projects` to `supabase_realtime` idempotently. Add a `before delete` member trigger whose body is:

```sql
perform realtime.send(
  jsonb_build_object('projectId', old.project_id),
  'access-revoked',
  'project-access:' || old.project_id || ':' || old.user_id,
  true
);
```

Add a `realtime.messages` select policy permitting only broadcast topics ending in `':'||auth.uid()`.

- [ ] **Step 5: Mirror and verify the schema**

Rewrite `supabase/schema.sql` in clean creation order, then run:

```bash
npx supabase db reset
npx supabase test db
npx supabase db diff --local
```

Expected: pgTAP PASS and no schema drift.

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json package-lock.json supabase/config.toml supabase/schema.sql supabase/migrations/20260918120000_project_collaboration.sql supabase/tests/database/project_collaboration.test.sql
git commit -m "Add collaboration database permissions"
```

### Task 2: Access model and RLS-visible project sync

**Files:**
- Create: `src/features/cloud/model/access.ts`, `access.test.ts`
- Modify: `src/features/persistence/syncStore.ts`
- Modify: `src/features/cloud/model/merge.ts`, `merge.test.ts`, `pull.ts`, `pull.test.ts`

**Interfaces:**
- Consumes: RLS-visible projects and own membership rows.
- Produces: `ProjectAccess`, `MemberRole`, capability predicates, extended `SyncState`, access-aware `RemoteBoard`, `remoteList(actorId)`, `pullProject(remote)`.

- [ ] **Step 1: Write failing role/list/merge tests**

```ts
expect(canEdit('owner')).toBe(true);
expect(canEdit('editor')).toBe(true);
expect(canEdit('viewer')).toBe(false);
expect(canManageAccess('owner')).toBe(true);
expect(canManageAccess('editor')).toBe(false);

expect(decide(
  [{ projectId: 'shared', updatedAt: 10, state: {
    projectId: 'shared', owner: 'u2', access: 'viewer', remoteRevision: 2, dirty: false,
  }}], [], 'u1',
)).toEqual([{ kind: 'delete-local', projectId: 'shared' }]);
```

In `pull.test.ts`, return one owned and one shared project; return `{project_id:'shared',role:'editor'}` from `project_members`. Assert both appear, with no `.eq('owner', actorId)` project filter.

- [ ] **Step 2: Prove tests are red**

```bash
npx vitest run src/features/cloud/model/access.test.ts src/features/cloud/model/merge.test.ts src/features/cloud/model/pull.test.ts
```

Expected: FAIL on missing access contracts.

- [ ] **Step 3: Implement exact contracts**

```ts
export type ProjectAccess = 'owner' | 'editor' | 'viewer';
export type MemberRole = Exclude<ProjectAccess, 'owner'>;
export const canEdit = (access?: ProjectAccess): boolean =>
  access === 'owner' || access === 'editor';
export const canManageAccess = (access?: ProjectAccess): boolean => access === 'owner';
```

Add `access?: ProjectAccess` and `remoteRevision?: number` to `SyncState`. Define:

```ts
export interface RemoteBoard {
  id: Id;
  owner: string;
  updatedAt: number;
  revision: number;
  access: ProjectAccess;
}
```

`remoteList(actorId)` requests projects and the actor's membership rows together, maps owner first and membership second, rejects an accessible row with neither, and returns `null` if a required request fails. `pullProject(remote)` repairs/overwrites then stores owner, access, revision, remote time, `dirty:false`, and publicity.

Update `decide`: viewer never pushes; a previously synced non-owner project absent from a successful remote list becomes `delete-local`, even if dirty; unowned local adoption remains unchanged.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run src/features/cloud/model/access.test.ts src/features/cloud/model/merge.test.ts src/features/cloud/model/pull.test.ts
npm run typecheck
git add src/features/cloud/model/access.ts src/features/cloud/model/access.test.ts src/features/cloud/model/merge.ts src/features/cloud/model/merge.test.ts src/features/cloud/model/pull.ts src/features/cloud/model/pull.test.ts src/features/persistence/syncStore.ts
git commit -m "Sync projects by collaboration access"
```

### Task 3: Atomic saves, project images, and public access

**Files:**
- Modify: `src/features/cloud/model/push.ts`, `push.test.ts`
- Modify: `src/features/cloud/model/images.ts`, `images.test.ts`
- Modify: `src/features/cloud/model/share.ts`, `share.test.ts`
- Modify: `src/features/cloud/model/useCloudSync.ts`, `useCloudSyncOnLogin.ts`

**Interfaces:**
- Consumes: `canEdit`, `save_project`, `set_project_public`, extended sync state.
- Produces: expanded `ProjectRow`, `pushProject(projectId, actorId)`, project-scoped images, `connectRemoteImages(projectId)`.

- [ ] **Step 1: Write failing RPC/path tests**

```ts
states.readSyncState.mockResolvedValue({
  projectId: 'p1', owner: 'owner-1', access: 'editor', remoteRevision: 3, dirty: true,
});
rpc.mockResolvedValue({ data: [{ revision: 4, updated_at: new Date(100).toISOString(), updated_by: 'editor-1' }], error: null });
expect(await pushProject('p1', 'editor-1')).toBe(true);
expect(rpc).toHaveBeenCalledWith('save_project', expect.objectContaining({ p_project_id: 'p1' }));
expect(states.writeSyncState).toHaveBeenCalledWith(expect.objectContaining({ access: 'editor', remoteRevision: 4, dirty: false }));
```

Add cases: viewer returns false without upload/RPC; new local project becomes owner; RPC failure retains prior revision; upload path is `p1/blob-1`; `setPublic` calls `set_project_public`.

- [ ] **Step 2: Prove tests are red**

```bash
npx vitest run src/features/cloud/model/push.test.ts src/features/cloud/model/images.test.ts src/features/cloud/model/share.test.ts
```

- [ ] **Step 3: Implement atomic saves and project Storage**

Add `revision:number` and `updated_by:string|null` to `ProjectRow`. Reject declined/viewer pushes. Upload to `${projectId}/${blobId}`, then call:

```ts
cloud.rpc('save_project', {
  p_project_id: project.id,
  p_name: project.name,
  p_created_at: new Date(project.createdAt).toISOString(),
  p_updated_at: new Date(project.updatedAt).toISOString(),
  p_thumbnail: project.thumbnail ?? null,
  p_document: document,
});
```

On success persist returned revision and existing access/owner; new local projects use actor as owner and `owner` access. On error preserve prior remote metadata and set dirty. Change `uploadImages(document, projectId)`, `downloadImage(blobId, projectId)`, and `connectRemoteImages(projectId|null)`; remove account-wide image-source setup. Change public toggling to the RPC and accept only `data === true`.

- [ ] **Step 4: Gate cloud sync by access**

Change the public signature to:

```ts
export const useCloudSync: (
  projectId: Id | undefined,
  access: ProjectAccess | undefined,
) => void;
```

Inside its effect, return before registering the save-status subscription when `!projectId`, `!userId`, or `!canEdit(access)`.

Preserve the existing 3000 ms debounce and cleanup flush.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run src/features/cloud/model/push.test.ts src/features/cloud/model/images.test.ts src/features/cloud/model/share.test.ts
npm run typecheck
git add src/features/cloud/model/push.ts src/features/cloud/model/push.test.ts src/features/cloud/model/images.ts src/features/cloud/model/images.test.ts src/features/cloud/model/share.ts src/features/cloud/model/share.test.ts src/features/cloud/model/useCloudSync.ts src/features/cloud/model/useCloudSyncOnLogin.ts
git commit -m "Save shared projects atomically"
```

### Task 4: Invitation Edge Function

**Files:**
- Create: `supabase/functions/invite-project-member/logic.ts`, `logic.test.ts`, `index.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `{projectId,email,role}`, caller Bearer token, `APP_URL`, automatic Supabase server env, `lookup_auth_user`.
- Produces: `200 {status:'member-added'|'invite-sent'}` or safe `400/401/403/503 {error:string}`.

- [ ] **Step 1: Write failing dependency-injected tests**

```ts
deps.lookupUser.mockResolvedValue({ userId: 'member-1', confirmed: true });
await expect(inviteProjectMember(
  { projectId: 'p1', email: ' USER@EXAMPLE.COM ', role: 'editor' }, deps,
)).resolves.toEqual({ status: 'member-added' });
expect(deps.upsertMember).toHaveBeenCalledWith('p1', 'member-1', 'editor');

deps.lookupUser.mockResolvedValue(null);
await expect(inviteProjectMember(
  { projectId: 'p1', email: 'new@example.com', role: 'viewer' }, deps,
)).resolves.toEqual({ status: 'invite-sent' });
```

Also assert: non-owner forbidden; owner email rejected; invalid email/role rejected; repeat updates member role; unconfirmed account remains pending and gets resend; mail failure deletes the newly created pending invite.

- [ ] **Step 2: Include tests and prove red**

Add `'supabase/functions/**/*.test.ts'` to Vitest `include`, then run:

```bash
npx vitest run supabase/functions/invite-project-member/logic.test.ts
```

- [ ] **Step 3: Implement pure rules**

```ts
export type InviteRole = 'editor' | 'viewer';
export interface InviteInput { projectId: string; email: string; role: InviteRole }
export type InviteOutcome = { status: 'member-added' | 'invite-sent' };
export async function inviteProjectMember(
  input: InviteInput,
  deps: InviteDependencies,
): Promise<InviteOutcome>;
```

Normalize with `trim().toLowerCase()`, validate from literal sets, check ownership before lookup, reject caller email, upsert a confirmed account to members, or upsert pending invite then send/re-send. Throw typed `InviteError(status,message)` with Russian safe copy.

- [ ] **Step 4: Implement Deno adapter**

Use pinned `npm:@supabase/supabase-js@2.114.0`. Handle OPTIONS; reject non-POST; caller client uses request Authorization and verifies `auth.getUser()`/ownership; admin client uses server secret for lookup/writes/invite. Build redirect only with `new URL('invite', APP_URL)`. Unconfirmed existing accounts use `auth.resend({type:'signup',email,options:{emailRedirectTo:redirectTo}})`. Never accept request redirect or return raw database errors.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run supabase/functions/invite-project-member/logic.test.ts
npm run lint
git add vitest.config.ts supabase/functions/invite-project-member
git commit -m "Add project invitation function"
```

### Task 5: Invite acceptance and GitHub Pages deep links

**Files:**
- Create: `src/features/cloud/model/members.ts`, `members.test.ts`
- Create: `src/app/InviteScreen.tsx`, `pagesRedirect.ts`, `pagesRedirect.test.ts`
- Modify: `src/features/cloud/model/session.ts`, `session.test.ts`, `useCloudSyncOnLogin.ts`, `src/features/cloud/index.ts`
- Modify: `src/app/router.tsx`, `src/main.tsx`

**Interfaces:**
- Consumes: Edge Function, membership RPCs, invite session, `?redirect=` from `public/404.html`.
- Produces: membership client APIs, `setInvitePassword`, `/invite`, `restorePagesRoute`.

- [ ] **Step 1: Write failing client/deep-link tests**

```ts
expect(await inviteMember('p1', 'new@example.com', 'viewer'))
  .toEqual({ ok: true, status: 'invite-sent' });
expect(functions.invoke).toHaveBeenCalledWith('invite-project-member', {
  body: { projectId: 'p1', email: 'new@example.com', role: 'viewer' },
});

expect(restorePagesRoute('https://kaydo228.github.io/AvailableCanvas/?redirect=%2Finvite%3Ftoken%3Dx'))
  .toBe('/AvailableCanvas/invite?token=x');
expect(restorePagesRoute('https://kaydo228.github.io/AvailableCanvas/?redirect=https%3A%2F%2Fevil.test'))
  .toBeNull();
```

Test accepted RPC rows -> ids, no rows -> `[]`, and password errors -> `authErrorText`.

- [ ] **Step 2: Prove tests are red**

```bash
npx vitest run src/features/cloud/model/members.test.ts src/app/pagesRedirect.test.ts src/features/cloud/model/session.test.ts
```

- [ ] **Step 3: Implement membership client contracts**

```ts
export type MemberEntry = { userId: string; email: string; role: MemberRole; createdAt: string };
export type PendingInvite = { id: string; email: string; role: MemberRole; createdAt: string };
export type InviteResult =
  | { ok: true; status: 'member-added' | 'invite-sent' }
  | { ok: false; error: string; network: boolean };
export function inviteMember(projectId: Id, email: string, role: MemberRole): Promise<InviteResult>;
export function acceptMyProjectInvites(): Promise<Id[]>;
export function listProjectAccess(projectId: Id): Promise<{members: MemberEntry[]; invites: PendingInvite[]} | null>;
export function changeMemberRole(projectId: Id, userId: string, role: MemberRole): Promise<boolean>;
export function removeMember(projectId: Id, userId: string): Promise<boolean>;
```

Use `list_project_members` plus owner-visible invites. Mark transport failures for toast duplication; return server validation copy inline.

- [ ] **Step 4: Restore safe Pages routes before Auth initialization**

`restorePagesRoute(url)` accepts only decoded paths starting with one `/`, never `//`, and prefixes `import.meta.env.BASE_URL` once. In `main.tsx`, call it and `history.replaceState` before `initSession()` so Supabase parses the invite hash/query on `/invite`.

- [ ] **Step 5: Add invite screen and normal-login acceptance**

```ts
export const setInvitePassword = async (password: string): Promise<string | null> => {
  const { error } = await getCloud()!.auth.updateUser({ password });
  return error ? authErrorText(error.message) : null;
};
```

The screen waits for session readiness. No user -> “Ссылка недействительна или истекла”. Session -> password form with six-character minimum; success calls acceptance, toasts “Приглашение принято”, navigates to first project or `/`. Add lazy `/invite`. In `useCloudSyncOnLogin`, await acceptance before `localBoards()` and the first sync cycle.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run src/features/cloud/model/members.test.ts src/app/pagesRedirect.test.ts src/features/cloud/model/session.test.ts
npm run build
git add src/features/cloud/model/members.ts src/features/cloud/model/members.test.ts src/app/InviteScreen.tsx src/app/pagesRedirect.ts src/app/pagesRedirect.test.ts src/features/cloud/model/session.ts src/features/cloud/model/session.test.ts src/features/cloud/model/useCloudSyncOnLogin.ts src/features/cloud/index.ts src/app/router.tsx src/main.tsx
git commit -m "Accept project invitations in app"
```

### Task 6: Owner access-management dialog

**Files:**
- Create: `src/features/cloud/ui/AccessDialog.tsx`, `AccessDialog.test.tsx`, `AccessBadge.tsx`
- Modify: `src/features/cloud/ui/ShareButton.tsx`
- Modify: `src/features/cloud/index.ts`
- Modify: `src/app/CanvasScreen.tsx`

**Interfaces:**
- Consumes: capability predicates and membership APIs from Tasks 2 and 5.
- Produces: owner-only sharing dialog, editor “Совместный проект”, viewer “Только просмотр”.

- [ ] **Step 1: Write failing dialog tests**

```tsx
await user.type(screen.getByLabelText('Почта'), 'new@example.com');
await user.selectOptions(screen.getByLabelText('Роль'), 'viewer');
await user.click(screen.getByRole('button', { name: 'Пригласить' }));
expect(inviteMember).toHaveBeenCalledWith('p1', 'new@example.com', 'viewer');
expect(toast.success).toHaveBeenCalledWith('Приглашение отправлено');
```

Add cases for `member-added` -> “Доступ добавлен”; member role change; removal; pending invite rendering; public copy/open/close; validation error leaves form filled without toast; network error remains inline and also toasts; editor/viewer cannot render management controls.

- [ ] **Step 2: Prove the UI test is red**

```bash
npx vitest run src/features/cloud/ui/AccessDialog.test.tsx
```

- [ ] **Step 3: Implement the owner UI**

Change `ShareButton` props to:

```ts
{ projectId: Id; access: ProjectAccess; isPublic: boolean }
```

Return `null` unless access is owner. `AccessDialog` keeps independent busy state for invite/member/public operations; uses exact options “Редактор”/“Только просмотр”; refreshes lists after invite/change/remove; clears email only on success. Render `AccessBadge` in `CanvasScreen`: nothing for owner, “Совместный проект” for editor, “Только просмотр” for viewer.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run src/features/cloud/ui/AccessDialog.test.tsx
npm run typecheck
git add src/features/cloud/ui/AccessDialog.tsx src/features/cloud/ui/AccessDialog.test.tsx src/features/cloud/ui/AccessBadge.tsx src/features/cloud/ui/ShareButton.tsx src/features/cloud/index.ts src/app/CanvasScreen.tsx
git commit -m "Add project access management dialog"
```

### Task 7: Enforced read-only canvas and quiet save status

**Files:**
- Modify: `src/features/canvas/engine/CanvasStage.tsx`
- Modify: `src/features/canvas/nodes/contract.ts`, `NodesLayer.tsx`, every `*View.tsx`, `EditingOverlay.tsx`
- Modify: `src/features/canvas/selection/SelectionTransformer.tsx`
- Modify: `src/features/canvas/tools/useToolController.ts`, `useImageInsert.ts`
- Modify: `src/features/canvas/connectors/useConnectorTool.ts`
- Modify: `src/features/shortcuts/model/useShortcuts.ts`, `useClipboard.ts`
- Modify: `src/features/persistence/autosave.ts`, `SaveIndicator.tsx`
- Modify: `src/app/CanvasScreen.tsx`, `PublicBoardScreen.tsx`
- Test: `e2e/cloud-share.spec.ts`, `e2e/autosave.spec.ts`

**Interfaces:**
- Consumes: `canEdit(access)`.
- Produces: `CanvasStage({readOnly})`, enabled mutation hooks, viewer autosave suppression, hidden saving UI.

- [ ] **Step 1: Add failing read-only and indicator regressions**

In `cloud-share.spec.ts`, record a node position; drag its canvas hit area, double-click, press Delete, paste, and drop a file; assert document JSON is unchanged while pan/zoom may change only viewport. Repeat for a viewer at `/p/:id` in the collaboration stub.

In `autosave.spec.ts`, make a local edit and assert:

```ts
await expect(page.getByText('Сохранение…')).toHaveCount(0);
await expect(page.locator('[data-save-status="saving"]')).toHaveCount(0);
```

Keep existing assertions for local-only, conflict, deleted, and error.

- [ ] **Step 2: Prove scenarios are red**

```bash
npx playwright test e2e/cloud-share.spec.ts e2e/autosave.spec.ts --project=e2e
```

Expected: FAIL because nodes remain draggable and saving renders.

- [ ] **Step 3: Thread read-only through every mutation boundary**

```ts
export interface CanvasStageProps {
  onThumbnail?: (thumbnail: string) => void | Promise<void>;
  readOnly?: boolean;
}

export interface NodeViewProps<T extends Node = Node> {
  node: T;
  selected: boolean;
  onSelect: (id: Id, additive: boolean) => void;
  onStartEditing: (id: Id) => void;
  onDragEnd: (id: Id, x: number, y: number) => void;
  editing: boolean;
  readOnly: boolean;
}
```

When read-only: pass disabled to tool/connector/image hooks; omit drop handlers; pass the flag through `NodesLayer`; shape/sticky/image/draw renderers use `draggable={!readOnly && !node.locked}`, text uses `draggable={!readOnly && !node.locked && !editing}`, and all renderers refuse double-click editing. The transformer renders nothing and detaches nodes; editing overlay renders nothing; group drag callbacks are no-ops. Keep canvas gestures active for pan/zoom.

Use unconditional hook-safe signatures: `useToolController(enabled=true)`, `useConnectorTool(enabled=true)`, `useShortcuts(enabled=true)`, `useAutosave(enabled=true)`. Each effect installs no mutation listener when false; never call hooks conditionally.

In `CanvasScreen`, derive `editable=canEdit(state.access)`, pass `readOnly={!editable}`, hide toolbar/inspector for viewers, gate autosave/cloud sync/shortcuts, retain export. `PublicBoardScreen` always passes `readOnly`.

- [ ] **Step 4: Hide only transient save status**

Remove `Loader2` and use:

```ts
if (status === 'idle' || status === 'saving') return null;
```

Do not remove `saving` from `SaveStatus`; cloud sync still consumes its transition to `saved`.

- [ ] **Step 5: Verify and commit**

```bash
npx playwright test e2e/cloud-share.spec.ts e2e/autosave.spec.ts --project=e2e
npm test
npm run typecheck
git add src/features/canvas src/features/shortcuts src/features/persistence/autosave.ts src/features/persistence/SaveIndicator.tsx src/app/CanvasScreen.tsx src/app/PublicBoardScreen.tsx e2e/cloud-share.spec.ts e2e/autosave.spec.ts
git commit -m "Enforce viewer read only mode"
```

### Task 8: Realtime document updates without save echoes

**Files:**
- Create: `src/features/cloud/model/realtime.ts`, `realtime.test.ts`
- Modify: `src/features/persistence/autosave.ts`, `projectsRepo.ts`
- Modify: `src/app/CanvasScreen.tsx`
- Modify: `src/features/cloud/index.ts`

**Interfaces:**
- Consumes: expanded `ProjectRow`, remote revision, repair, pull, Supabase channels.
- Produces: `applyRemoteProjectRow`, `useProjectRealtime`, `loadRemoteDocument`, revoked-project cleanup.

- [ ] **Step 1: Write failing remote application tests**

```ts
const result = await applyRemoteProjectRow(remoteRow({
  revision: 5,
  updated_by: 'editor-2',
  document: { ...doc, viewport: { x: 900, y: 800, zoom: 0.5 } },
}), {
  userId: 'owner-1',
  currentViewport: { x: 10, y: 20, zoom: 2 },
  remoteRevision: 4,
});
expect(result).toEqual(expect.objectContaining({ applied: true }));
expect(loadRemoteDocument).toHaveBeenCalledWith(expect.objectContaining({
  viewport: { x: 10, y: 20, zoom: 2 },
}));
expect(writeSyncState).toHaveBeenCalledWith(expect.objectContaining({ remoteRevision: 5, dirty: false }));
```

Also test: same/older revision ignored; own `updated_by` ignores document but advances metadata; repaired input used; malformed payload logged/ignored; delete and `access-revoked` revoke once; reconnect pulls; cleanup removes both channels.

- [ ] **Step 2: Prove test is red**

```bash
npx vitest run src/features/cloud/model/realtime.test.ts
```

- [ ] **Step 3: Add one-update autosave suppression**

```ts
export const loadRemoteDocument = (document: BoardDocument): void => {
  ignoredDocument = document;
  useBoardStore.getState().loadDocument(document);
};
```

The autosave subscriber compares object identity, clears `ignoredDocument`, and returns before setting saving. The next ordinary edit must save.

- [ ] **Step 4: Implement event application**

`applyRemoteProjectRow` must validate id/revision/document; ignore old revision; for own writer update metadata only; repair foreign document; replace incoming viewport with current viewport; call `overwriteProject` and `loadRemoteDocument`; persist revision/time/owner/access/publicity with dirty false; return `{applied,name?}` for title updates.

- [ ] **Step 5: Implement subscriptions and revocation**

```ts
export function useProjectRealtime(options: {
  projectId?: Id;
  access?: ProjectAccess;
  onName(name: string): void;
  onRevoked(): void;
}): void;
```

Create one Postgres Changes channel filtered by project id for UPDATE/DELETE and one private broadcast channel `project-access:${projectId}:${userId}` for `access-revoked`. Call `cloud.realtime.setAuth()` before subscribing to the private channel. After CHANNEL_ERROR/TIMED_OUT/CLOSED, the next SUBSCRIBED runs `remoteList(userId)` and either `pullProject(remote)` or revokes when a successful list omits it. Cleanup removes both channels.

On revoke, close subscriptions and call `removeRevokedProject(projectId)`, which deletes local project/document/sync without `deleteRemote`. CanvasScreen shows “Доступ отозван” but keeps Export backed by the in-memory board until navigation.

- [ ] **Step 6: Mount realtime and image fallback**

After CanvasScreen loads sync state, call `connectRemoteImages(projectId)` and `useProjectRealtime`; cleanup calls `connectRemoteImages(null)`. Enable realtime for signed-in owner/editor/viewer only when remote metadata exists.

- [ ] **Step 7: Verify and commit**

```bash
npx vitest run src/features/cloud/model/realtime.test.ts
npm run typecheck
git add src/features/cloud/model/realtime.ts src/features/cloud/model/realtime.test.ts src/features/cloud/index.ts src/features/persistence/autosave.ts src/features/persistence/projectsRepo.ts src/app/CanvasScreen.tsx
git commit -m "Sync shared projects in realtime"
```

### Task 9: End-to-end collaboration contract

**Files:**
- Create: `e2e/cloud-collaboration.spec.ts`
- Modify: `e2e/global.d.ts`, `e2e/cloud-push.spec.ts`

**Interfaces:**
- Consumes: browser-facing contracts from Tasks 2–8.
- Produces: deterministic proof for invites, roles, updates, no echo, viewport preservation, and revocation.

- [ ] **Step 1: Build a stateful Supabase browser stub**

Keep projects, members, invites, RPC/function calls, and channels in `window.__collaboration`. Expose and type:

```ts
window.__collaboration.emitProjectUpdate(projectId, row);
window.__collaboration.emitRevoked(projectId, userId);
window.__collaboration.setActor({ id: 'viewer-1', email: 'viewer@example.com' });
```

Adapt cloud-push from upsert logs to `rpc('save_project')` logs while retaining its one-push-after-debounce invariant.

- [ ] **Step 2: Write complete browser scenarios**

Create separate tests for:

1. unregistered viewer -> “Приглашение отправлено” and pending row;
2. registered editor -> “Доступ добавлен” and member row;
3. role change and member removal;
4. invite route sets password, accepts, opens project;
5. viewer lacks tools/inspector/manage, cannot mutate by mouse/keyboard/paste/drop, can pan/zoom/export;
6. editor sees “Совместный проект”, edits, sends one save RPC;
7. foreign revision reaches a second page without reload and preserves viewport;
8. own revision creates no save echo;
9. revocation removes local list entry and shows “Доступ отозван”;
10. network failure leaves dirty state and shows “Сохранено только здесь”.

- [ ] **Step 3: Run collaboration and cloud regression suites**

```bash
npx playwright test e2e/cloud-collaboration.spec.ts e2e/cloud-push.spec.ts --project=e2e
npx playwright test e2e/cloud-auth.spec.ts e2e/cloud-adopt.spec.ts e2e/cloud-pull.spec.ts e2e/cloud-push.spec.ts e2e/cloud-images.spec.ts e2e/cloud-share.spec.ts e2e/cloud-collaboration.spec.ts --project=e2e
```

Expected: PASS. Emit realtime events directly; do not add fixed sleeps for them.

- [ ] **Step 4: Commit**

```bash
git add e2e/cloud-collaboration.spec.ts e2e/global.d.ts e2e/cloud-push.spec.ts
git commit -m "Test collaboration flows end to end"
```

### Task 10: Documentation, deployment, verification, and push

**Files:**
- Modify: `docs/cloud-setup.md`, `README.md`
- Modify: `docs/superpowers/specs/2026-09-18-project-collaboration-design.md`
- Add: `docs/superpowers/plans/2026-09-18-project-collaboration.md`

**Interfaces:**
- Consumes: finished implementation and logged-in Supabase CLI.
- Produces: deployed schema/function, configured invite redirect, documented limitations, pushed `origin/feat/cloud-sync`.

- [ ] **Step 1: Document exact production setup**

```bash
npx supabase link --project-ref wfhxobnovnhsimnfnefb
npx supabase db push
npx supabase secrets set APP_URL=https://kaydo228.github.io/AvailableCanvas/
npx supabase functions deploy invite-project-member --project-ref wfhxobnovnhsimnfnefb
```

Document adding `https://kaydo228.github.io/AvailableCanvas/invite` in Authentication → URL Configuration → Redirect URLs. State that server Supabase env values are automatic and must not be copied to GitHub Pages. In README, describe roles/realtime and plainly state that simultaneous saves replace the whole board; there are no live cursors or conflict-free merge.

- [ ] **Step 2: Run full local verification**

```bash
npx biome check --write docs/cloud-setup.md README.md src e2e supabase/functions
npm run check
npm run build
npx supabase test db
git diff --check
```

Expected: all exit 0. Do not run `npm run perf`; it is intentionally isolated.

- [ ] **Step 3: Review without touching session files**

```bash
git status --short
git diff --stat 4bb49d8..HEAD
git diff --check
```

Expected: collaboration files plus pre-existing uncommitted `sessions/alfis/2026-09-04.md` and `sessions/alfis/2026-09-05.md`; never stage the session files.

- [ ] **Step 4: Commit final docs**

```bash
git add docs/cloud-setup.md README.md docs/superpowers/specs/2026-09-18-project-collaboration-design.md docs/superpowers/plans/2026-09-18-project-collaboration.md
git commit -m "Document project collaboration setup"
```

- [ ] **Step 5: Deploy the migration and function**

```bash
npx supabase link --project-ref wfhxobnovnhsimnfnefb
npx supabase db push
npx supabase secrets set APP_URL=https://kaydo228.github.io/AvailableCanvas/
npx supabase functions deploy invite-project-member --project-ref wfhxobnovnhsimnfnefb
```

Expected: migration applied, secret set, function deployed. Add the production invite redirect in Dashboard and send one real invitation to a disposable address for manual smoke testing.

- [ ] **Step 6: Push the verified branch**

```bash
git push origin feat/cloud-sync
```

Expected: remote branch advances; CI runs `npm run check`; Pages deployment remains on `main` until merge.

---

## Self-Review Record

- Spec coverage: data/RLS, roles, pending invitations, acceptance, management UI, offline copies, atomic save, realtime/reconnect, revocation, viewer enforcement, project images, quiet save status, SQL/unit/E2E tests, deployment, and limitations each map to a task.
- Technical correction: immediate revocation adds a user-scoped private broadcast to project Postgres Changes; it carries no project content and exists because a revoked user cannot receive later project rows through RLS.
- Placeholder scan: no deferred implementation markers or unspecified error-handling steps remain.
- Type consistency: `ProjectAccess`, `MemberRole`, `RemoteBoard`, `SyncState.remoteRevision`, member APIs, `save_project`, and realtime hook names are defined before use and reused verbatim.
