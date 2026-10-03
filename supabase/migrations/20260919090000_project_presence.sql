-- Приватный Presence открыт только участникам конкретного проекта.
-- Публичность доски не даёт доступ к списку тех, кто сейчас её редактирует.

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
