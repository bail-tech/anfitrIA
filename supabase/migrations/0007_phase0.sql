-- Phase 0: guest-journey board, PMS connections (Smoobu), SES.Hospedajes guest registration.

-- ---------------------------------------------------------------------------
-- Guest journey: scheduled messages anchored to the booking, check-in or check-out
-- ---------------------------------------------------------------------------
alter table message_templates drop constraint if exists message_templates_kind_check;
alter table message_templates add constraint message_templates_kind_check
  check (kind in ('booking_confirmed', 'pre_arrival', 'check_in', 'during_stay', 'checkout', 'post_stay', 'saved_reply'));
alter table message_templates add column if not exists anchor text
  check (anchor in ('booking', 'check_in', 'check_out'));
-- Only for stays of at least this many nights (e.g. a mid-stay check-in for long stays).
alter table message_templates add column if not exists min_nights int check (min_nights is null or min_nights > 0);
-- Only when the stay went well: no urgent escalation during the stay (review requests).
alter table message_templates add column if not exists positive_only boolean not null default false;
update message_templates set anchor = case kind when 'checkout' then 'check_out' else 'check_in' end
  where anchor is null and kind <> 'saved_reply';

-- ---------------------------------------------------------------------------
-- Integrations: one row per provider and organisation; secrets live in Supabase Vault
-- ---------------------------------------------------------------------------
alter table integrations add column if not exists secret_id uuid;
alter table integrations add column if not exists webhook_token text;
alter table integrations add column if not exists last_sync_at timestamptz;
alter table integrations add column if not exists last_error text;
create unique index if not exists ux_integrations_org_provider on integrations(org_id, provider);
create unique index if not exists ux_integrations_webhook_token on integrations(webhook_token) where webhook_token is not null;

-- Server-only: the browser never sees a secret, and hosts cannot read them back through the API.
create or replace function public.integration_set_secret(p_integration int, p_secret text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid;
begin
  select secret_id into v_id from integrations where id = p_integration;
  if v_id is null then
    v_id := vault.create_secret(p_secret, 'integration_' || p_integration);
    update integrations set secret_id = v_id where id = p_integration;
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end $$;

create or replace function public.integration_get_secret(p_integration int) returns text
language sql stable security definer set search_path = public, vault as $$
  select s.decrypted_secret from integrations i join vault.decrypted_secrets s on s.id = i.secret_id where i.id = p_integration
$$;

revoke all on function public.integration_set_secret(int, text) from public, anon, authenticated;
revoke all on function public.integration_get_secret(int) from public, anon, authenticated;
grant execute on function public.integration_set_secret(int, text) to service_role;
grant execute on function public.integration_get_secret(int) to service_role;

-- Imported bookings are matched by their external code within a property.
create unique index if not exists ux_reservations_property_code on reservations(property_id, code) where code is not null;
create unique index if not exists ux_messages_conversation_external on messages(conversation_id, external_id) where external_id is not null;

-- ---------------------------------------------------------------------------
-- SES.Hospedajes (Real Decreto 933/2021): guest registration ("parte de viajeros")
-- ---------------------------------------------------------------------------
alter table properties add column if not exists ses_establishment_code text
  check (ses_establishment_code is null or ses_establishment_code ~ '^[A-Za-z0-9]{1,10}$');

create table if not exists guest_registrations (
  id uuid primary key default gen_random_uuid(),
  org_id int not null default private.current_org() references organizations(id),
  reservation_id int not null unique references reservations(id) on delete cascade,
  -- The link the guest opens to fill in their details (no account needed).
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'sent', 'accepted', 'error', 'cancelled')),
  contract_date date,
  payment_type text not null default 'PLATF',
  payment_date date,
  rooms int,
  internet boolean,
  lote text,
  communication_code text,
  error text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists travellers (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references guest_registrations(id) on delete cascade,
  position int not null default 1,
  first_name text not null,
  surname1 text not null,
  surname2 text,
  document_type text,
  document_number text,
  document_support text,
  birth_date date not null,
  nationality text check (nationality is null or nationality ~ '^[A-Z]{3}$'),
  sex text,
  address text not null,
  address_extra text,
  municipality_code text check (municipality_code is null or municipality_code ~ '^[0-9]{5}$'),
  municipality_name text,
  postal_code text not null,
  country text not null check (country ~ '^[A-Z]{3}$'),
  phone text,
  email text,
  kinship text,
  created_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);
create index if not exists ix_travellers_registration on travellers(registration_id);
create index if not exists ix_guest_registrations_org on guest_registrations(org_id, status);

alter table guest_registrations enable row level security;
alter table travellers enable row level security;
create policy guest_registrations_org on guest_registrations for all to authenticated
  using (org_id = private.current_org()) with check (org_id = private.current_org());
create policy travellers_org on travellers for all to authenticated
  using (registration_id in (select id from guest_registrations where org_id = private.current_org()))
  with check (registration_id in (select id from guest_registrations where org_id = private.current_org()));
