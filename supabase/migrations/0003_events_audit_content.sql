-- ============================================================================
-- 0003 — events, audit, notifications, and the content columns plan 6.2 adds
-- ============================================================================

-- ---------------------------------------------------------------- vehicle_events
-- Append-only facts about a unit (plan 6.1). Never updated, never deleted:
-- this is the operational history a dispute is settled with.
create table if not exists vehicle_events (
  id             uuid primary key default gen_random_uuid(),
  unit_id        uuid not null references units (id) on delete cascade,
  reservation_id uuid references reservations (id) on delete set null,
  type           event_type not null,
  at             timestamptz not null default now(),
  actor_id       uuid references auth.users (id) on delete set null,
  location_id    uuid references locations (id) on delete set null,
  mileage_km     int,
  fuel_pct       int check (fuel_pct between 0 and 100),
  condition      jsonb,          -- condition map from the checklist
  notes          text,
  photos         text[] not null default '{}',   -- private-bucket paths
  signature_path text,
  data           jsonb not null default '{}'::jsonb,
  reason         text
);
create index if not exists vehicle_events_unit_idx on vehicle_events (unit_id, at desc);
create index if not exists vehicle_events_reservation_idx on vehicle_events (reservation_id, at desc);

-- ---------------------------------------------------------------- audit_log
create table if not exists audit_log (
  id         bigserial primary key,
  table_name text not null,
  -- uuid for the tables keyed that way, so the index below stays useful.
  row_id     uuid,
  -- The raw primary key as text, for tables that are NOT uuid-keyed —
  -- `settings.id` is `int check (id = 1)`. Without this, audit_row() casts "1"
  -- to uuid and every write to settings fails with 22P02.
  row_key    text,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  before     jsonb,
  after      jsonb,
  actor_id   uuid references auth.users (id) on delete set null,
  reason     text,
  at         timestamptz not null default now()
);
create index if not exists audit_log_table_idx on audit_log (table_name, at desc);
-- Before the indexes: on a database created before row_key existed, the index
-- below would otherwise be asked to reference a column that is not there yet.
alter table audit_log add column if not exists row_key text;

create index if not exists audit_log_row_idx on audit_log (row_id, at desc);
create index if not exists audit_log_rowkey_idx on audit_log (table_name, row_key, at desc);

-- ---------------------------------------------------------------- notifications
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  level      notification_level not null default 'info',
  title      text not null,
  body       text,
  href       text,
  for_role   staff_role,          -- null = every staff member
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_unread_idx on notifications (created_at desc) where read_at is null;

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  keys       jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- faqs
alter table faqs add column if not exists slug             text;
alter table faqs add column if not exists city_slug        text;
alter table faqs add column if not exists vehicle_id       uuid references vehicles (id) on delete set null;
alter table faqs add column if not exists short_answer     jsonb not null default '{}'::jsonb;
alter table faqs add column if not exists long_answer      jsonb not null default '{}'::jsonb;
alter table faqs add column if not exists sort             int not null default 100;
alter table faqs add column if not exists is_published     boolean;

update faqs set is_published = published where is_published is null;
update faqs set sort = sort_order where sort = 100 and sort_order is not null;
-- The starter's single `answer` becomes the long answer; the short one is the
-- AEO answer block and is authored per question (prompt 13).
update faqs set long_answer = answer where long_answer = '{}'::jsonb and answer is not null;
-- NOT partial. `ON CONFLICT (slug)` can only use a partial index if the
-- statement repeats the index predicate, which PostgREST cannot express — so
-- `where slug is not null` made the seed fail with "no unique or exclusion
-- constraint matching the ON CONFLICT specification".
-- Dropping the predicate costs nothing: Postgres treats NULLs as distinct in a
-- unique index, so any number of slug-less FAQs are still allowed.
drop index if exists faqs_slug_key;
create unique index if not exists faqs_slug_key on faqs (slug);

-- ---------------------------------------------------------------- reviews
alter table reviews add column if not exists external_id text;
alter table reviews add column if not exists city        text;
create unique index if not exists reviews_external_key on reviews (source, external_id) where external_id is not null;

-- ---------------------------------------------------------------- updated_at
-- One trigger function, attached to every table that has the column.
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'vehicles', 'units', 'customers', 'reservations', 'settings']
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'updated_at'
    ) then
      execute format('drop trigger if exists %I on %I', t || '_touch_updated_at', t);
      execute format('create trigger %I before update on %I for each row execute function touch_updated_at()', t || '_touch_updated_at', t);
    end if;
  end loop;
end $$;
