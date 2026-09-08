-- ============================================================================
-- 0012 — fleet, operations, content, prices, settings, observability
--        (plan 7.1, 6.2, 9.6, 2.5)
--
-- Run after 0011. Idempotent: every statement is `create or replace`,
-- `if not exists`, or guarded.
--
-- The through-line of this file is the CLOSED LOOP:
--
--   pickup  → reservation `active`, unit `rented`,  event PICKUP
--   return  → reservation `returned`, unit `cleaning`, event RETURN
--             + a cleaning BLOCK, which is what actually removes the car from
--               public availability
--   ready   → unit `available`, the cleaning block closed, event
--             CLEANING_COMPLETED → the car sells again, with no cache to bust
--             and no button anywhere that says "publish".
--
-- Why a block and not the status: `unit_is_bookable()` (0008) is period-blind —
-- it excludes maintenance | blocked | out_of_service for EVERY window, past and
-- future. Adding `cleaning` there would take a car being wiped down this
-- afternoon off sale for next month too. Availability is a question about a
-- PERIOD, so the answer has to be period-shaped: a `blocks` row. The status is
-- the operational badge staff see; the block is the part the engine reads.
-- ============================================================================

-- ---------------------------------------------------------------- settings
-- New knobs, all with defaults, so a settings row that predates this file
-- keeps working unchanged.
alter table settings add column if not exists auto_expire_hours    int not null default 12;
alter table settings add column if not exists cleaning_minutes     int not null default 120;
alter table settings add column if not exists deposit_by_category  jsonb not null default '{}'::jsonb;
alter table settings add column if not exists sla                  jsonb not null default '{}'::jsonb;   -- i18n
alter table settings add column if not exists last_backup_at       timestamptz;
alter table settings add column if not exists payment_methods      jsonb not null default '["cash", "card"]'::jsonb;

-- Rule 11, enforced where it cannot be bypassed.
--
-- `google_rating`, `google_review_count` and `founded_year` are CLAIMS. Until
-- someone ticks the box that says they were checked against the source, they
-- must not reach a visitor — and "the component checks a flag" is not good
-- enough, because the next component forgets. So the public VIEW nulls them,
-- and every public read goes through that view.
alter table settings add column if not exists verified_claims jsonb not null default '{}'::jsonb;

comment on column settings.verified_claims is
  'Which public claims have been verified against their source, e.g. {"googleRating": true, "reviewCount": true, "foundedYear": false}. public_settings NULLs any claim not marked true.';

-- ---------------------------------------------------------------- reservations
-- The money actually taken at the counter. Snapshot, like `quote`: what was
-- handed over, in what form, by whom. Audited by the existing reservations
-- trigger, so a changed amount always carries a before/after and a reason.
alter table reservations add column if not exists payment jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------- vehicle_photos
-- One row per PHOTO, not per variant. The shape deliberately mirrors
-- public/images/cars/manifest.json so `CarImage` can read a local build-time
-- manifest or a Storage-backed row with the same code (plan 2.5).
--
-- The variants themselves are produced in the BROWSER by the admin uploader
-- (canvas → WebP + a JPEG fallback) and uploaded straight to the `vehicles`
-- bucket. No server-side image processing anywhere: rule 9 forbids native
-- modules at runtime, and a per-request image service is not free on Workers.
do $$ begin
  create type photo_angle as enum ('front', 'side', 'rear', 'interior', 'dash');
exception when duplicate_object then null; end $$;

create table if not exists vehicle_photos (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references vehicles (id) on delete cascade,
  angle       photo_angle not null default 'front',
  -- Everything but the `-<width>.<ext>` suffix, e.g.
  -- "vehicles/dacia-logan/front-9f3a2b". One base, many files.
  base_path   text not null,
  widths      int[]  not null default '{}',
  formats     text[] not null default '{webp,jpg}',
  width       int,          -- intrinsic size of the master, for the aspect box
  height      int,
  blur        text,         -- 24 px data: URI, painted before the bytes land
  alt         jsonb not null default '{}'::jsonb,   -- i18n, plan 8 / rule 8
  sort        int not null default 100,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);
create index if not exists vehicle_photos_vehicle_idx on vehicle_photos (vehicle_id, sort, created_at);
create unique index if not exists vehicle_photos_base_key on vehicle_photos (base_path);

alter table vehicle_photos enable row level security;

-- Public read: the fleet page renders these to anonymous visitors. There is
-- nothing private in a photo of a car for sale.
drop policy if exists "vehicle photos public read" on vehicle_photos;
drop policy if exists "vehicle photos manage" on vehicle_photos;
create policy "vehicle photos public read" on vehicle_photos for select using (true);
create policy "vehicle photos manage" on vehicle_photos for all to authenticated
  using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------- public_settings
-- Recreated to carry the new fields AND to strip unverified claims.
-- Still SECURITY DEFINER (the fix from prompt 05): the view must be able to
-- read `settings`, which anon cannot.
drop view if exists public_settings;
create view public_settings
with (security_invoker = false) as
select
  s.id, s.name, s.legal_name, s.tagline, s.phone_primary, s.phone_landline,
  s.fax, s.whatsapp, s.email, s.address_line, s.city, s.postal_code, s.country,
  s.lat, s.lng, s.google_maps_url, s.gbp_url, s.facebook_url, s.instagram_url,
  s.tiktok_url, s.hours, s.airport_service24h, s.rc, s.ice, s.capital_mad,
  s.eur_rate, s.min_age, s.premium_min_age, s.min_license_years,
  s.fuel_policy, s.free_cancellation_hours, s.deposit_release_days,
  s.pricing_tiers, s.monthly_from, s.airport_delivery_fee, s.city_delivery_fee,
  s.one_way_fee, s.cndp_receipt, s.services, s.booking_channels,
  s.google_review_url, s.response_time, s.ga_id,
  s.deposit_by_category, s.sla, s.payment_methods,

  -- The three claims, gated. `verified_claims -> 'x' = 'true'` is deliberately
  -- strict: absent, null, "yes" and false all read as NOT verified.
  case when s.verified_claims -> 'googleRating' = 'true'::jsonb then s.google_rating end       as google_rating,
  case when s.verified_claims -> 'reviewCount'  = 'true'::jsonb then s.google_review_count end as google_review_count,
  case when s.verified_claims -> 'foundedYear'  = 'true'::jsonb then s.founded_year end        as founded_year
from settings s;

grant select on public_settings to anon, authenticated;

-- ---------------------------------------------------------------- audit reach
-- Pricing and content tables join the audited set. `customers` stays out on
-- purpose (see 0011): every public booking inserts one, and copying names and
-- phone numbers into audit_log each time would duplicate the customer table.
do $$
declare t text;
begin
  foreach t in array array['seasons', 'extras', 'locations', 'faqs', 'reviews', 'posts', 'vehicle_photos']
  loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format(
      'create trigger %I after insert or update or delete on %I for each row execute function audit_row()',
      t || '_audit', t
    );
  end loop;
end $$;

-- `seasons`, `extras` and `locations` are uuid-keyed, so audit_row()'s uuid
-- cast is safe for them. (settings is int-keyed and already handled by
-- row_key in 0003.)

-- ============================================================================
-- FLEET
-- ============================================================================

-- ---------------------------------------------------------------- save_vehicle
-- The whole model in one call: content in four languages, specs, purpose tags,
-- prices, publish. Restricted to owner|manager because the payload carries the
-- price — an agent must not be able to change what a car costs (plan 7.2).
create or replace function save_vehicle(p jsonb, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v    vehicles%rowtype;
  old  vehicles%rowtype;
begin
  if not can_manage_pricing() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if coalesce(btrim(p ->> 'slug'), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'SLUG_REQUIRED');
  end if;

  /* PATCH, not replace.
     Every field below falls back to the CURRENT row before it falls back to a
     literal default, so a form that does not know about a column cannot blank
     it. Without this, an older editor that never heard of `purpose_tags` or
     `prep_buffer_minutes` would silently reset both every time somebody fixed
     a typo in the description — and the prep buffer is load-bearing: it is
     what stops the same car being promised thirty minutes after a return. */
  if v_id is not null then
    select * into old from vehicles where id = v_id;
  end if;

  perform set_reason(coalesce(nullif(btrim(p_reason), ''), 'modification du modèle'));

  insert into vehicles as t (
    id, slug, brand, model, year, category, transmission, fuel,
    seats, doors, luggage, ac, price_per_day, deposit, mileage_limit, min_age,
    image, features, description, published, is_published, featured, sort_order,
    prep_buffer_minutes, min_days, purpose_tags, photo_folder,
    price_high_season, price_verified
  )
  values (
    coalesce(v_id, gen_random_uuid()),
    p ->> 'slug',
    coalesce(nullif(p ->> 'brand', ''), old.brand, ''),
    coalesce(nullif(p ->> 'model', ''), old.model, ''),
    coalesce(nullif(p ->> 'year', '')::int, old.year, extract(year from now())::int),
    coalesce(nullif(p ->> 'category', ''), old.category, 'economy'),
    coalesce(nullif(p ->> 'transmission', ''), old.transmission, 'manual'),
    coalesce(nullif(p ->> 'fuel', ''), old.fuel, 'petrol'),
    coalesce(nullif(p ->> 'seats', '')::int, old.seats, 5),
    coalesce(nullif(p ->> 'doors', '')::int, old.doors, 5),
    coalesce(nullif(p ->> 'luggage', '')::int, old.luggage, 2),
    coalesce((p ->> 'ac')::boolean, old.ac, true),
    coalesce(nullif(p ->> 'pricePerDay', '')::numeric, old.price_per_day, 0),
    coalesce(nullif(p ->> 'deposit', '')::numeric, old.deposit, 0),
    -- An explicitly present-but-empty mileageLimit means "illimité" and must
    -- be allowed to clear the column; an ABSENT key keeps what is there.
    case when p ? 'mileageLimit' then nullif(p ->> 'mileageLimit', '')::int else old.mileage_limit end,
    coalesce(nullif(p ->> 'minAge', '')::int, old.min_age, 21),
    coalesce(nullif(p ->> 'image', ''), old.image, 'berline'),
    coalesce(p -> 'features', old.features, '[]'::jsonb),
    coalesce(p -> 'description', old.description, '{}'::jsonb),
    coalesce((p ->> 'published')::boolean, old.is_published, false),
    coalesce((p ->> 'published')::boolean, old.is_published, false),
    coalesce((p ->> 'featured')::boolean, old.featured, false),
    coalesce(nullif(p ->> 'sortOrder', '')::int, old.sort_order, 100),
    coalesce(nullif(p ->> 'prepBufferMinutes', '')::int, old.prep_buffer_minutes, 120),
    coalesce(nullif(p ->> 'minDays', '')::int, old.min_days, 1),
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(p -> 'purposeTags') as value),
      old.purpose_tags,
      '{}'::text[]
    ),
    coalesce(nullif(p ->> 'photoFolder', ''), old.photo_folder),
    coalesce(nullif(p ->> 'priceHighSeason', '')::numeric, old.price_high_season),
    coalesce((p ->> 'priceVerified')::boolean, old.price_verified, false)
  )
  on conflict (id) do update set
    slug = excluded.slug, brand = excluded.brand, model = excluded.model,
    year = excluded.year, category = excluded.category,
    transmission = excluded.transmission, fuel = excluded.fuel,
    seats = excluded.seats, doors = excluded.doors, luggage = excluded.luggage,
    ac = excluded.ac, price_per_day = excluded.price_per_day,
    deposit = excluded.deposit, mileage_limit = excluded.mileage_limit,
    min_age = excluded.min_age, image = excluded.image,
    features = excluded.features, description = excluded.description,
    is_published = excluded.is_published, featured = excluded.featured,
    sort_order = excluded.sort_order,
    prep_buffer_minutes = excluded.prep_buffer_minutes,
    min_days = excluded.min_days, purpose_tags = excluded.purpose_tags,
    photo_folder = excluded.photo_folder,
    price_high_season = excluded.price_high_season,
    price_verified = excluded.price_verified,
    updated_at = now()
  returning * into v;

  return jsonb_build_object('ok', true, 'vehicle', to_jsonb(v));
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'SLUG_TAKEN');
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'INVALID_VALUE', 'detail', sqlerrm);
end $$;

-- ---------------------------------------------------------------- save_unit
create or replace function save_unit(p jsonb, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  u    units%rowtype;
  old  units%rowtype;
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if v_id is not null then
    select * into old from units where id = v_id;
  end if;
  if nullif(p ->> 'vehicleId', '') is null and old.vehicle_id is null then
    return jsonb_build_object('ok', false, 'error', 'VEHICLE_REQUIRED');
  end if;

  /* Patch, for the same reason save_vehicle does: the mileage and the fuel
     level are written by the checklists, and a fleet form that reposts a stale
     copy of the row must not roll them back. */
  perform set_reason(coalesce(nullif(btrim(p_reason), ''), 'modification de l''unité'));

  insert into units as t (
    id, vehicle_id, plate, vin, color, year, mileage_km, fuel_pct,
    status, current_location_id, notes
  )
  values (
    coalesce(v_id, gen_random_uuid()),
    coalesce(nullif(p ->> 'vehicleId', '')::uuid, old.vehicle_id),
    coalesce(nullif(btrim(coalesce(p ->> 'plate', '')), ''), old.plate),
    coalesce(nullif(btrim(coalesce(p ->> 'vin', '')), ''), old.vin),
    coalesce(nullif(btrim(coalesce(p ->> 'color', '')), ''), old.color),
    coalesce(nullif(p ->> 'year', '')::int, old.year),
    coalesce(nullif(p ->> 'mileageKm', '')::int, old.mileage_km, 0),
    coalesce(nullif(p ->> 'fuelPct', '')::int, old.fuel_pct),
    coalesce(nullif(p ->> 'status', ''), old.status::text, 'available')::unit_status,
    case when p ? 'currentLocationId' then nullif(p ->> 'currentLocationId', '')::uuid else old.current_location_id end,
    case when p ? 'notes' then nullif(btrim(coalesce(p ->> 'notes', '')), '') else old.notes end
  )
  on conflict (id) do update set
    vehicle_id = excluded.vehicle_id, plate = excluded.plate, vin = excluded.vin,
    color = excluded.color, year = excluded.year,
    mileage_km = excluded.mileage_km, fuel_pct = excluded.fuel_pct,
    status = excluded.status, current_location_id = excluded.current_location_id,
    notes = excluded.notes, updated_at = now()
  returning * into u;

  return jsonb_build_object('ok', true, 'unit', to_jsonb(u));
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'PLATE_TAKEN');
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'INVALID_VALUE', 'detail', sqlerrm);
end $$;

-- ---------------------------------------------------------------- set_unit_status
-- A status change is the one unit write that always needs a reason: it is what
-- takes a car off sale, and six weeks later somebody will ask why.
create or replace function set_unit_status(p_unit uuid, p_status unit_status, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  u units%rowtype;
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
  end if;

  select * into u from units where id = p_unit for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  -- A car that is out with a customer cannot be sent to the workshop from a
  -- dropdown; the return has to be recorded first.
  if u.status = 'rented' and p_status in ('maintenance', 'blocked', 'out_of_service') then
    return jsonb_build_object('ok', false, 'error', 'UNIT_OUT', 'status', u.status);
  end if;

  perform set_reason(p_reason);
  update units set status = p_status, updated_at = now() where id = p_unit;

  return jsonb_build_object('ok', true, 'from', u.status, 'to', p_status);
end $$;

-- ---------------------------------------------------------------- photos
create or replace function save_vehicle_photo(p jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  ph vehicle_photos%rowtype;
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if nullif(p ->> 'vehicleId', '') is null or coalesce(btrim(p ->> 'basePath'), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_VALUE');
  end if;

  perform set_reason('photo véhicule');

  insert into vehicle_photos as t (
    id, vehicle_id, angle, base_path, widths, formats, width, height, blur, alt, sort, created_by
  )
  values (
    coalesce(nullif(p ->> 'id', '')::uuid, gen_random_uuid()),
    (p ->> 'vehicleId')::uuid,
    coalesce(nullif(p ->> 'angle', ''), 'front')::photo_angle,
    p ->> 'basePath',
    coalesce(
      (select array_agg(value::int) from jsonb_array_elements_text(coalesce(p -> 'widths', '[]'::jsonb)) as value),
      '{}'::int[]
    ),
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(coalesce(p -> 'formats', '["webp","jpg"]'::jsonb)) as value),
      '{webp,jpg}'::text[]
    ),
    nullif(p ->> 'width', '')::int,
    nullif(p ->> 'height', '')::int,
    nullif(p ->> 'blur', ''),
    coalesce(p -> 'alt', '{}'::jsonb),
    coalesce((p ->> 'sort')::int, 100),
    auth.uid()
  )
  on conflict (id) do update set
    angle = excluded.angle, base_path = excluded.base_path,
    widths = excluded.widths, formats = excluded.formats,
    width = excluded.width, height = excluded.height, blur = excluded.blur,
    alt = excluded.alt, sort = excluded.sort
  returning * into ph;

  return jsonb_build_object('ok', true, 'photo', to_jsonb(ph));
end $$;

create or replace function delete_vehicle_photo(p_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  ph vehicle_photos%rowtype;
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  perform set_reason('suppression photo');
  delete from vehicle_photos where id = p_id returning * into ph;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  -- The caller removes the objects from Storage; the row is the index, the
  -- bucket is the content, and orphaned bytes are cheaper than a broken page.
  return jsonb_build_object('ok', true, 'basePath', ph.base_path, 'widths', to_jsonb(ph.widths), 'formats', to_jsonb(ph.formats));
end $$;

-- Reorder = one write per photo in one transaction. The FIRST photo of the
-- first angle is the card image (plan 7.1), so order is a business decision,
-- not a preference.
create or replace function reorder_vehicle_photos(p_vehicle uuid, p_ids uuid[])
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moved int := 0;
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  perform set_reason('ordre des photos');

  update vehicle_photos p
     set sort = x.ord
    from (select id, ordinality::int * 10 as ord
            from unnest(p_ids) with ordinality as t(id, ordinality)) x
   where p.id = x.id and p.vehicle_id = p_vehicle;
  get diagnostics moved = row_count;

  return jsonb_build_object('ok', true, 'moved', moved);
end $$;

-- ---------------------------------------------------------------- unit dossier
-- Everything the unit page shows, in one staff-gated round trip.
create or replace function unit_dossier(p_unit uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'unit', (
      select jsonb_build_object(
        'id', u.id, 'plate', u.plate, 'vin', u.vin, 'color', u.color, 'year', u.year,
        'mileageKm', u.mileage_km, 'fuelPct', u.fuel_pct, 'status', u.status,
        'notes', u.notes, 'createdAt', u.created_at, 'updatedAt', u.updated_at,
        'vehicleId', v.id, 'vehicle', v.brand || ' ' || v.model, 'slug', v.slug,
        'currentLocationId', l.id, 'location', coalesce(l.name ->> 'fr', l.key)
      )
      from units u
      join vehicles v on v.id = u.vehicle_id
      left join locations l on l.id = u.current_location_id
      where u.id = p_unit
    ),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'type', e.type, 'at', e.at, 'mileageKm', e.mileage_km,
        'fuelPct', e.fuel_pct, 'notes', e.notes, 'reason', e.reason,
        'photos', to_jsonb(e.photos), 'signaturePath', e.signature_path,
        'condition', e.condition, 'data', e.data,
        'reservationId', e.reservation_id, 'reference', r.reference
      ) order by e.at desc)
      from vehicle_events e
      left join reservations r on r.id = e.reservation_id
      where e.unit_id = p_unit
      limit 200
    ), '[]'::jsonb),
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'reference', r.reference, 'status', r.status,
        'startAt', r.start_at, 'endAt', r.end_at,
        'total', (r.quote ->> 'total')::numeric
      ) order by r.start_at desc)
      from reservations r where r.unit_id = p_unit
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'kind', b.kind, 'reason', b.reason,
        'startAt', lower(b.period), 'endAt', upper(b.period)
      ) order by lower(b.period) desc)
      from blocks b where b.unit_id = p_unit
    ), '[]'::jsonb)
  )
  where is_staff();
$$;

-- ============================================================================
-- OPERATIONS — the closed loop
-- ============================================================================

-- ---------------------------------------------------------------- operations_day
create or replace function operations_day(p_day date)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with win as (
    select (p_day::text || ' 00:00:00+01')::timestamptz as d0,
           (p_day::text || ' 00:00:00+01')::timestamptz + interval '1 day' as d1
  ),
  rows as (
    select
      r.id, r.reference, r.status, r.start_at, r.end_at, r.unit_id,
      v.brand || ' ' || v.model as vehicle,
      u.plate,
      trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as customer,
      c.phone, c.locale,
      (r.quote ->> 'total')::numeric as total,
      exists (select 1 from vehicle_events e where e.reservation_id = r.id and e.type = 'PICKUP') as picked_up,
      exists (select 1 from vehicle_events e where e.reservation_id = r.id and e.type = 'RETURN')  as returned
    from reservations r
    join vehicles v on v.id = r.vehicle_id
    left join units u on u.id = r.unit_id
    left join customers c on c.id = r.customer_id
    where r.status not in ('cancelled', 'no_show')
  )
  select jsonb_build_object(
    'day', p_day,
    'departures', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.start_at)
      from rows x, win w where x.start_at >= w.d0 and x.start_at < w.d1
    ), '[]'::jsonb),
    'returns', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.end_at)
      from rows x, win w where x.end_at >= w.d0 and x.end_at < w.d1
    ), '[]'::jsonb),
    -- Anything still out whose return time has passed, whatever day it was
    -- due: an overdue car is today's problem regardless of the calendar.
    'overdue', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.end_at)
      from rows x where x.status = 'active' and x.end_at < now()
    ), '[]'::jsonb),
    'toPrepare', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unitId', u.id, 'plate', u.plate, 'status', u.status,
        'vehicle', v.brand || ' ' || v.model,
        'since', u.updated_at
      ) order by u.updated_at)
      from units u join vehicles v on v.id = u.vehicle_id
      where u.status in ('cleaning', 'returned')
    ), '[]'::jsonb)
  )
  where is_staff();
$$;

-- ---------------------------------------------------------------- complete_pickup
-- Handing the keys over. One transaction: the event, the reservation, the unit
-- and the money, or none of it.
--
-- The three ticks are checked HERE and not only in the form, because they are
-- the agency's evidence that identity and documents were seen — an admin that
-- accepted a pickup without them would be worse than one that had no
-- checklist at all.
create or replace function complete_pickup(p_id uuid, p jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r        reservations%rowtype;
  u        units%rowtype;
  v_event  uuid;
  v_reason text := coalesce(nullif(btrim(p ->> 'reason'), ''), 'départ (remise des clés)');
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select * into r from reservations where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if r.status not in ('confirmed', 'ready') then
    return jsonb_build_object('ok', false, 'error', 'ILLEGAL_TRANSITION',
      'from', r.status, 'allowed', to_jsonb(reservation_next_states(r.status)));
  end if;
  if r.unit_id is null then
    return jsonb_build_object('ok', false, 'error', 'UNIT_REQUIRED');
  end if;
  if not (coalesce((p ->> 'identityChecked')::boolean, false)
      and coalesce((p ->> 'documentsChecked')::boolean, false)
      and coalesce((p ->> 'unitChecked')::boolean, false)) then
    return jsonb_build_object('ok', false, 'error', 'CHECKS_INCOMPLETE');
  end if;

  select * into u from units where id = r.unit_id for update;

  perform set_reason(v_reason);

  insert into vehicle_events (
    unit_id, reservation_id, type, actor_id, location_id,
    mileage_km, fuel_pct, condition, notes, photos, signature_path, data, reason
  ) values (
    r.unit_id, r.id, 'PICKUP', auth.uid(),
    coalesce(nullif(p ->> 'locationId', '')::uuid, r.pickup_location_id),
    nullif(p ->> 'mileageKm', '')::int,
    nullif(p ->> 'fuelPct', '')::int,
    coalesce(p -> 'condition', '{}'::jsonb),
    nullif(btrim(coalesce(p ->> 'notes', '')), ''),
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(coalesce(p -> 'photos', '[]'::jsonb)) as value),
      '{}'::text[]
    ),
    nullif(p ->> 'signaturePath', ''),
    jsonb_build_object(
      'identityChecked', true, 'documentsChecked', true, 'unitChecked', true,
      'payment', coalesce(p -> 'payment', '{}'::jsonb)
    ),
    v_reason
  ) returning id into v_event;

  -- Damage found before the customer drives off, so it is never charged to them.
  perform log_damages(r.unit_id, r.id, p -> 'damages', v_reason);

  -- confirmed → ready → active. Both edges are legal in the state machine
  -- (0010); the counter should not have to click twice to say "they left".
  --
  -- The flag stops log_reservation_transition() (0004) writing a second, bare
  -- PICKUP row next to the one above.
  perform set_config('app.skip_transition_event', 'on', true);
  update reservations
     set status  = 'active',
         payment = case when p ? 'payment' then coalesce(p -> 'payment', '{}'::jsonb) else payment end,
         updated_at = now()
   where id = p_id;
  perform set_config('app.skip_transition_event', '', true);

  update units
     set status              = 'rented',
         mileage_km          = coalesce(nullif(p ->> 'mileageKm', '')::int, mileage_km),
         fuel_pct            = coalesce(nullif(p ->> 'fuelPct', '')::int, fuel_pct),
         current_location_id = coalesce(nullif(p ->> 'locationId', '')::uuid, current_location_id),
         updated_at          = now()
   where id = r.unit_id;

  return jsonb_build_object('ok', true, 'eventId', v_event, 'reference', r.reference, 'status', 'active');
end $$;

-- ---------------------------------------------------------------- damages helper
create or replace function log_damages(p_unit uuid, p_reservation uuid, p_damages jsonb, p_reason text)
returns int
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  d jsonb;
  n int := 0;
begin
  if p_damages is null or jsonb_typeof(p_damages) <> 'array' then
    return 0;
  end if;
  for d in select * from jsonb_array_elements(p_damages)
  loop
    insert into vehicle_events (
      unit_id, reservation_id, type, actor_id, condition, notes, photos, data, reason
    ) values (
      p_unit, p_reservation, 'DAMAGE_REPORTED', auth.uid(),
      jsonb_build_object('zone', d ->> 'zone', 'type', d ->> 'type', 'severity', d ->> 'severity'),
      nullif(btrim(coalesce(d ->> 'notes', '')), ''),
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(coalesce(d -> 'photos', '[]'::jsonb)) as value),
        '{}'::text[]
      ),
      d,
      p_reason
    );
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- complete_return
-- The car comes back. This is the half of the loop that has to move public
-- availability without anybody pressing "publish".
create or replace function complete_return(p_id uuid, p jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r          reservations%rowtype;
  v_event    uuid;
  v_damages  int := 0;
  v_minutes  int;
  v_blocked     boolean := false;
  v_block_error text;
  v_reason   text := coalesce(nullif(btrim(p ->> 'reason'), ''), 'retour du véhicule');
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select * into r from reservations where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if r.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'ILLEGAL_TRANSITION',
      'from', r.status, 'allowed', to_jsonb(reservation_next_states(r.status)));
  end if;
  if r.unit_id is null then
    return jsonb_build_object('ok', false, 'error', 'UNIT_REQUIRED');
  end if;

  select coalesce(cleaning_minutes, 120) into v_minutes from settings where id = 1;
  v_minutes := coalesce(v_minutes, 120);

  perform set_reason(v_reason);

  insert into vehicle_events (
    unit_id, reservation_id, type, actor_id, location_id,
    mileage_km, fuel_pct, condition, notes, photos, signature_path, data, reason
  ) values (
    r.unit_id, r.id, 'RETURN', auth.uid(),
    coalesce(nullif(p ->> 'locationId', '')::uuid, r.dropoff_location_id),
    nullif(p ->> 'mileageKm', '')::int,
    nullif(p ->> 'fuelPct', '')::int,
    coalesce(p -> 'condition', '{}'::jsonb),
    nullif(btrim(coalesce(p ->> 'notes', '')), ''),
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(coalesce(p -> 'photos', '[]'::jsonb)) as value),
      '{}'::text[]
    ),
    nullif(p ->> 'signaturePath', ''),
    coalesce(p -> 'data', '{}'::jsonb),
    v_reason
  ) returning id into v_event;

  v_damages := log_damages(r.unit_id, r.id, p -> 'damages', v_reason);

  perform set_config('app.skip_transition_event', 'on', true);
  update reservations set status = 'returned', updated_at = now() where id = p_id;
  perform set_config('app.skip_transition_event', '', true);

  update units
     set status              = 'cleaning',
         mileage_km          = coalesce(nullif(p ->> 'mileageKm', '')::int, mileage_km),
         fuel_pct            = coalesce(nullif(p ->> 'fuelPct', '')::int, fuel_pct),
         current_location_id = coalesce(nullif(p ->> 'locationId', '')::uuid, current_location_id),
         updated_at          = now()
   where id = r.unit_id;

  -- THE BIT THAT MOVES THE PUBLIC SITE.
  --
  -- Wrapped, because a return must never fail. If the block cannot be written
  -- — the exclusion constraint already has one there, or the trigger refuses it
  -- because a confirmed booking starts inside the cleaning window — the car
  -- still came back and the event still stands; the answer just says the block
  -- is missing so the operator can see it.
  begin
    insert into blocks (unit_id, kind, period, reason, created_by)
    values (r.unit_id, 'cleaning',
            tstzrange(now(), now() + make_interval(mins => v_minutes), '[)'),
            'nettoyage après ' || r.reference, auth.uid());
    v_blocked := true;
  exception when others then
    v_blocked := false;
    v_block_error := sqlerrm;   -- reported, never swallowed
  end;

  insert into notifications (level, title, body, href)
  values ('action',
          'Véhicule à préparer',
          coalesce((select 'Plaque ' || u.plate from units u where u.id = r.unit_id), 'Unité') ||
            ' — retour ' || r.reference,
          '/flotte/unites/' || r.unit_id);

  return jsonb_build_object(
    'ok', true, 'eventId', v_event, 'reference', r.reference,
    'status', 'returned', 'damages', v_damages,
    'cleaningBlock', v_blocked, 'cleaningMinutes', v_minutes, 'cleaningBlockError', v_block_error
  );
end $$;

-- ---------------------------------------------------------------- mark_unit_ready
-- « Marquer prête ». Closes the cleaning block, which is what puts the car back
-- on sale. Nothing else has to happen: search_availability() reads blocks.
create or replace function mark_unit_ready(p_unit uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  u        units%rowtype;
  v_closed int := 0;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'véhicule prêt');
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select * into u from units where id = p_unit for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if u.status = 'rented' then
    return jsonb_build_object('ok', false, 'error', 'UNIT_OUT');
  end if;

  perform set_reason(v_reason);

  insert into vehicle_events (unit_id, type, actor_id, mileage_km, fuel_pct, notes, reason)
  values (p_unit, 'CLEANING_COMPLETED', auth.uid(), u.mileage_km, u.fuel_pct, null, v_reason);

  update units set status = 'available', updated_at = now() where id = p_unit;

  -- Every live cleaning or transfer block on this unit ends now. Deleted
  -- rather than truncated: a zero-length range is not a fact anyone needs, and
  -- the audit trigger on `blocks` records the deletion with the reason.
  delete from blocks
   where unit_id = p_unit
     and kind in ('cleaning', 'transfer')
     and upper(period) > now();
  get diagnostics v_closed = row_count;

  return jsonb_build_object('ok', true, 'from', u.status, 'blocksClosed', v_closed);
end $$;

-- ---------------------------------------------------------------- refresh_cleaning_blocks
-- Safety net for the one honest weakness of a bounded cleaning block: if a car
-- sits dirty longer than `cleaning_minutes` and nobody presses « Marquer prête »,
-- the block expires and the car would quietly go back on sale.
--
-- Called by the reminders cron. If the cron never runs, the exposure is bounded
-- by the same prep buffer the whole engine already trusts — stated, not hidden.
create or replace function refresh_cleaning_blocks()
returns int
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_minutes int;
  n int := 0;
  u record;
begin
  select coalesce(cleaning_minutes, 120) into v_minutes from settings where id = 1;
  v_minutes := coalesce(v_minutes, 120);

  for u in
    select id from units
     where status = 'cleaning'
       and not exists (
         select 1 from blocks b
          where b.unit_id = units.id and b.kind = 'cleaning' and upper(b.period) > now()
       )
  loop
    begin
      insert into blocks (unit_id, kind, period, reason)
      values (u.id, 'cleaning', tstzrange(now(), now() + make_interval(mins => v_minutes), '[)'),
              'nettoyage en cours');
      n := n + 1;
    exception when others then
      null;   -- a confirmed booking already owns that window; leave it alone
    end;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- expire_unconfirmed
-- Diab Car takes no online payment, so `pending` means "a human still has to
-- say yes". A request nobody answered holds a car hostage; after
-- `auto_expire_hours` it is released with a reason, never silently deleted.
create or replace function expire_unconfirmed_reservations()
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_hours int;
  v_ids   uuid[];
begin
  select coalesce(auto_expire_hours, 12) into v_hours from settings where id = 1;
  v_hours := coalesce(v_hours, 12);
  if v_hours <= 0 then
    return jsonb_build_object('ok', true, 'disabled', true, 'expired', 0);
  end if;

  perform set_reason('non confirmée');

  with doomed as (
    select id from reservations
     where status = 'pending'
       and created_at < now() - make_interval(hours => v_hours)
     for update
  ),
  done as (
    update reservations set status = 'cancelled', updated_at = now()
     where id in (select id from doomed)
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from done;

  if array_length(v_ids, 1) > 0 then
    insert into notifications (level, title, body, href)
    values ('info', 'Réservations expirées',
            array_length(v_ids, 1)::text || ' demande(s) non confirmée(s) annulée(s) après ' || v_hours || ' h',
            '/reservations?status=cancelled');
  end if;

  return jsonb_build_object('ok', true, 'expired', coalesce(array_length(v_ids, 1), 0), 'hours', v_hours);
end $$;

-- ============================================================================
-- PRICES, PLACES, CONTENT, SETTINGS
-- ============================================================================

create or replace function save_season(p jsonb, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare s seasons%rowtype;
begin
  if not can_manage_pricing() then return jsonb_build_object('ok', false, 'error', 'FORBIDDEN'); end if;
  if coalesce(btrim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED'); end if;
  if (p ->> 'endDate')::date < (p ->> 'startDate')::date then
    return jsonb_build_object('ok', false, 'error', 'BAD_DATES');
  end if;

  perform set_reason(p_reason);
  insert into seasons as t (id, name, start_date, end_date, multiplier, active)
  values (coalesce(nullif(p ->> 'id', '')::uuid, gen_random_uuid()),
          coalesce(nullif(btrim(p ->> 'name'), ''), 'Saison'),
          (p ->> 'startDate')::date, (p ->> 'endDate')::date,
          coalesce((p ->> 'multiplier')::numeric, 1),
          coalesce((p ->> 'active')::boolean, true))
  on conflict (id) do update set
    name = excluded.name, start_date = excluded.start_date, end_date = excluded.end_date,
    multiplier = excluded.multiplier, active = excluded.active
  returning * into s;
  return jsonb_build_object('ok', true, 'season', to_jsonb(s));
end $$;

create or replace function save_extra(p jsonb, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare e extras%rowtype;
begin
  if not can_manage_pricing() then return jsonb_build_object('ok', false, 'error', 'FORBIDDEN'); end if;
  if coalesce(btrim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED'); end if;
  if coalesce(btrim(p ->> 'key'), '') = '' then return jsonb_build_object('ok', false, 'error', 'KEY_REQUIRED'); end if;

  perform set_reason(p_reason);
  insert into extras as t (id, key, type, price, active, name)
  values (coalesce(nullif(p ->> 'id', '')::uuid, gen_random_uuid()),
          p ->> 'key',
          coalesce(nullif(p ->> 'type', ''), 'per_day'),
          coalesce((p ->> 'price')::numeric, 0),
          coalesce((p ->> 'active')::boolean, true),
          coalesce(p -> 'name', '{}'::jsonb))
  on conflict (id) do update set
    key = excluded.key, type = excluded.type, price = excluded.price,
    active = excluded.active, name = excluded.name
  returning * into e;
  return jsonb_build_object('ok', true, 'extra', to_jsonb(e));
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'KEY_TAKEN');
end $$;

create or replace function save_location(p jsonb, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare l locations%rowtype;
begin
  if not can_manage_pricing() then return jsonb_build_object('ok', false, 'error', 'FORBIDDEN'); end if;
  if coalesce(btrim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED'); end if;
  if coalesce(btrim(p ->> 'key'), '') = '' then return jsonb_build_object('ok', false, 'error', 'KEY_REQUIRED'); end if;

  perform set_reason(p_reason);
  insert into locations as t (
    id, key, slug, kind, city, name, address, lat, lng,
    delivery_fee_mad, hours, is_24h, sort, active
  )
  values (
    coalesce(nullif(p ->> 'id', '')::uuid, gen_random_uuid()),
    p ->> 'key',
    coalesce(nullif(p ->> 'slug', ''), p ->> 'key'),
    coalesce(nullif(p ->> 'kind', ''), 'custom')::location_kind,
    nullif(btrim(coalesce(p ->> 'city', '')), ''),
    coalesce(p -> 'name', '{}'::jsonb),
    nullif(btrim(coalesce(p ->> 'address', '')), ''),
    nullif(p ->> 'lat', '')::numeric,
    nullif(p ->> 'lng', '')::numeric,
    -- null, not 0: "sur devis" is an honest answer, an invented free delivery
    -- is not (rule 11).
    nullif(p ->> 'deliveryFeeMad', '')::numeric,
    coalesce(p -> 'hours', 'null'::jsonb),
    nullif(p ->> 'is24h', '')::boolean,
    coalesce((p ->> 'sort')::int, 100),
    coalesce((p ->> 'active')::boolean, true)
  )
  on conflict (id) do update set
    key = excluded.key, slug = excluded.slug, kind = excluded.kind, city = excluded.city,
    name = excluded.name, address = excluded.address, lat = excluded.lat, lng = excluded.lng,
    delivery_fee_mad = excluded.delivery_fee_mad, hours = excluded.hours,
    is_24h = excluded.is_24h, sort = excluded.sort, active = excluded.active
  returning * into l;
  return jsonb_build_object('ok', true, 'location', to_jsonb(l));
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'KEY_TAKEN');
end $$;

create or replace function save_settings(p jsonb, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare s settings%rowtype;
begin
  if not can_manage_pricing() then return jsonb_build_object('ok', false, 'error', 'FORBIDDEN'); end if;
  if coalesce(btrim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED'); end if;

  perform set_reason(p_reason);

  -- Column by column, coalescing to the current value, so a partial payload
  -- patches instead of blanking. A form that only edits the hours must not
  -- erase the ICE number.
  update settings set
    name                  = coalesce(nullif(p ->> 'name', ''), name),
    legal_name            = coalesce(p ->> 'legalName', legal_name),
    tagline               = coalesce(p -> 'tagline', tagline),
    phone_primary         = coalesce(p ->> 'phonePrimary', phone_primary),
    phone_secondary       = coalesce(p ->> 'phoneSecondary', phone_secondary),
    phone_landline        = coalesce(p ->> 'phoneLandline', phone_landline),
    whatsapp              = coalesce(p ->> 'whatsapp', whatsapp),
    email                 = coalesce(p ->> 'email', email),
    address_line          = coalesce(p ->> 'addressLine', address_line),
    city                  = coalesce(p ->> 'city', city),
    postal_code           = coalesce(p ->> 'postalCode', postal_code),
    lat                   = coalesce(nullif(p ->> 'lat', '')::double precision, lat),
    lng                   = coalesce(nullif(p ->> 'lng', '')::double precision, lng),
    google_maps_url       = coalesce(p ->> 'googleMapsUrl', google_maps_url),
    gbp_url               = coalesce(p ->> 'gbpUrl', gbp_url),
    facebook_url          = coalesce(p ->> 'facebookUrl', facebook_url),
    instagram_url         = coalesce(p ->> 'instagramUrl', instagram_url),
    tiktok_url            = coalesce(p ->> 'tiktokUrl', tiktok_url),
    hours                 = coalesce(p -> 'hours', hours),
    airport_service24h    = coalesce((p ->> 'airportService24h')::boolean, airport_service24h),
    rc                    = coalesce(p ->> 'rc', rc),
    ice                   = coalesce(p ->> 'ice', ice),
    capital_mad           = coalesce(nullif(p ->> 'capitalMad', '')::numeric, capital_mad),
    founded_year          = coalesce(nullif(p ->> 'foundedYear', '')::int, founded_year),
    eur_rate              = coalesce(nullif(p ->> 'eurRate', '')::numeric, eur_rate),
    airport_delivery_fee  = coalesce(nullif(p ->> 'airportDeliveryFee', '')::numeric, airport_delivery_fee),
    city_delivery_fee     = coalesce(nullif(p ->> 'cityDeliveryFee', '')::numeric, city_delivery_fee),
    one_way_fee           = coalesce(nullif(p ->> 'oneWayFee', '')::numeric, one_way_fee),
    min_age               = coalesce(nullif(p ->> 'minAge', '')::int, min_age),
    premium_min_age       = coalesce(nullif(p ->> 'premiumMinAge', '')::int, premium_min_age),
    min_license_years     = coalesce(nullif(p ->> 'minLicenseYears', '')::int, min_license_years),
    fuel_policy           = coalesce(p ->> 'fuelPolicy', fuel_policy),
    free_cancellation_hours = coalesce(nullif(p ->> 'freeCancellationHours', '')::int, free_cancellation_hours),
    deposit_release_days  = coalesce(nullif(p ->> 'depositReleaseDays', '')::int, deposit_release_days),
    pricing_tiers         = coalesce(p -> 'pricingTiers', pricing_tiers),
    monthly_from          = coalesce(p -> 'monthlyFrom', monthly_from),
    cndp_receipt          = coalesce(p ->> 'cndpReceipt', cndp_receipt),
    services              = coalesce(p -> 'services', services),
    booking_channels      = coalesce(p -> 'bookingChannels', booking_channels),
    google_rating         = coalesce(nullif(p ->> 'googleRating', '')::numeric, google_rating),
    google_review_count   = coalesce(nullif(p ->> 'googleReviewCount', '')::int, google_review_count),
    google_review_url     = coalesce(p ->> 'googleReviewUrl', google_review_url),
    response_time         = coalesce(p -> 'responseTime', response_time),
    ga_id                 = coalesce(p ->> 'gaId', ga_id),
    index_now_key         = coalesce(p ->> 'indexNowKey', index_now_key),
    auto_expire_hours     = coalesce(nullif(p ->> 'autoExpireHours', '')::int, auto_expire_hours),
    cleaning_minutes      = coalesce(nullif(p ->> 'cleaningMinutes', '')::int, cleaning_minutes),
    deposit_by_category   = coalesce(p -> 'depositByCategory', deposit_by_category),
    sla                   = coalesce(p -> 'sla', sla),
    payment_methods       = coalesce(p -> 'paymentMethods', payment_methods),
    verified_claims       = coalesce(p -> 'verifiedClaims', verified_claims),
    last_backup_at        = coalesce(nullif(p ->> 'lastBackupAt', '')::timestamptz, last_backup_at),
    updated_at            = now()
  where id = 1
  returning * into s;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'settings', to_jsonb(s));
end $$;

-- ---------------------------------------------------------------- content
create or replace function save_faq(p jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare f faqs%rowtype;
begin
  if not is_staff() then return jsonb_build_object('ok', false, 'error', 'FORBIDDEN'); end if;
  perform set_reason('contenu FAQ');

  insert into faqs as t (
    id, slug, category, city_slug, vehicle_id, question, short_answer, long_answer,
    answer, sort, sort_order, is_published, published
  )
  values (
    coalesce(nullif(p ->> 'id', '')::uuid, gen_random_uuid()),
    nullif(btrim(coalesce(p ->> 'slug', '')), ''),
    coalesce(nullif(p ->> 'category', ''), 'general'),
    nullif(btrim(coalesce(p ->> 'citySlug', '')), ''),
    nullif(p ->> 'vehicleId', '')::uuid,
    coalesce(p -> 'question', '{}'::jsonb),
    coalesce(p -> 'shortAnswer', '{}'::jsonb),
    coalesce(p -> 'longAnswer', '{}'::jsonb),
    coalesce(p -> 'longAnswer', '{}'::jsonb),
    coalesce((p ->> 'sort')::int, 100),
    coalesce((p ->> 'sort')::int, 100),
    coalesce((p ->> 'published')::boolean, false),
    coalesce((p ->> 'published')::boolean, false)
  )
  on conflict (id) do update set
    slug = excluded.slug, category = excluded.category, city_slug = excluded.city_slug,
    vehicle_id = excluded.vehicle_id, question = excluded.question,
    short_answer = excluded.short_answer, long_answer = excluded.long_answer,
    answer = excluded.answer, sort = excluded.sort, sort_order = excluded.sort_order,
    is_published = excluded.is_published, published = excluded.published
  returning * into f;
  return jsonb_build_object('ok', true, 'faq', to_jsonb(f));
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'SLUG_TAKEN');
end $$;

create or replace function save_review(p jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v reviews%rowtype;
begin
  if not is_staff() then return jsonb_build_object('ok', false, 'error', 'FORBIDDEN'); end if;
  if coalesce(btrim(p ->> 'authorName'), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'AUTHOR_REQUIRED');
  end if;
  if coalesce(btrim(p ->> 'text'), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'TEXT_REQUIRED');
  end if;

  perform set_reason('avis client');

  insert into reviews as t (
    id, author_name, rating, lang, source, text, vehicle_id, city, published, is_sample, external_id
  )
  values (
    coalesce(nullif(p ->> 'id', '')::uuid, gen_random_uuid()),
    btrim(p ->> 'authorName'),
    greatest(1, least(5, coalesce((p ->> 'rating')::int, 5))),
    coalesce(nullif(p ->> 'lang', ''), 'fr'),
    coalesce(nullif(p ->> 'source', ''), 'manual'),
    btrim(p ->> 'text'),
    nullif(p ->> 'vehicleId', '')::uuid,
    nullif(btrim(coalesce(p ->> 'city', '')), ''),
    coalesce((p ->> 'published')::boolean, false),
    coalesce((p ->> 'isSample')::boolean, false),
    nullif(btrim(coalesce(p ->> 'externalId', '')), '')
  )
  on conflict (id) do update set
    author_name = excluded.author_name, rating = excluded.rating, lang = excluded.lang,
    source = excluded.source, text = excluded.text, vehicle_id = excluded.vehicle_id,
    city = excluded.city, published = excluded.published, is_sample = excluded.is_sample,
    external_id = excluded.external_id
  returning * into v;
  return jsonb_build_object('ok', true, 'review', to_jsonb(v));
end $$;

-- One deleter for the content and pricing tables, with the table name matched
-- against a literal whitelist BEFORE it ever reaches format(). Anything not in
-- the list is refused, so there is no path from a request body to arbitrary SQL.
create or replace function admin_delete(p_table text, p_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  n int := 0;
begin
  if p_table in ('seasons', 'extras', 'locations') then
    if not can_manage_pricing() then return jsonb_build_object('ok', false, 'error', 'FORBIDDEN'); end if;
    if coalesce(btrim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED'); end if;
  elsif p_table in ('faqs', 'reviews', 'posts') then
    if not is_staff() then return jsonb_build_object('ok', false, 'error', 'FORBIDDEN'); end if;
  else
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN_TABLE');
  end if;

  perform set_reason(coalesce(nullif(btrim(p_reason), ''), 'suppression'));
  execute format('delete from %I where id = $1', p_table) using p_id;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0, 'deleted', n, 'error', case when n = 0 then 'NOT_FOUND' end);
end $$;

-- ============================================================================
-- OBSERVABILITY (plan 9.6)
-- ============================================================================

-- What the free tier is actually costing, from inside the database. Anything
-- that genuinely cannot be read from Postgres is absent here rather than
-- faked — the page says so in words instead.
create or replace function system_metrics()
returns jsonb
language sql stable security definer set search_path = public, pg_temp, storage as $$
  select jsonb_build_object(
    'databaseBytes', pg_database_size(current_database()),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('name', relname, 'bytes', pg_total_relation_size(c.oid), 'rows', c.reltuples::bigint)
                       order by pg_total_relation_size(c.oid) desc)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    ), '[]'::jsonb),
    'storage', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', bucket_id, 'objects', n, 'bytes', bytes) order by bucket_id)
      from (
        select o.bucket_id, count(*) as n, coalesce(sum((o.metadata ->> 'size')::bigint), 0) as bytes
        from storage.objects o group by o.bucket_id
      ) s
    ), '[]'::jsonb),
    'counts', jsonb_build_object(
      'vehicles',     (select count(*) from vehicles),
      'units',        (select count(*) from units),
      'reservations', (select count(*) from reservations),
      'customers',    (select count(*) from customers),
      'events',       (select count(*) from vehicle_events),
      'auditRows',    (select count(*) from audit_log),
      'unreadNotifications', (select count(*) from notifications where read_at is null),
      'pushSubscriptions',   (select count(*) from push_subscriptions)
    ),
    'reservationsToday', (select count(*) from reservations where created_at >= date_trunc('day', now())),
    'lastBackupAt', (select last_backup_at from settings where id = 1),
    'now', now()
  )
  where is_staff();
$$;

-- ============================================================================
-- GRANTS — `authenticated` only. Every function re-checks its own guard, so an
-- authenticated non-staff user gets a FORBIDDEN payload, never a silent write.
-- ============================================================================
revoke all on function save_vehicle(jsonb, text)                        from public;
revoke all on function save_unit(jsonb, text)                           from public;
revoke all on function set_unit_status(uuid, unit_status, text)         from public;
revoke all on function save_vehicle_photo(jsonb)                        from public;
revoke all on function delete_vehicle_photo(uuid)                       from public;
revoke all on function reorder_vehicle_photos(uuid, uuid[])             from public;
revoke all on function unit_dossier(uuid)                               from public;
revoke all on function operations_day(date)                             from public;
revoke all on function complete_pickup(uuid, jsonb)                     from public;
revoke all on function complete_return(uuid, jsonb)                     from public;
revoke all on function log_damages(uuid, uuid, jsonb, text)             from public;
revoke all on function mark_unit_ready(uuid, text)                      from public;
revoke all on function refresh_cleaning_blocks()                        from public;
revoke all on function expire_unconfirmed_reservations()                from public;
revoke all on function save_season(jsonb, text)                         from public;
revoke all on function save_extra(jsonb, text)                          from public;
revoke all on function save_location(jsonb, text)                       from public;
revoke all on function save_settings(jsonb, text)                       from public;
revoke all on function save_faq(jsonb)                                  from public;
revoke all on function save_review(jsonb)                               from public;
revoke all on function admin_delete(text, uuid, text)                   from public;
revoke all on function system_metrics()                                 from public;

grant execute on function save_vehicle(jsonb, text)                to authenticated;
grant execute on function save_unit(jsonb, text)                   to authenticated;
grant execute on function set_unit_status(uuid, unit_status, text) to authenticated;
grant execute on function save_vehicle_photo(jsonb)                to authenticated;
grant execute on function delete_vehicle_photo(uuid)               to authenticated;
grant execute on function reorder_vehicle_photos(uuid, uuid[])     to authenticated;
grant execute on function unit_dossier(uuid)                       to authenticated;
grant execute on function operations_day(date)                     to authenticated;
grant execute on function complete_pickup(uuid, jsonb)             to authenticated;
grant execute on function complete_return(uuid, jsonb)             to authenticated;
grant execute on function mark_unit_ready(uuid, text)              to authenticated;
grant execute on function save_season(jsonb, text)                 to authenticated;
grant execute on function save_extra(jsonb, text)                  to authenticated;
grant execute on function save_location(jsonb, text)               to authenticated;
grant execute on function save_settings(jsonb, text)               to authenticated;
grant execute on function save_faq(jsonb)                          to authenticated;
grant execute on function save_review(jsonb)                       to authenticated;
grant execute on function admin_delete(text, uuid, text)           to authenticated;
grant execute on function system_metrics()                         to authenticated;

-- Swept by cron or by the protected route handlers, never by a browser.
grant execute on function refresh_cleaning_blocks()         to service_role;
grant execute on function expire_unconfirmed_reservations() to service_role;

-- ---------------------------------------------------------------- cron
-- pg_cron if the project has it; otherwise the protected routes
-- /api/cron/expire-reservations and /api/cron/reminders do the same work.
do $$ begin
  perform cron.schedule('diabcar-expire-unconfirmed', '*/15 * * * *', $cron$ select expire_unconfirmed_reservations(); $cron$);
  perform cron.schedule('diabcar-refresh-cleaning',   '*/10 * * * *', $cron$ select refresh_cleaning_blocks(); $cron$);
exception when others then
  raise notice 'pg_cron not scheduled (%). Use /api/cron/expire-reservations and /api/cron/reminders with CRON_SECRET.', sqlerrm;
end $$;
