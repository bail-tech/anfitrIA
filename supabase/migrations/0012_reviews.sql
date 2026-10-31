-- Guest reviews the host pastes in, with Anfi's drafted public reply.
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  org_id int not null default private.current_org() references organizations(id),
  property_id int not null references properties(id) on delete cascade,
  platform text not null default 'airbnb' check (platform in ('airbnb', 'booking', 'vrbo', 'google', 'other')),
  rating int check (rating between 1 and 5),
  guest_name text,
  text text not null check (char_length(text) between 1 and 5000),
  reply text,
  status text not null default 'draft' check (status in ('draft', 'replied')),
  created_at timestamptz not null default now(),
  replied_at timestamptz
);
create index if not exists ix_reviews_org on reviews(org_id, created_at desc);
alter table reviews enable row level security;
create policy reviews_org on reviews for all to authenticated using (org_id = private.current_org()) with check (org_id = private.current_org());
