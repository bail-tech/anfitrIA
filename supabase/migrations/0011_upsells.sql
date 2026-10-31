-- Upsells (no payment yet): a catalogue of extras, and the offers made to guests.
create table if not exists upsell_items (
  id uuid primary key default gen_random_uuid(),
  org_id int not null default private.current_org() references organizations(id),
  property_id int references properties(id) on delete cascade, -- null = every property
  name text not null check (char_length(name) between 1 and 80),
  price numeric(10,2) not null check (price >= 0),
  currency text not null default 'EUR',
  -- Words that show a guest wants it ("early check-in", "llegar antes"…), matched in their messages.
  keywords text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists upsell_offers (
  id uuid primary key default gen_random_uuid(),
  org_id int not null default private.current_org() references organizations(id),
  item_id uuid references upsell_items(id) on delete set null,
  conversation_id int references conversations(id) on delete set null,
  reservation_id int references reservations(id) on delete set null,
  name text not null,
  price numeric(10,2) not null,
  currency text not null default 'EUR',
  status text not null default 'offered' check (status in ('offered', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists ix_upsell_items_org on upsell_items(org_id);
create index if not exists ix_upsell_offers_org on upsell_offers(org_id, status);

alter table upsell_items enable row level security;
alter table upsell_offers enable row level security;
create policy upsell_items_org on upsell_items for all to authenticated using (org_id = private.current_org()) with check (org_id = private.current_org());
create policy upsell_offers_org on upsell_offers for all to authenticated using (org_id = private.current_org()) with check (org_id = private.current_org());
