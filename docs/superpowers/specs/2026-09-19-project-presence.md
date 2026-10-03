# Project Presence Design

## Goal

Show authenticated participants who currently have the same remote project open.

## Behaviour

- Presence is active only for an authenticated remote project that has not been revoked.
- The current user is included and labelled `Вы`.
- Multiple tabs or devices for the same account are rendered as one person.
- A participant disappears when all of their connections leave the project channel.
- The header shows compact initial avatars with an online dot; email is available in visible text or an accessible tooltip/title.
- Presence failures do not block editing or viewing the board.

## Security

- Use a private Supabase Realtime Presence channel named `project-presence:<projectId>`.
- Both listening to and publishing Presence require membership in the project: owner, editor, or viewer.
- Authorization is enforced by `select` and `insert` RLS policies on `realtime.messages`.

## Scope

- No new package and no persistent online-status table.
- No cursors, activity timestamps, or offline history.
- Existing project update and access-revocation channels remain unchanged.
