-- Diab Car — Supabase schema (Postgres). Run in the SQL editor of a new project.
-- Column names are snake_case; the app maps them to camelCase automatically.
-- i18n text columns are jsonb: {"fr": "...", "en": "...", "ar": "...", "es": "..."}

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- settings
create table if not exists settings (
  id                    int primary key default 1 check (id = 1),
  name                  text not null default 'Diab Car',
  legal_name            text,
  tagline               jsonb default '{}'::jsonb,
  phone_primary         text,
  phone_secondary       text,
  phone_landline        text,
  whatsapp              text,
  email                 text,
  address_line          text,
  city                  text default 'Casablanca',
  postal_code           text,
  region                text default 'Casablanca-Settat',
  country               text default 'MA',
  lat                   double precision,
  lng                   double precision,
  google_maps_url       text,
  gbp_url               text,
  facebook_url          text,
  instagram_url         text,
  tiktok_url            text,
  hours                 jsonb default '[]'::jsonb,
  airport_service24h    boolean default true,
  rc                    text,
  ice                   text,
  capital_mad           numeric,
  founded_year          int,
  eur_rate              numeric default 10.8,
  response_time         jsonb default '{}'::jsonb,
  airport_delivery_fee  numeric default 0,
  city_delivery_fee     numeric default 0,
  one_way_fee           numeric default 0,
  min_age               int default 21,
  premium_min_age       int default 25,
  min_license_years     int default 1,
  fuel_policy           text default 'full-to-full',
  free_cancellation_hours int default 24,
  deposit_release_days  int default 7,
  pricing_tiers         jsonb default '[{"minDays":7,"discountPct":10},{"minDays":15,"discountPct":15},{"minDays":30,"discountPct":25}]'::jsonb,
  monthly_from          jsonb default '{"economy":6500,"suv":9500,"premium":19000}'::jsonb,
  ga_id                 text,
  index_now_key         text,
  updated_at            timestamptz default now()
);

-- ---------------------------------------------------------------- vehicles
create table if not exists vehicles (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  brand           text not null,
  model           text not null,
  year            int not null,
  category        text not null check (category in ('economy','compact','sedan','suv','premium','luxury','van')),
  transmission    text not null check (transmission in ('manual','automatic')),
  fuel            text not null check (fuel in ('petrol','diesel','hybrid','electric')),
  seats           int default 5,
  doors           int default 5,
  luggage         int default 2,
  ac              boolean default true,
  price_per_day   numeric not null,
  deposit         numeric not null default 0,
  mileage_limit   int,                     -- null = unlimited
  min_age         int default 21,
  image           text default 'berline',  -- illustration fallback
  images          jsonb default '[]'::jsonb, -- array of photo URLs
  features        jsonb default '[]'::jsonb,
  description     jsonb default '{}'::jsonb,
  published       boolean default false,
  featured        boolean default false,
  sort_order      int default 100,
  rating          numeric default 0,
  review_count    int default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists vehicles_published_idx on vehicles (published, sort_order);

-- ---------------------------------------------------------------- pricing
create table if not exists seasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  multiplier  numeric not null default 1,
  active      boolean default true
);

create table if not exists extras (
  id      uuid primary key default gen_random_uuid(),
  key     text unique not null,
  type    text not null default 'per_day' check (type in ('per_day','flat')),
  price   numeric not null default 0,
  active  boolean default true,
  name    jsonb default '{}'::jsonb
);

create table if not exists locations (
  id      uuid primary key default gen_random_uuid(),
  key     text unique not null,
  type    text not null check (type in ('agency','airport','station','address')),
  fee     numeric default 0,
  active  boolean default true,
  name    jsonb default '{}'::jsonb
);

-- ---------------------------------------------------------------- content
create table if not exists faqs (
  id          uuid primary key default gen_random_uuid(),
  category    text default 'general',
  sort_order  int default 100,
  published   boolean default true,
  question    jsonb default '{}'::jsonb,
  answer      jsonb default '{}'::jsonb
);

create table if not exists posts (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  cover         text default 'berline',
  tags          jsonb default '[]'::jsonb,
  published     boolean default false,
  published_at  timestamptz default now(),
  updated_at    timestamptz default now(),
  title         jsonb default '{}'::jsonb,
  excerpt       jsonb default '{}'::jsonb,
  body          jsonb default '{}'::jsonb
);

create table if not exists reviews (
  id           uuid primary key default gen_random_uuid(),
  author_name  text not null,
  rating       int not null default 5 check (rating between 1 and 5),
  lang         text default 'fr',
  source       text default 'google',
  text         text not null,
  vehicle_id   uuid references vehicles (id) on delete set null,
  published    boolean default false,
  is_sample    boolean default false,
  created_at   timestamptz default now()
);

-- ---------------------------------------------------------------- bookings
create table if not exists bookings (
  id               uuid primary key default gen_random_uuid(),
  reference        text unique not null,
  vehicle_id       uuid references vehicles (id) on delete set null,
  status           text not null default 'pending' check (status in ('pending','confirmed','active','completed','cancelled')),
  locale           text default 'fr',
  source           text default 'web',
  pickup_key       text,
  pickup_label     text,
  dropoff_key      text,
  dropoff_label    text,
  start_at         timestamptz not null,
  end_at           timestamptz not null,
  days             int,
  flight_number    text,
  extras           jsonb default '[]'::jsonb,
  customer_name    text not null,
  customer_phone   text not null,
  customer_email   text,
  customer_country text,
  driver_age       int,
  notes            text,
  price_breakdown  jsonb default '{}'::jsonb,
  total_mad        numeric,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists bookings_status_idx on bookings (status, created_at desc);

-- ---------------------------------------------------------------- RLS
alter table settings  enable row level security;
alter table vehicles  enable row level security;
alter table seasons   enable row level security;
alter table extras    enable row level security;
alter table locations enable row level security;
alter table faqs      enable row level security;
alter table posts     enable row level security;
alter table reviews   enable row level security;
alter table bookings  enable row level security;

-- Admin = JWT app_metadata.role = 'admin' (set via SQL below or the Auth dashboard)
create or replace function is_admin() returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- Public reads (anon + authenticated) on published / active rows
create policy "public read settings"  on settings  for select using (true);
create policy "public read vehicles"  on vehicles  for select using (published = true or is_admin());
create policy "public read seasons"   on seasons   for select using (true);
create policy "public read extras"    on extras    for select using (true);
create policy "public read locations" on locations for select using (true);
create policy "public read faqs"      on faqs      for select using (published = true or is_admin());
create policy "public read posts"     on posts     for select using (published = true or is_admin());
create policy "public read reviews"   on reviews   for select using (published = true or is_admin());

-- Customers can create a booking request; only admins can read/update them
create policy "public insert bookings" on bookings for insert with check (status = 'pending');
create policy "admin read bookings"    on bookings for select using (is_admin());
create policy "admin update bookings"  on bookings for update using (is_admin());

-- Admin writes everywhere else
create policy "admin write settings"  on settings  for all using (is_admin()) with check (is_admin());
create policy "admin write vehicles"  on vehicles  for all using (is_admin()) with check (is_admin());
create policy "admin write seasons"   on seasons   for all using (is_admin()) with check (is_admin());
create policy "admin write extras"    on extras    for all using (is_admin()) with check (is_admin());
create policy "admin write locations" on locations for all using (is_admin()) with check (is_admin());
create policy "admin write faqs"      on faqs      for all using (is_admin()) with check (is_admin());
create policy "admin write posts"     on posts     for all using (is_admin()) with check (is_admin());
create policy "admin write reviews"   on reviews   for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- storage
-- Public bucket for vehicle photos (create in Storage UI or via SQL):
insert into storage.buckets (id, name, public) values ('vehicles', 'vehicles', true) on conflict do nothing;
create policy "public read vehicle photos" on storage.objects for select using (bucket_id = 'vehicles');
create policy "admin upload vehicle photos" on storage.objects for insert with check (bucket_id = 'vehicles' and is_admin());
create policy "admin delete vehicle photos" on storage.objects for delete using (bucket_id = 'vehicles' and is_admin());

-- ---------------------------------------------------------------- grant admin role
-- After creating the admin user in Authentication > Users, run (replace the e-mail):
-- update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb where email = 'admin@diabcar.ma';
