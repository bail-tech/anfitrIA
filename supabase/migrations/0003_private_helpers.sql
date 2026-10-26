-- Policy helpers live outside the API-exposed `public` schema, so they can't be called over /rest/v1/rpc.
-- Policies and column defaults reference the functions by OID, so they keep working after the move.
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

alter function public.current_org() set schema private;
alter function public.is_org_owner() set schema private;
alter function public.org_property_ids() set schema private;
alter function public.org_building_ids() set schema private;
alter function public.org_conversation_ids() set schema private;
alter function public.handle_new_user() set schema private;

alter function private.current_org() set search_path = public;
alter function private.is_org_owner() set search_path = public;
alter function private.org_property_ids() set search_path = public, private;
alter function private.org_building_ids() set search_path = public, private;
alter function private.org_conversation_ids() set search_path = public, private;
alter function private.handle_new_user() set search_path = public, private;

-- SQL function bodies resolve names at call time: point them at the moved helper.
create or replace function private.org_property_ids() returns setof int
language sql stable security definer set search_path = public, private as $$
  select id from public.properties where org_id = private.current_org()
$$;
create or replace function private.org_building_ids() returns setof int
language sql stable security definer set search_path = public, private as $$
  select id from public.buildings where org_id = private.current_org()
$$;
create or replace function private.org_conversation_ids() returns setof int
language sql stable security definer set search_path = public, private as $$
  select c.id from public.conversations c join public.properties p on p.id = c.property_id where p.org_id = private.current_org()
$$;
