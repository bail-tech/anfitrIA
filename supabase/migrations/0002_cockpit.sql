-- AnfitrIA v2 (Next.js cockpit) on top of the schema from the Python app (0001, Alembic head be9cec381c32).
-- Additive only: the old FastAPI app keeps working against the same tables while v2 replaces it.

-- ---------------------------------------------------------------------------
-- Defaults the Python app used to fill in itself
-- ---------------------------------------------------------------------------
alter table organizations alter column created_at set default now();
alter table users alter column created_at set default now();
alter table buildings alter column created_at set default now();
alter table properties alter column created_at set default now();
alter table knowledge_items alter column created_at set default now();
alter table reservations alter column created_at set default now();
alter table conversations alter column created_at set default now();
alter table messages alter column created_at set default now();
alter table drafts alter column created_at set default now();
alter table audit_logs alter column created_at set default now();
alter table notifications alter column created_at set default now();
alter table integrations alter column created_at set default now();
alter table properties alter column default_language set default 'es';
alter table properties alter column auto_answer set default true;
alter table knowledge_items alter column category set default 'general';
alter table conversations alter column channel set default 'sim';
alter table messages alter column language set default 'es';
alter table drafts alter column status set default 'pending';
alter table drafts alter column model set default 'mock';
alter table drafts alter column language set default 'es';
alter table drafts alter column confidence set default 0;
alter table notifications alter column read set default false;
alter table reservations alter column status set default 'upcoming';
alter table users alter column token_version set default 0;

-- v2 users live in auth.users + profiles, not in the legacy `users` table.
alter table properties alter column owner_id drop not null;
alter table buildings alter column owner_id drop not null;
alter table notifications alter column owner_id drop not null;

-- ---------------------------------------------------------------------------
-- Profiles and organisation membership
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id int not null references organizations(id),
  name text not null default '',
  email text not null,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);
create index ix_profiles_org_id on profiles(org_id);

create or replace function public.current_org() returns int
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function public.is_org_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'owner' from profiles where id = auth.uid()), false)
$$;

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id int not null default public.current_org() references organizations(id),
  email text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index ix_invitations_email on invitations(lower(email));

-- New sign-ups: an open invitation joins that organisation; an email that owns a
-- legacy (Python app) account takes over its organisation; anyone else gets a new one.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org int;
  v_role text := 'owner';
  v_name text := coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1));
  v_invite uuid;
begin
  select id, org_id, role into v_invite, v_org, v_role
    from invitations
   where lower(email) = lower(new.email) and accepted_at is null
   order by created_at desc limit 1;
  if v_invite is not null then
    update invitations set accepted_at = now() where id = v_invite;
  else
    v_role := 'owner';
    select org_id into v_org from users where lower(email) = lower(new.email) and org_id is not null limit 1;
    if v_org is null then
      insert into organizations(name) values (coalesce(nullif(new.raw_user_meta_data->>'org_name', ''), v_name))
      returning id into v_org;
    end if;
  end if;
  insert into profiles(id, org_id, name, email, role) values (new.id, v_org, v_name, new.email, v_role);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- New columns on existing tables
-- ---------------------------------------------------------------------------
alter table properties alter column org_id set default public.current_org();
alter table buildings alter column org_id set default public.current_org();
alter table notifications alter column org_id set default public.current_org();
alter table integrations alter column org_id set default public.current_org();
alter table properties add column if not exists timezone text not null default 'Europe/Madrid';
alter table properties add column if not exists cleaning_minutes int not null default 180;
alter table properties add column if not exists check_in_time time not null default '15:00';
alter table properties add column if not exists check_out_time time not null default '11:00';

alter table reservations add column if not exists total_amount numeric(10,2);
alter table reservations add column if not exists nightly_rate numeric(10,2);
alter table reservations add column if not exists currency text not null default 'EUR';
alter table reservations add column if not exists guests int;
alter table reservations add column if not exists channel_fee numeric(10,2);
alter table reservations add column if not exists review_ok boolean not null default false;
alter table reservations add column if not exists marketing_ok boolean not null default false;

-- Door codes, Wi-Fi passwords...: the model only ever sees a placeholder.
alter table knowledge_items add column if not exists is_private boolean not null default false;

alter table messages add column if not exists kind text not null default 'text' check (kind in ('text', 'audio'));
alter table messages add column if not exists media_path text;
alter table messages add column if not exists transcript text;
alter table messages add column if not exists sent_by uuid references profiles(id);

alter table drafts add column if not exists approved_by uuid references profiles(id);
alter table conversations add column if not exists assigned_profile uuid references profiles(id);
alter table conversations add column if not exists last_guest_message_at timestamptz;

alter table audit_logs add column if not exists org_id int references organizations(id);
alter table audit_logs add column if not exists actor_profile uuid references profiles(id);
update audit_logs a set org_id = p.org_id
  from conversations c join properties p on p.id = c.property_id
 where a.conversation_id = c.id and a.org_id is null;
alter table audit_logs alter column org_id set default public.current_org();
create index if not exists ix_audit_logs_org_id on audit_logs(org_id);

update conversations c set last_guest_message_at = m.at
  from (select conversation_id, max(created_at) as at from messages where direction = 'in' group by 1) m
 where m.conversation_id = c.id;

-- ---------------------------------------------------------------------------
-- Agents, proposals, operations
-- ---------------------------------------------------------------------------
create table agent_settings (
  org_id int not null default public.current_org() references organizations(id),
  agent text not null check (agent in ('guest', 'operations', 'pricing', 'analytics', 'marketing')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (org_id, agent)
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id int not null default public.current_org() references organizations(id),
  agent text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'budget_exceeded')),
  summary text,
  error text,
  cost_cents int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ix_agent_runs_org on agent_runs(org_id, started_at desc);

create table proposals (
  id uuid primary key default gen_random_uuid(),
  org_id int not null default public.current_org() references organizations(id),
  agent text not null,
  kind text not null check (kind in ('price', 'guest_message', 'staff_message', 'listing_copy', 'review_reply', 'knowledge', 'task')),
  property_id int references properties(id) on delete cascade,
  conversation_id int references conversations(id) on delete cascade,
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied', 'failed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references profiles(id)
);
create index ix_proposals_org_status on proposals(org_id, status, created_at desc);

create table staff (
  id uuid primary key default gen_random_uuid(),
  org_id int not null default public.current_org() references organizations(id),
  name text not null,
  phone text,
  role text not null default 'cleaning' check (role in ('cleaning', 'maintenance', 'other')),
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id int not null default public.current_org() references organizations(id),
  property_id int references properties(id) on delete cascade,
  reservation_id int references reservations(id) on delete set null,
  kind text not null default 'other' check (kind in ('turnover', 'maintenance', 'missing_info', 'other')),
  title text not null,
  notes text,
  due_at timestamptz,
  window_minutes int,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  staff_id uuid references staff(id) on delete set null,
  source text not null default 'host' check (source in ('host', 'system', 'ai')),
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique (org_id, dedupe_key)
);
create index ix_tasks_org_due on tasks(org_id, status, due_at);

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id int not null default public.current_org() references organizations(id),
  property_id int references properties(id) on delete cascade,
  kind text not null check (kind in ('pre_arrival', 'checkout', 'saved_reply')),
  title text not null default '',
  language text not null default 'es',
  body text not null,
  approved boolean not null default false,
  send_offset_hours int,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Retrieval (cosine similarity on normalised embeddings)
-- ---------------------------------------------------------------------------
create index if not exists ix_knowledge_embedding on knowledge_items
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_knowledge(
  p_property int, p_embedding extensions.vector(256), p_k int default 3, p_threshold float default 0.25
) returns table (id int, content text, category text, is_private boolean, score float)
language sql stable security invoker set search_path = public, extensions as $$
  select k.id, k.content, k.category, k.is_private, 1 - (k.embedding <=> p_embedding) as score
    from knowledge_items k
    join properties p on p.id = p_property
   where (k.property_id = p_property or (p.building_id is not null and k.building_id = p.building_id))
     and k.embedding is not null
     and 1 - (k.embedding <=> p_embedding) >= p_threshold
   order by k.embedding <=> p_embedding
   limit p_k
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: everything is scoped to the caller's organisation.
-- (The legacy Python API connects as `postgres` and bypasses RLS.)
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table invitations enable row level security;
alter table agent_settings enable row level security;
alter table agent_runs enable row level security;
alter table proposals enable row level security;
alter table staff enable row level security;
alter table tasks enable row level security;
alter table message_templates enable row level security;

create policy org_read on organizations for select to authenticated using (id = public.current_org());
create policy org_update on organizations for update to authenticated using (id = public.current_org() and public.is_org_owner());

create policy profiles_read on profiles for select to authenticated using (org_id = public.current_org());
create policy profiles_update_self on profiles for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and org_id = public.current_org());
create policy profiles_owner_update on profiles for update to authenticated
  using (org_id = public.current_org() and public.is_org_owner()) with check (org_id = public.current_org());

create policy invitations_owner on invitations for all to authenticated
  using (org_id = public.current_org() and public.is_org_owner())
  with check (org_id = public.current_org() and public.is_org_owner());

-- Tables with their own org_id column
do $$
declare t text;
begin
  foreach t in array array['buildings', 'notifications', 'integrations', 'agent_settings', 'agent_runs',
                           'proposals', 'staff', 'tasks', 'message_templates', 'audit_logs']
  loop
    execute format('create policy %I on %I for all to authenticated using (org_id = public.current_org()) with check (org_id = public.current_org())', t || '_org', t);
  end loop;
end $$;

create policy properties_read on properties for select to authenticated using (org_id = public.current_org());
create policy properties_insert on properties for insert to authenticated with check (org_id = public.current_org());
create policy properties_update on properties for update to authenticated using (org_id = public.current_org()) with check (org_id = public.current_org());
create policy properties_delete on properties for delete to authenticated using (org_id = public.current_org() and public.is_org_owner());

create or replace function public.org_property_ids() returns setof int
language sql stable security definer set search_path = public as $$
  select id from properties where org_id = public.current_org()
$$;
create or replace function public.org_building_ids() returns setof int
language sql stable security definer set search_path = public as $$
  select id from buildings where org_id = public.current_org()
$$;
create or replace function public.org_conversation_ids() returns setof int
language sql stable security definer set search_path = public as $$
  select c.id from conversations c join properties p on p.id = c.property_id where p.org_id = public.current_org()
$$;

create policy knowledge_org on knowledge_items for all to authenticated
  using (property_id in (select public.org_property_ids()) or building_id in (select public.org_building_ids()))
  with check (property_id in (select public.org_property_ids()) or building_id in (select public.org_building_ids()));
create policy reservations_org on reservations for all to authenticated
  using (property_id in (select public.org_property_ids())) with check (property_id in (select public.org_property_ids()));
create policy conversations_org on conversations for all to authenticated
  using (property_id in (select public.org_property_ids())) with check (property_id in (select public.org_property_ids()));
create policy messages_org on messages for all to authenticated
  using (conversation_id in (select public.org_conversation_ids())) with check (conversation_id in (select public.org_conversation_ids()));
create policy drafts_org on drafts for all to authenticated
  using (inbound_message_id in (select m.id from messages m where m.conversation_id in (select public.org_conversation_ids())))
  with check (inbound_message_id in (select m.id from messages m where m.conversation_id in (select public.org_conversation_ids())));

-- Helper functions are for policies and the app, not for anonymous callers.
-- (Functions are executable by PUBLIC by default, so revoke from PUBLIC, then grant back.)
do $$
declare f text;
begin
  foreach f in array array['public.current_org()', 'public.is_org_owner()', 'public.org_property_ids()',
                           'public.org_building_ids()', 'public.org_conversation_ids()',
                           'public.match_knowledge(int, extensions.vector, int, float)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
