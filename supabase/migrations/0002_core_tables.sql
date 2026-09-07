-- ============================================================================
-- 0002 — profiles, fleet, places, people, reservations (plan 6.1 / 6.2)
--
-- Vocabulary (plan 6.1), because the whole schema turns on it:
--   vehicle = the marketed model (one page, one price)
--   unit    = one physical car with a plate. Three Logans = one vehicle,
--             three units. This is what makes "dernière disponibilité" true.
-- ============================================================================

-- ---------------------------------------------------------------- profiles
-- One row per staff member, keyed to auth.users. The role is copied into the
-- JWT by the access-token hook in 0005 so RLS can read it without a join.
create table if not exists profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          staff_role not null default 'agent',
  display_name  text,
  phone         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- settings
-- Columns the app already writes but the starter's schema predates.
alter table settings add column if not exists fax              text;
alter table settings add column if not exists cndp_receipt     text;          -- plan 9.4; empty until the declaration is filed
alter table settings add column if not exists services         jsonb not null default '{}'::jsonb;
alter table settings add column if not exists booking_channels jsonb not null default '[]'::jsonb;
alter table settings add column if not exists google_rating       numeric;    -- null until proven (rule 11)
alter table settings add column if not exists google_review_count int;
alter table settings add column if not exists google_review_url   text;

-- ---------------------------------------------------------------- locations
-- The starter shipped a thin `locations`; widen it to plan 6.2 in place so no
-- data is lost. `type` (agency|airport|station|address) becomes `kind`.
alter table locations add column if not exists kind             location_kind;
alter table locations add column if not exists city             text;
alter table locations add column if not exists slug             text;
alter table locations add column if not exists address          text;
alter table locations add column if not exists lat              numeric;
alter table locations add column if not exists lng              numeric;
alter table locations add column if not exists delivery_fee_mad numeric;   -- null = "sur devis", never 0 by default (rule 11)
alter table locations add column if not exists hours            jsonb;
alter table locations add column if not exists is_24h           boolean;
alter table locations add column if not exists sort             int not null default 100;
alter table locations add column if not exists created_at       timestamptz not null default now();

-- Backfill from the old shape, then make the new columns authoritative.
update locations set slug = key where slug is null;
update locations set kind = case
    when type = 'airport' then 'airport'::location_kind
    when type = 'agency'  then 'agency'::location_kind
    when type = 'station' then 'district'::location_kind
    else 'custom'::location_kind
  end
  where kind is null and type is not null;
update locations set kind = 'custom'::location_kind where kind is null;
update locations set delivery_fee_mad = fee where delivery_fee_mad is null and fee is not null and fee > 0;

alter table locations alter column kind set not null;
create unique index if not exists locations_slug_key on locations (slug);
create index if not exists locations_kind_idx on locations (kind, sort);

-- ---------------------------------------------------------------- vehicles
alter table vehicles add column if not exists prep_buffer_minutes int  not null default 120;
alter table vehicles add column if not exists min_days            int  not null default 1;
alter table vehicles add column if not exists is_published        boolean;
alter table vehicles add column if not exists purpose_tags        text[] not null default '{}';
alter table vehicles add column if not exists popularity_score    numeric not null default 0;
alter table vehicles add column if not exists price_high_season   numeric;
alter table vehicles add column if not exists price_verified      boolean not null default false;
alter table vehicles add column if not exists units_count         int not null default 1;
alter table vehicles add column if not exists photo_folder        text;

-- `published` already exists; is_published mirrors it so both names work while
-- the app migrates. Kept in step by a trigger rather than a view, so writes
-- through either column stay correct.
update vehicles set is_published = published where is_published is null;
alter table vehicles alter column is_published set default false;

create or replace function sync_vehicle_published() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.is_published is null then new.is_published := coalesce(new.published, false); end if;
    if new.published is null then new.published := coalesce(new.is_published, false); end if;
  elsif new.is_published is distinct from old.is_published then
    new.published := new.is_published;
  elsif new.published is distinct from old.published then
    new.is_published := new.published;
  end if;
  return new;
end $$;

drop trigger if exists vehicles_sync_published on vehicles;
create trigger vehicles_sync_published before insert or update on vehicles
  for each row execute function sync_vehicle_published();

create index if not exists vehicles_purpose_idx on vehicles using gin (purpose_tags);

-- ---------------------------------------------------------------- units
create table if not exists units (
  id                  uuid primary key default gen_random_uuid(),
  vehicle_id          uuid not null references vehicles (id) on delete cascade,
  plate               text unique,
  vin                 text,
  color               text,
  year                int,
  mileage_km          int not null default 0,
  fuel_pct            int check (fuel_pct between 0 and 100),
  status              unit_status not null default 'available',
  current_location_id uuid references locations (id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists units_vehicle_idx on units (vehicle_id, status);

-- ---------------------------------------------------------------- customers
-- Data minimisation (plan 9.4): no birthdate. Document scans are never stored
-- here — only the private-bucket path, read through a 15-minute signed URL.
create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text not null,
  phone         text not null unique,     -- E.164
  whatsapp      text,
  email         text,
  locale        text not null default 'fr',
  notes         text,
  document_paths jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists customers_phone_idx on customers (phone);

-- ---------------------------------------------------------------- holds
-- A 10-minute soft lock taken during checkout (plan 6.1 / 6.3). Anonymous
-- visitors reach this only through the create_hold() RPC added in prompt 06.
create table if not exists holds (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references vehicles (id) on delete cascade,
  unit_id       uuid references units (id) on delete cascade,
  period        tstzrange not null,
  session_token text not null,
  expires_at    timestamptz not null default (now() + interval '10 minutes'),
  released_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists holds_live_idx on holds (vehicle_id, expires_at) where released_at is null;
create index if not exists holds_period_idx on holds using gist (period);

-- ---------------------------------------------------------------- reservations
-- Note: the starter's `bookings` table is left untouched. It still backs the
-- current lead form until the funnel is rebuilt (prompt 09); `reservations` is
-- the canonical table from here on.
create table if not exists reservations (
  id                   uuid primary key default gen_random_uuid(),
  reference            text unique not null,
  vehicle_id           uuid not null references vehicles (id) on delete restrict,
  unit_id              uuid references units (id) on delete set null,
  customer_id          uuid references customers (id) on delete set null,
  pickup_location_id   uuid references locations (id) on delete set null,
  dropoff_location_id  uuid references locations (id) on delete set null,
  start_at             timestamptz not null,
  end_at               timestamptz not null,

  -- Copied from the vehicle on write (trigger below) so `period` can be a
  -- GENERATED column: a generated expression may only read its own row.
  prep_buffer_minutes  int not null default 120,

  -- The bookable window, widened by the prep buffer on BOTH ends so the same
  -- car is never promised 30 minutes after a return (plan 6.3).
  period tstzrange generated always as (
    tstzrange(
      start_at - make_interval(mins => prep_buffer_minutes),
      end_at   + make_interval(mins => prep_buffer_minutes),
      '[)'
    )
  ) stored,

  status      reservation_status not null default 'pending',
  quote       jsonb not null default '{}'::jsonb,   -- snapshot: nothing recomputed later (rule 4)
  source      reservation_source not null default 'web',
  locale      text not null default 'fr',
  hold_id     uuid references holds (id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint reservations_period_valid check (end_at > start_at)
);

create index if not exists reservations_status_idx  on reservations (status, start_at);
create index if not exists reservations_vehicle_idx on reservations (vehicle_id, start_at);
create index if not exists reservations_period_idx  on reservations using gist (period);

-- Keep prep_buffer_minutes in step with the vehicle it was booked from.
create or replace function set_reservation_prep_buffer() returns trigger
language plpgsql as $$
begin
  select v.prep_buffer_minutes into new.prep_buffer_minutes
    from vehicles v where v.id = new.vehicle_id;
  new.prep_buffer_minutes := coalesce(new.prep_buffer_minutes, 120);
  return new;
end $$;

drop trigger if exists reservations_prep_buffer on reservations;
create trigger reservations_prep_buffer before insert or update of vehicle_id on reservations
  for each row execute function set_reservation_prep_buffer();

-- ---------------------------------------------------------------- blocks
create table if not exists blocks (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references units (id) on delete cascade,
  kind        block_kind not null default 'maintenance',
  period      tstzrange not null,
  reason      text not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists blocks_unit_idx on blocks using gist (unit_id, period);
