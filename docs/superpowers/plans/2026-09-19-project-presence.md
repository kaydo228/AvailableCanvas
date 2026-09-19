# Project Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the authenticated people who currently have the same remote project open.

**Architecture:** A focused React hook owns one private Supabase Presence channel and converts connection-level Presence state into a deduplicated user list. A small header component renders that list. A database migration authorizes Presence only when `private.can_view_project` permits the authenticated user to access the project encoded in the topic.

**Tech Stack:** React 19, TypeScript, Supabase Realtime Presence, PostgreSQL RLS, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-19-project-presence.md`

## Global Constraints

- Do not add a dependency or a persistent online-status table.
- Presence is enabled only for authenticated, non-revoked remote projects.
- Multiple connections for one account render as one participant.
- Presence failure must not block the canvas.
- Follow the existing header styling and Russian interface copy.

## Review Focus

- Malformed Presence payloads are ignored rather than rendered or allowed to crash the header.
- Duplicate connections for one account collapse to one participant and disappear only after the last connection leaves.
- The current account is identifiable as `Вы`.
- Channel authorization rejects authenticated outsiders while accepting owners and members.
- Unmount removes the Presence channel so stale online users are not retained.

---

### Task 1: Presence model and hook

**Files:**
- Create: `src/features/cloud/model/presence.ts`
- Create: `src/features/cloud/model/presence.test.tsx`
- Modify: `src/features/cloud/index.ts`

**Interfaces:**
- Consumes: `getCloud()` and `useSession`, plus the Supabase channel `presenceState`, `track`, `subscribe`, and `removeChannel` methods.
- Produces: `OnlineParticipant { userId: string; email: string; self: boolean }` and `useProjectPresence(projectId?: Id): OnlineParticipant[]`.

- [ ] **Step 1: Write the failing tests**

Cover subscription and tracking after `SUBSCRIBED`, state refresh on `sync`, invalid payload filtering, user-id deduplication, current-user labelling, and channel removal on unmount.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm test -- --run src/features/cloud/model/presence.test.tsx`

Expected: FAIL because `./presence` does not exist.

- [ ] **Step 3: Implement the minimal hook**

Create a private `project-presence:<projectId>` channel with `presence.key = userId`, authorize Realtime, subscribe to `presence sync`, call `track({ userId, email })` after subscription, deduplicate state by `userId`, and clean up with `removeChannel`.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `npm test -- --run src/features/cloud/model/presence.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit the hook, tests, export, design, and plan with message `Add project presence model`.

### Task 2: Header online indicator

**Files:**
- Create: `src/features/cloud/ui/OnlineParticipants.tsx`
- Create: `src/features/cloud/ui/OnlineParticipants.test.tsx`
- Modify: `src/features/cloud/index.ts`
- Modify: `src/app/CanvasScreen.tsx`

**Interfaces:**
- Consumes: `OnlineParticipant[]` from Task 1.
- Produces: `OnlineParticipants({ participants })` and a CanvasScreen integration that calls `useProjectPresence` only for a valid remote project.

- [ ] **Step 1: Write the failing component tests**

Cover no output for an empty list, initials and online labels for visible participants, `Вы` for the current user, and compact overflow text when more than four users are online.

- [ ] **Step 2: Run the component test to verify RED**

Run: `npm test -- --run src/features/cloud/ui/OnlineParticipants.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the minimal UI and CanvasScreen integration**

Render at most four labelled avatar chips plus `+N`, place them before the existing header controls, and keep every participant email available to assistive technology and hover users.

- [ ] **Step 4: Run focused model and UI tests to verify GREEN**

Run: `npm test -- --run src/features/cloud/model/presence.test.tsx src/features/cloud/ui/OnlineParticipants.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit with message `Show online project participants`.

### Task 3: Private Presence authorization

**Files:**
- Create: `supabase/migrations/20260919090000_project_presence.sql`
- Modify: `supabase/schema.sql`
- Modify: `supabase/tests/database/project_collaboration.test.sql`

**Interfaces:**
- Consumes: topic format `project-presence:<projectId>` and existing `private.can_view_project(text, uuid)`.
- Produces: `project_presence_select` and `project_presence_insert` RLS policies on `realtime.messages`.

- [ ] **Step 1: Add failing database assertions**

Assert the two policies exist, target Presence, and call the project-access predicate for the project topic.

- [ ] **Step 2: Run the database test to verify RED**

Run: `npm run test:db`

Expected: FAIL because the Presence policies do not exist.

- [ ] **Step 3: Add the migration and mirror it in schema.sql**

Create one `select` policy for receiving Presence and one `insert` policy for tracking Presence. Both require `extension = 'presence'`, a `project-presence:` topic, and `private.can_view_project` for the suffix project id and `auth.uid()`.

- [ ] **Step 4: Run database tests to verify GREEN**

Run: `npm run test:db`

Expected: PASS.

- [ ] **Step 5: Run the full project gate and commit**

Run: `npm run check`

Expected: typecheck, lint, unit tests, build, and e2e all pass.

Commit with message `Authorize project presence channels`.

