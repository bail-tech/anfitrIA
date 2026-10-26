-- Performance advisor follow-ups: cover the foreign keys used by joins/RLS, and one
-- profiles UPDATE policy that evaluates auth.uid() once per statement instead of per row.
create index if not exists ix_proposals_property on proposals(property_id);
create index if not exists ix_proposals_conversation on proposals(conversation_id);
create index if not exists ix_tasks_property on tasks(property_id);
create index if not exists ix_tasks_reservation on tasks(reservation_id);
create index if not exists ix_tasks_staff on tasks(staff_id);
create index if not exists ix_staff_org on staff(org_id);
create index if not exists ix_message_templates_org on message_templates(org_id);
create index if not exists ix_message_templates_property on message_templates(property_id);
create index if not exists ix_invitations_org on invitations(org_id);

drop policy profiles_update_self on profiles;
drop policy profiles_owner_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (org_id = private.current_org() and (id = (select auth.uid()) or private.is_org_owner()))
  with check (org_id = private.current_org());

-- Members must not be able to promote themselves or move organisation: only `name` is updatable via the API.
revoke update on profiles from authenticated, anon;
grant update (name) on profiles to authenticated;
