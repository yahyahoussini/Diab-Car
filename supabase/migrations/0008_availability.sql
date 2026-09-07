-- ============================================================================
-- 0008 — the availability engine (plan 6.3 / 6.4 / 6.5)
--
-- CLAUDE.md rule 5: availability truth is Postgres. The UI never decides
-- availability; it asks these functions and renders the answer.
--
-- Everything here is SECURITY DEFINER with a pinned search_path, so an
-- anonymous visitor can ask "is this car free?" without being granted SELECT
-- on reservations, holds, units or customers. That is the whole point: the
-- answer is public, the data behind it is not (plan 6.5, 9.4).
-- ============================================================================

-- ---------------------------------------------------------------- indexes
-- The GiST indexes are what make the overlap tests below index scans instead
-- of sequential ones; the btree indexes serve the equality filters.
create index if not exists reservations_period_gist on reservations using gist (period);
create index if not exists blocks_period_gist       on blocks       using gist (period);
create index if not exists holds_period_gist        on holds        using gist (period);

create index if not exists reservations_vehicle_status_idx on reservations (vehicle_id, status);
create index if not exists reservations_unit_status_idx    on reservations (unit_id, status);
create index if not exists blocks_unit_idx                 on blocks (unit_id);
create index if not exists holds_vehicle_live_idx          on holds (vehicle_id) where released_at is null;
create index if not exists units_vehicle_status_idx        on units (vehicle_id, status);

-- ---------------------------------------------------------------- vocabulary
-- Two definitions that every function below shares. They are functions rather
-- than repeated literals so "what counts as occupied" can never drift between
-- the search, the hold and the booking.

-- A unit that could take a booking at some point. `status` is the unit's
-- CURRENT state, not a statement about a future window: a car that is out on
-- rent today is still bookable for next month, and the period tests handle the
-- overlap. Only the three states that mean "this car cannot be rented at all"
-- are excluded.
create or replace function unit_is_bookable(p_status unit_status) returns boolean
language sql immutable parallel safe as $$
  select p_status not in ('maintenance', 'blocked', 'out_of_service');
$$;

-- Reservation statuses that consume capacity. `pending` is included on
-- purpose: Diab Car takes no online payment (plan 9.5), so a pending request
-- is a real customer waiting for a WhatsApp confirmation, and selling their car
-- out from under them would be the worst possible failure. `cancelled`,
-- `no_show`, `returned` and `closed` release the car.
create or replace function reservation_occupies(p_status reservation_status) returns boolean
language sql immutable parallel safe as $$
  select p_status in ('pending', 'confirmed', 'ready', 'active');
$$;

-- ---------------------------------------------------------------- the search window
-- The requested window widened by the vehicle's prep buffer on BOTH ends.
--
-- This must match how `reservations.period` is generated, or the engine
-- contradicts itself: stored periods are already widened, so comparing a raw
-- request against them would report a car free that the exclusion constraint
-- then refuses to book. Widening both sides is what the constraint effectively
-- enforces, so the search has to do the same arithmetic.
create or replace function booking_window(p_vehicle_id uuid, p_start timestamptz, p_end timestamptz)
returns tstzrange
language sql stable parallel safe as $$
  select tstzrange(
    p_start - make_interval(mins => coalesce(v.prep_buffer_minutes, 120)),
    p_end   + make_interval(mins => coalesce(v.prep_buffer_minutes, 120)),
    '[)'
  )
  from vehicles v where v.id = p_vehicle_id;
$$;

-- ---------------------------------------------------------------- free units
-- How many physical cars of this model are free for this window.
--
--   bookable units
--   − units already taken by an occupying reservation
--   − units blocked (maintenance, cleaning, transfer…)
--   − live holds (someone is in the funnel right now)
--
-- Pending reservations have no unit assigned yet, so they are counted at the
-- MODEL level rather than per unit — that is the over-booking hole plan 6.3
-- closes, and why this is a subtraction rather than a per-unit NOT EXISTS.
create or replace function free_units(p_vehicle_id uuid, p_start timestamptz, p_end timestamptz)
returns int
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  win        tstzrange := booking_window(p_vehicle_id, p_start, p_end);
  total      int;
  taken_unit int;
  blocked    int;
  unassigned int;
  held       int;
begin
  if win is null then return 0; end if;

  select count(*) into total
    from units u
   where u.vehicle_id = p_vehicle_id and unit_is_bookable(u.status);

  if total = 0 then return 0; end if;

  -- Units occupied by a reservation that has been assigned a car.
  select count(distinct r.unit_id) into taken_unit
    from reservations r
   where r.vehicle_id = p_vehicle_id
     and r.unit_id is not null
     and reservation_occupies(r.status)
     and r.period && win;

  -- Units taken out of service for this window. Counted separately from the
  -- line above so a unit that is both blocked and reserved is not subtracted
  -- twice — hence the `not exists` guard.
  select count(distinct b.unit_id) into blocked
    from blocks b
    join units u on u.id = b.unit_id
   where u.vehicle_id = p_vehicle_id
     and b.period && win
     and not exists (
       select 1 from reservations r
        where r.unit_id = b.unit_id and reservation_occupies(r.status) and r.period && win
     );

  -- Reservations still waiting for a unit. They consume a car at the model
  -- level even though no plate has been chosen yet.
  select count(*) into unassigned
    from reservations r
   where r.vehicle_id = p_vehicle_id
     and r.unit_id is null
     and reservation_occupies(r.status)
     and r.period && win;

  -- Live holds: not released, not expired.
  select count(*) into held
    from holds h
   where h.vehicle_id = p_vehicle_id
     and h.released_at is null
     and h.expires_at > now()
     and h.period && win;

  return greatest(total - taken_unit - blocked - unassigned - held, 0);
end $$;

-- ---------------------------------------------------------------- next available
-- The date behind "disponible à partir du 13 SEP" (plan 6.4).
--
-- Walks the ends of everything currently occupying this model and returns the
-- first one where a window of the same length would fit. Capped at 90 days:
-- past that the honest answer is "call us", not a date.
create or replace function next_available(p_vehicle_id uuid, p_from timestamptz default now())
returns timestamptz
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  span       interval;
  probe      timestamptz;
  buffer_min int;
  horizon    timestamptz := p_from + interval '90 days';
begin
  select coalesce(min_days, 1) * interval '1 day' into span
    from vehicles where id = p_vehicle_id;
  if span is null then return null; end if;

  if free_units(p_vehicle_id, p_from, p_from + span) > 0 then
    return p_from;
  end if;

  -- Probe at each stored window's end PLUS one more prep buffer.
  --
  -- `period` is already widened by the buffer, but free_units() widens the
  -- REQUEST backwards by the buffer too, so a request starting exactly at
  -- upper(period) still overlaps it. One more buffer puts the request's widened
  -- start flush against that end, where the half-open ranges stop touching.
  -- Without it every candidate is still occupied and the function returns null
  -- — the page prints nothing instead of "disponible à partir du…".
  select coalesce(prep_buffer_minutes, 120) into buffer_min from vehicles where id = p_vehicle_id;

  for probe in
    select distinct upper(x.period) + make_interval(mins => buffer_min) as e
      from (
        select r.period from reservations r
          where r.vehicle_id = p_vehicle_id and reservation_occupies(r.status)
        union all
        select b.period from blocks b join units u on u.id = b.unit_id
          where u.vehicle_id = p_vehicle_id
      ) x
     where upper(x.period) > p_from and upper(x.period) <= horizon
     order by 1
  loop
    if free_units(p_vehicle_id, probe, probe + span) > 0 then
      return probe;
    end if;
  end loop;

  return null;
end $$;

-- ---------------------------------------------------------------- search
-- One round trip for the whole results page (plan 6.4, 9.3).
--
-- pickup/dropoff are accepted but do not filter today: Diab Car runs one
-- agency and delivers, so every car can be handed over anywhere. They are in
-- the signature because the route handler needs them for the delivery and
-- one-way fees, and because a second branch would filter on them here without
-- an API change. Stated plainly rather than pretending they do something.
create or replace function search_availability(
  p_pickup_location_id  uuid,
  p_dropoff_location_id uuid,
  p_start_at            timestamptz,
  p_end_at              timestamptz
)
returns table (
  vehicle_id        uuid,
  slug              text,
  brand             text,
  model             text,
  year              int,
  category          text,
  transmission      text,
  fuel              text,
  seats             int,
  doors             int,
  luggage           int,
  ac                boolean,
  features          jsonb,
  photo_folder      text,
  images            jsonb,
  purpose_tags      text[],
  min_days          int,
  base_per_day      numeric,
  price_high_season numeric,
  deposit           numeric,
  mileage_limit     int,
  units_total       int,
  units_free        int,
  next_available_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    v.id, v.slug, v.brand, v.model, v.year, v.category, v.transmission, v.fuel,
    v.seats, v.doors, v.luggage, v.ac, v.features, v.photo_folder,
    v.images, v.purpose_tags, v.min_days,
    v.price_per_day, v.price_high_season, v.deposit, v.mileage_limit,
    (select count(*)::int from units u where u.vehicle_id = v.id and unit_is_bookable(u.status)),
    f.units_free,
    -- next_available walks future windows, so it is only worth paying for on
    -- the models that are actually sold out.
    case when f.units_free = 0 then next_available(v.id, p_start_at) else null end
  from vehicles v
  -- LATERAL, not two calls: free_units is the expensive part of this query and
  -- calling it once for the count and again inside the CASE would double the
  -- cost of the whole results page.
  cross join lateral (select free_units(v.id, p_start_at, p_end_at) as units_free) f
 where coalesce(v.is_published, v.published, false) = true
 order by v.featured desc nulls last, v.sort_order nulls last, v.price_per_day;
$$;

-- ---------------------------------------------------------------- alternatives
-- Up to three other published models in the same category that ARE free for
-- the window, cheapest first (plan 6.3). Used by both the sold-out paths.
create or replace function availability_alternatives(
  p_vehicle_id uuid, p_start_at timestamptz, p_end_at timestamptz, p_limit int default 3
)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(a order by a.price_per_day), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'vehicleId', v.id, 'slug', v.slug, 'brand', v.brand, 'model', v.model,
             'category', v.category, 'basePerDay', v.price_per_day,
             'seats', v.seats, 'transmission', v.transmission, 'photoFolder', v.photo_folder
           ) as a,
           v.price_per_day
      from vehicles v
     where v.id <> p_vehicle_id
       and coalesce(v.is_published, v.published, false) = true
       and v.category = (select category from vehicles where id = p_vehicle_id)
       and free_units(v.id, p_start_at, p_end_at) > 0
     order by v.price_per_day
     limit p_limit
  ) a;
$$;

-- ---------------------------------------------------------------- holds
-- A 10-minute claim on one car of this model while the customer fills the
-- funnel. No unit is chosen: the hold reserves capacity, the unit is assigned
-- at pickup by staff.
create or replace function create_hold(
  p_vehicle_id    uuid,
  p_start_at      timestamptz,
  p_end_at        timestamptz,
  p_session_token text
)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_row     vehicles%rowtype;
  v_free    int;
  v_hold    holds%rowtype;
begin
  if p_session_token is null or length(p_session_token) < 8 then
    return jsonb_build_object('ok', false, 'error', 'BAD_SESSION');
  end if;
  if p_end_at <= p_start_at then
    return jsonb_build_object('ok', false, 'error', 'BAD_DATES');
  end if;

  -- Serialise every hold and booking for this model on the vehicle row, so two
  -- visitors racing for the last car cannot both read free = 1.
  select * into v_row from vehicles where id = p_vehicle_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if coalesce(v_row.is_published, v_row.published, false) = false then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  v_free := free_units(p_vehicle_id, p_start_at, p_end_at);
  if v_free <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'SOLD_OUT',
      'nextAvailableAt', next_available(p_vehicle_id, p_start_at),
      'alternatives', availability_alternatives(p_vehicle_id, p_start_at, p_end_at, 3)
    );
  end if;

  insert into holds (vehicle_id, period, session_token, expires_at)
  values (p_vehicle_id,
          booking_window(p_vehicle_id, p_start_at, p_end_at),
          p_session_token,
          now() + interval '10 minutes')
  returning * into v_hold;

  return jsonb_build_object(
    'ok', true,
    'hold', jsonb_build_object(
      'id', v_hold.id, 'vehicleId', v_hold.vehicle_id,
      'expiresAt', v_hold.expires_at, 'startAt', p_start_at, 'endAt', p_end_at
    ),
    'unitsFree', v_free - 1
  );
end $$;

-- The session token is required, so one visitor cannot release another's hold
-- by guessing a uuid.
create or replace function release_hold(p_hold_id uuid, p_session_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update holds set released_at = now()
   where id = p_hold_id and session_token = p_session_token and released_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end $$;

-- ---------------------------------------------------------------- expiry
-- Belt and braces: `free_units` already ignores expired holds, so an unswept
-- hold never blocks a booking. This keeps the table from growing and makes the
-- admin's "live holds" view honest.
create or replace function expire_holds()
returns int
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update holds set released_at = now()
   where released_at is null and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- booking
-- The one place a reservation is created. Takes the whole payload as jsonb so
-- the server action can add fields without a signature change.
--
-- Serialisation: SELECT … FOR UPDATE on the vehicle row. Every hold and every
-- booking for a model queues behind that lock, so the free-unit count cannot be
-- read stale. The exclusion constraint is the second line of defence for units
-- that have been assigned a plate.
create or replace function create_reservation(payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_vehicle   vehicles%rowtype;
  v_start     timestamptz := (payload ->> 'startAt')::timestamptz;
  v_end       timestamptz := (payload ->> 'endAt')::timestamptz;
  v_phone     text        := nullif(trim(payload -> 'customer' ->> 'phone'), '');
  v_free      int;
  v_customer  customers%rowtype;
  v_res       reservations%rowtype;
  v_ref       text        := coalesce(nullif(payload ->> 'reference', ''),
                                      'DC-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6)));
begin
  if v_start is null or v_end is null or v_end <= v_start then
    return jsonb_build_object('ok', false, 'error', 'BAD_DATES');
  end if;
  if v_phone is null then
    return jsonb_build_object('ok', false, 'error', 'BAD_CUSTOMER');
  end if;

  select * into v_vehicle from vehicles
   where id = (payload ->> 'vehicleId')::uuid
      or slug = payload ->> 'vehicleSlug'
   for update;

  if not found or coalesce(v_vehicle.is_published, v_vehicle.published, false) = false then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  -- The hold this booking is converting from does not block its own booking.
  if payload ? 'holdId' and (payload ->> 'holdId') <> '' then
    update holds set released_at = now()
     where id = (payload ->> 'holdId')::uuid
       and session_token = payload ->> 'sessionToken'
       and released_at is null;
  end if;

  v_free := free_units(v_vehicle.id, v_start, v_end);
  if v_free <= 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'SOLD_OUT',
      'nextAvailableAt', next_available(v_vehicle.id, v_start),
      'alternatives', availability_alternatives(v_vehicle.id, v_start, v_end, 3)
    );
  end if;

  -- Customer upsert by phone: the same person booking twice is one row.
  insert into customers (first_name, last_name, phone, whatsapp, email, locale, notes)
  values (
    coalesce(nullif(payload -> 'customer' ->> 'firstName', ''), '-'),
    coalesce(nullif(payload -> 'customer' ->> 'lastName', ''), '-'),
    v_phone,
    nullif(payload -> 'customer' ->> 'whatsapp', ''),
    nullif(payload -> 'customer' ->> 'email', ''),
    coalesce(nullif(payload -> 'customer' ->> 'locale', ''), 'fr'),
    nullif(payload -> 'customer' ->> 'notes', '')
  )
  on conflict (phone) do update set
    first_name = coalesce(nullif(excluded.first_name, '-'), customers.first_name),
    last_name  = coalesce(nullif(excluded.last_name,  '-'), customers.last_name),
    email      = coalesce(excluded.email, customers.email),
    locale     = excluded.locale,
    updated_at = now()
  returning * into v_customer;

  insert into reservations (
    reference, vehicle_id, customer_id,
    pickup_location_id, dropoff_location_id,
    start_at, end_at, status, quote, source, locale, hold_id, notes
  ) values (
    v_ref, v_vehicle.id, v_customer.id,
    nullif(payload ->> 'pickupLocationId', '')::uuid,
    nullif(payload ->> 'dropoffLocationId', '')::uuid,
    v_start, v_end, 'pending',
    coalesce(payload -> 'quote', '{}'::jsonb),
    coalesce(nullif(payload ->> 'source', ''), 'web')::reservation_source,
    coalesce(nullif(payload ->> 'locale', ''), 'fr'),
    nullif(payload ->> 'holdId', '')::uuid,
    nullif(payload ->> 'notes', '')
  )
  returning * into v_res;

  -- No vehicle_events row is written here, deliberately. That table is
  -- unit-scoped (`unit_id` is NOT NULL in 0003) and a pending reservation has
  -- no plate yet, so the insert would fail and roll the whole booking back.
  -- The creation is already recorded: 0004 attaches audit_row() to
  -- reservations for insert/update/delete, with before/after and the actor.
  -- The unit-level PICKUP and RETURN events arrive from 0004's triggers once
  -- staff assign a car.

  return jsonb_build_object(
    'ok', true,
    'reservation', jsonb_build_object(
      'id', v_res.id, 'reference', v_res.reference, 'status', v_res.status,
      'startAt', v_res.start_at, 'endAt', v_res.end_at
    ),
    'unitsFree', v_free - 1
  );
exception
  when exclusion_violation then
    -- The constraint caught a race the count did not. Same answer to the user.
    return jsonb_build_object(
      'ok', false, 'error', 'SOLD_OUT',
      'nextAvailableAt', next_available(v_vehicle.id, v_start),
      'alternatives', availability_alternatives(v_vehicle.id, v_start, v_end, 3)
    );
end $$;

-- ---------------------------------------------------------------- realtime ping
-- What the browser is allowed to subscribe to.
--
-- Plan 6.4 says the pages subscribe to `holds` and `reservations` via
-- postgres_changes. Realtime honours RLS, so that would require an anon SELECT
-- policy on those tables — and any policy loose enough to deliver the row also
-- delivers customer_id, the travel dates and the quote. That is exactly the
-- leak 9.4 forbids.
--
-- So the browser subscribes here instead. One row per vehicle, two columns:
-- which car changed, and when. It says "something moved, ask again" and
-- nothing else; /api/availability remains the only thing that decides what a
-- visitor may know.
create table if not exists availability_ping (
  vehicle_id uuid primary key references vehicles (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create or replace function touch_availability_ping() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  v_id := case tg_table_name
            when 'holds'        then coalesce(new.vehicle_id, old.vehicle_id)
            when 'reservations' then coalesce(new.vehicle_id, old.vehicle_id)
            when 'blocks'       then (select u.vehicle_id from units u
                                       where u.id = coalesce(new.unit_id, old.unit_id))
          end;
  if v_id is not null then
    insert into availability_ping (vehicle_id, updated_at) values (v_id, now())
    on conflict (vehicle_id) do update set updated_at = now();
  end if;
  return null;
end $$;

drop trigger if exists holds_ping        on holds;
drop trigger if exists reservations_ping on reservations;
drop trigger if exists blocks_ping       on blocks;
create trigger holds_ping        after insert or update or delete on holds        for each row execute function touch_availability_ping();
create trigger reservations_ping after insert or update or delete on reservations for each row execute function touch_availability_ping();
create trigger blocks_ping       after insert or update or delete on blocks       for each row execute function touch_availability_ping();

alter table availability_ping enable row level security;
drop policy if exists "availability ping public read" on availability_ping;
create policy "availability ping public read" on availability_ping for select using (true);

-- Realtime only streams tables in this publication.
do $$ begin
  alter publication supabase_realtime add table availability_ping;
exception when duplicate_object then null;
         when undefined_object then raise notice 'publication supabase_realtime not found — enable Realtime in the dashboard';
end $$;

-- ---------------------------------------------------------------- grants
-- Anon may CALL the functions; anon may not read the tables behind them.
revoke all on function search_availability(uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function create_hold(uuid, timestamptz, timestamptz, text) from public;
revoke all on function release_hold(uuid, text) from public;
revoke all on function create_reservation(jsonb) from public;
revoke all on function next_available(uuid, timestamptz) from public;
revoke all on function free_units(uuid, timestamptz, timestamptz) from public;
revoke all on function availability_alternatives(uuid, timestamptz, timestamptz, int) from public;
revoke all on function expire_holds() from public;

grant execute on function search_availability(uuid, uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function create_hold(uuid, timestamptz, timestamptz, text)         to anon, authenticated;
grant execute on function release_hold(uuid, text)                                   to anon, authenticated;
grant execute on function create_reservation(jsonb)                                  to anon, authenticated;
grant execute on function next_available(uuid, timestamptz)                          to anon, authenticated;
grant execute on function availability_alternatives(uuid, timestamptz, timestamptz, int) to anon, authenticated;

-- expire_holds is NOT granted to anon: it is swept by cron or by the protected
-- route handler, never by a visitor.
grant execute on function expire_holds() to service_role;

-- free_units stays internal — it is an implementation detail of the three
-- public functions, and exposing it would let anyone probe the fleet.
grant execute on function free_units(uuid, timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------- cron
-- pg_cron is available on Supabase but must be enabled per project. If this
-- block raises a notice, the schedule did not install and the fallback is the
-- protected route handler /api/cron/expire-holds (CRON_SECRET), which exists
-- either way — see the report.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('diabcar-expire-holds', '* * * * *', $cron$ select expire_holds(); $cron$);
exception when others then
  raise notice 'pg_cron not scheduled (%). Use /api/cron/expire-holds with CRON_SECRET instead.', sqlerrm;
end $$;
