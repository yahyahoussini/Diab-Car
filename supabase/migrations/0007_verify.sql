-- ============================================================================
-- 0007 — verification. Not a migration: nothing here changes the schema.
-- Run it in the SQL editor after seeding and paste the output into the report.
-- Every block is safe to run repeatedly; the last one rolls itself back.
-- ============================================================================

-- ---------------------------------------------------------------- 1. counts
select 'vehicles'  as table, count(*) from vehicles
union all select 'units',      count(*) from units
union all select 'locations',  count(*) from locations
union all select 'faqs',       count(*) from faqs
union all select 'customers',  count(*) from customers
union all select 'reservations', count(*) from reservations
order by 1;

-- ---------------------------------------------------------------- 2. RLS hides the private tables
-- `anon` is the role the browser uses with the publishable key. It must see
-- published vehicles and locations, and NOTHING of units or customers.
set local role anon;

select 'anon sees vehicles'  as check, count(*) as rows from vehicles;   -- > 0, published only
select 'anon sees locations' as check, count(*) as rows from locations;  -- > 0
select 'anon sees units'     as check, count(*) as rows from units;      -- MUST be 0
select 'anon sees customers' as check, count(*) as rows from customers;  -- MUST be 0
select 'anon sees reservations' as check, count(*) as rows from reservations; -- MUST be 0
select 'anon sees audit_log' as check, count(*) as rows from audit_log;  -- MUST be 0

-- The public site reads settings through the view, never the table.
select 'anon sees settings table' as check, count(*) as rows from settings;      -- MUST be 0
select 'anon sees public_settings' as check, count(*) as rows from public_settings; -- 1

reset role;

-- ---------------------------------------------------------------- 3. double booking is impossible
-- Two overlapping confirmed reservations on the SAME unit. The second insert
-- must fail with 23P01 (exclusion_violation). Rolled back either way.
do $$
declare
  v_unit    uuid;
  v_vehicle uuid;
  v_start   timestamptz := date_trunc('day', now()) + interval '30 days';
begin
  select u.id, u.vehicle_id into v_unit, v_vehicle from units u limit 1;
  if v_unit is null then
    raise notice 'SKIPPED: no units seeded yet.';
    return;
  end if;

  begin
    insert into reservations (reference, vehicle_id, unit_id, start_at, end_at, status)
    values ('TEST-A', v_vehicle, v_unit, v_start, v_start + interval '3 days', 'confirmed');

    insert into reservations (reference, vehicle_id, unit_id, start_at, end_at, status)
    values ('TEST-B', v_vehicle, v_unit, v_start + interval '1 day', v_start + interval '4 days', 'confirmed');

    raise exception 'FAILED: the overlapping reservation was accepted.';
  exception
    when exclusion_violation then
      raise notice 'PASS: overlapping reservation rejected (23P01, reservations_no_overlap).';
    when others then
      raise notice 'UNEXPECTED: % / %', sqlstate, sqlerrm;
  end;

  raise exception 'rollback the test rows';
exception when others then
  if sqlerrm <> 'rollback the test rows' then raise notice 'note: %', sqlerrm; end if;
end $$;

-- ---------------------------------------------------------------- 4. the prep buffer really widens the window
-- A 120-minute buffer must push `period` two hours out on each side.
select
  r.reference,
  r.start_at,
  lower(r.period)                    as period_starts,
  r.start_at - lower(r.period)       as widened_before,
  upper(r.period) - r.end_at         as widened_after,
  r.prep_buffer_minutes
from reservations r
limit 5;

-- ---------------------------------------------------------------- 5. a block cannot land on a confirmed reservation
-- Expect: BLOCK_CONFLICTS_RESERVATION, with the reference and dates in DETAIL.
--   insert into blocks (unit_id, kind, period, reason)
--   values ('<unit-uuid>', 'maintenance',
--           tstzrange(now() + interval '31 days', now() + interval '32 days'),
--           'vidange');
