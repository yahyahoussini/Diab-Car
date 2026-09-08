-- ============================================================================
-- 0013 — per-vehicle day availability, for the booking calendar (plan 4.7)
--
-- Run after 0012. Idempotent.
--
-- The booking flow is being inverted: instead of "give me dates, I will show
-- you the free cars", the customer picks a CAR and sees that car's calendar
-- with the days it cannot be had greyed out.
--
-- One warning encoded in the shape of this function: a per-day count is a
-- HINT, never the answer. Three units — A free Mon-Wed, B free Wed-Fri — give
-- every day a free unit while no single unit covers Mon-Fri, and the exclusion
-- constraint is per unit. So the calendar paints days from `days[]` and the
-- ACTUAL range is decided by free_units(vehicle, start, end) when the customer
-- picks one. `maxRun` below is the honest upper bound the calendar may promise.
-- ============================================================================

-- ---------------------------------------------------------------- one day
-- A Casablanca day, in the same fixed +01:00 the rest of the app uses
-- (src/lib/format.js toISO, src/lib/calendar.js, operations_day in 0012).
create or replace function casablanca_day(p_day date)
returns timestamptz language sql immutable parallel safe as $$
  select (p_day::text || ' 00:00:00+01')::timestamptz;
$$;

-- ---------------------------------------------------------------- the calendar
create or replace function vehicle_availability_days(p_vehicle uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v         vehicles%rowtype;
  d0        date := least(p_from, p_to);
  d1        date;
  v_days    jsonb;
  v_units   int;
  v_run     int := 0;
  v_best    int := 0;
  r         record;
begin
  select * into v from vehicles where id = p_vehicle;
  if not found or coalesce(v.is_published, v.published, false) = false then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  -- A calendar shows a month or two. Capping the window keeps an anonymous
  -- caller from asking for ten years of day-by-day availability in one request;
  -- free_units() is cheap but not free, and this RPC is public.
  d1 := least(greatest(p_to, d0), d0 + 92);

  select count(*) into v_units
    from units u where u.vehicle_id = p_vehicle and unit_is_bookable(u.status);

  -- One free_units() call per day, through a LATERAL so the count is not
  -- evaluated twice per row just to be read twice.
  select jsonb_agg(jsonb_build_object('day', to_char(g.d, 'YYYY-MM-DD'), 'free', f.free) order by g.d)
    into v_days
    from (select generate_series(d0::timestamp, d1::timestamp, interval '1 day')::date as d) g
    cross join lateral (
      select free_units(p_vehicle, casablanca_day(g.d), casablanca_day(g.d + 1)) as free
    ) f;

  -- The longest unbroken run of days with at least one free unit. It is what
  -- the UI may honestly say ("jusqu'à N jours d'affilée"); anything longer has
  -- to be checked against free_units() for the exact range anyway.
  for r in select (e ->> 'free')::int as free from jsonb_array_elements(coalesce(v_days, '[]'::jsonb)) e
  loop
    if r.free > 0 then
      v_run := v_run + 1;
      if v_run > v_best then v_best := v_run; end if;
    else
      v_run := 0;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'vehicleId', p_vehicle,
    'slug', v.slug,
    'from', to_char(d0, 'YYYY-MM-DD'),
    'to', to_char(d1, 'YYYY-MM-DD'),
    'minDays', coalesce(v.min_days, 1),
    'prepBufferMinutes', coalesce(v.prep_buffer_minutes, 120),
    'unitsTotal', v_units,
    'maxRun', v_best,
    'days', coalesce(v_days, '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------- grants
-- Public: the booking calendar runs for anonymous visitors. It exposes only
-- "how many of this model are free on this day" — never a plate, a customer,
-- a reservation or an internal unit status (plan 6.5).
revoke all on function vehicle_availability_days(uuid, date, date) from public;
grant execute on function vehicle_availability_days(uuid, date, date) to anon, authenticated;
grant execute on function casablanca_day(date) to anon, authenticated;
