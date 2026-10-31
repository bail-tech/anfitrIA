-- Personal API keys: a host connects AnfitrIA to Claude, ChatGPT or any MCP client.
-- Only a SHA-256 hash is stored; the key itself is shown once when it's created.
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id int not null default private.current_org() references organizations(id),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists ix_api_keys_profile on api_keys(profile_id);

alter table api_keys enable row level security;
-- Each host sees and revokes only their own keys; creation goes through the server.
create policy api_keys_own_read on api_keys for select to authenticated using (profile_id = auth.uid());
create policy api_keys_own_revoke on api_keys for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke update on api_keys from authenticated;
grant update (revoked_at) on api_keys to authenticated;
