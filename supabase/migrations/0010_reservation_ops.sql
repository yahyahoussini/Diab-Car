-- ============================================================================
-- 0010 — reservations as operational objects (plan 6.3, 7.1)
--
-- Every sensitive write is ONE function, for a reason that is easy to miss:
-- `set_reason()` writes a transaction-local setting, and PostgREST runs each
-- request in its own transaction. Calling set_reason and then UPDATE from the
-- app is TWO transactions, so the audit trigger would record every cancellation
-- with a null reason — the exact field CLAUDE.md rule 5 requires.
--
-- Doing the reason and the write together also means the state machine, the
-- conflict check and the audit trail cannot drift apart: there is one place
-- where a reservation changes.
-- ============================================================================

-- ---------------------------------------------------------------- the machine
-- pending → confirmed → ready → active → returned → closed
-- and cancelled / no_show from the states where they make sense.
--
-- Encoded as data rather than as an IF-chain so the admin can render the
-- legal next steps from the same source that enforces them.
create or replace function reservation_next_states(p_status reservation_status)
returns reservation_status[]
language sql immutable parallel safe as $$
  select case p_status
    when 'pending'   then array['confirmed', 'cancelled']::reservation_status[]
    when 'confirmed' then array['ready', 'cancelled', 'no_show']::reservation_status[]
    when 'ready'     then array['active', 'cancelled', 'no_show']::reservation_status[]
    when 'active'    then array['returned']::reservation_status[]
    when 'returned'  then array['closed']::reservation_status[]
    else array[]::reservation_status[]
  end;
$$;

/* Which transitions demand a written reason (rule 5). Cancelling someone's
   booking, recording a no-show or changing an agreed price are the three
   things a customer may later dispute. */
create or replace function reservation_needs_reason(p_status reservation_status)
returns boolean
language sql immutable parallel safe as $$
  select p_status in ('cancelled', 'no_show');
$$;

-- ---------------------------------------------------------------- status
create or replace function set_reservation_status(
  p_id uuid, p_status reservation_status, p_reason text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r reservations%rowtype;
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select * into r from reservations where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if not (p_status = any (reservation_next_states(r.status))) then
    return jsonb_build_object(
      'ok', false, 'error', 'ILLEGAL_TRANSITION',
      'from', r.status, 'to', p_status,
      'allowed', to_jsonb(reservation_next_states(r.status))
    );
  end if;

  if reservation_needs_reason(p_status) and coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
  end if;

  /* Same transaction as the UPDATE, so audit_row() actually sees it. */
  perform set_config('app.reason', coalesce(p_reason, ''), true);

  update reservations set status = p_status, updated_at = now() where id = p_id
  returning * into r;

  return jsonb_build_object('ok', true, 'status', r.status);
exception
  when exclusion_violation then
    /* Moving into an occupying state can collide with another booking on the
       same unit. */
    return jsonb_build_object('ok', false, 'error', 'CONFLICT');
end $$;

-- ---------------------------------------------------------------- unit
-- Assigning a plate. The exclusion constraint is the authority; this function
-- exists to turn its error into something the admin can SHOW — plan 6.3 asks
-- for "Conflit : réservé 10–15 sept", not a generic failure.
create or replace function assign_reservation_unit(
  p_id uuid, p_unit uuid, p_reason text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r        reservations%rowtype;
  conflict record;
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select * into r from reservations where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;

  if p_unit is not null then
    /* Look the conflict up BEFORE writing, so the message names it. */
    select r2.reference, lower(r2.period) as starts, upper(r2.period) as ends
      into conflict
      from reservations r2
     where r2.unit_id = p_unit
       and r2.id <> p_id
       and reservation_occupies(r2.status)
       and r2.period && r.period
     order by lower(r2.period)
     limit 1;

    if found then
      return jsonb_build_object(
        'ok', false, 'error', 'CONFLICT',
        'reference', conflict.reference,
        'from', conflict.starts, 'to', conflict.ends
      );
    end if;
  end if;

  perform set_config('app.reason', coalesce(p_reason, 'assignation unité'), true);
  update reservations set unit_id = p_unit, updated_at = now() where id = p_id;

  return jsonb_build_object('ok', true);
exception
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'CONFLICT');
end $$;

-- ---------------------------------------------------------------- dates
-- What the calendar's drag and the panel's date fields both call.
create or replace function move_reservation(
  p_id uuid, p_start timestamptz, p_end timestamptz, p_reason text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r        reservations%rowtype;
  win      tstzrange;
  conflict record;
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if p_end <= p_start then
    return jsonb_build_object('ok', false, 'error', 'BAD_DATES');
  end if;

  select * into r from reservations where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;

  win := booking_window(r.vehicle_id, p_start, p_end);

  /* Same check the constraint will make, run first so the answer can name the
     other booking instead of just refusing. */
  if r.unit_id is not null then
    select r2.reference, lower(r2.period) as starts, upper(r2.period) as ends
      into conflict
      from reservations r2
     where r2.unit_id = r.unit_id
       and r2.id <> p_id
       and reservation_occupies(r2.status)
       and r2.period && win
     order by lower(r2.period)
     limit 1;

    if found then
      return jsonb_build_object('ok', false, 'error', 'CONFLICT', 'reference', conflict.reference, 'from', conflict.starts, 'to', conflict.ends);
    end if;

    /* A maintenance block is just as real a conflict as another booking. */
    if exists (select 1 from blocks b where b.unit_id = r.unit_id and b.period && win) then
      return jsonb_build_object('ok', false, 'error', 'BLOCKED');
    end if;
  end if;

  perform set_config('app.reason', coalesce(p_reason, 'déplacement des dates'), true);
  update reservations set start_at = p_start, end_at = p_end, updated_at = now() where id = p_id;

  return jsonb_build_object('ok', true);
exception
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'CONFLICT');
end $$;

-- ---------------------------------------------------------------- price
-- An override always carries a reason and never silently rewrites the agreed
-- quote: the original is preserved under `quote.original` so a dispute can be
-- settled by reading the row (rule 4).
create or replace function override_reservation_price(
  p_id uuid, p_total numeric, p_reason text
)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r reservations%rowtype;
begin
  if not can_manage_pricing() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
  end if;

  select * into r from reservations where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;

  perform set_config('app.reason', p_reason, true);

  update reservations
     set quote = r.quote
                 || jsonb_build_object('total', p_total, 'overridden', true, 'overrideReason', p_reason)
                 || case when r.quote ? 'original' then '{}'::jsonb
                         else jsonb_build_object('original', r.quote) end,
         updated_at = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'total', p_total);
end $$;

-- ---------------------------------------------------------------- free units
-- Which physical cars could take THIS reservation. Used by the assignment
-- selector so staff are never offered a unit the database would refuse.
create or replace function units_free_for_reservation(p_id uuid)
returns table (unit_id uuid, plate text, status unit_status)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.id, u.plate, u.status
    from reservations r
    join units u on u.vehicle_id = r.vehicle_id
   where r.id = p_id
     and unit_is_bookable(u.status)
     and not exists (
       select 1 from reservations r2
        where r2.unit_id = u.id and r2.id <> r.id
          and reservation_occupies(r2.status) and r2.period && r.period
     )
     and not exists (select 1 from blocks b where b.unit_id = u.id and b.period && r.period)
   order by u.plate;
$$;

-- ---------------------------------------------------------------- calendar
-- Everything the Gantt draws, in one round trip: every bookable unit, the
-- reservations on it, and the blocks. Staff-only by definition — it carries
-- plates and references.
create or replace function calendar_rows(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'units', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'plate', u.plate, 'status', u.status,
        'vehicleId', v.id, 'vehicle', v.brand || ' ' || v.model
      ) order by v.brand, v.model, u.plate)
      from units u join vehicles v on v.id = u.vehicle_id
     where unit_is_bookable(u.status) or exists (select 1 from blocks b where b.unit_id = u.id and b.period && tstzrange(p_from, p_to))
    ), '[]'::jsonb),
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'unitId', r.unit_id, 'vehicleId', r.vehicle_id,
        'reference', r.reference, 'status', r.status,
        'startAt', r.start_at, 'endAt', r.end_at
      ))
      from reservations r
     where reservation_occupies(r.status)
       and r.period && tstzrange(p_from, p_to)
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'unitId', b.unit_id, 'kind', b.kind, 'reason', b.reason,
        'startAt', lower(b.period), 'endAt', upper(b.period)
      ))
      from blocks b
     where b.period && tstzrange(p_from, p_to)
    ), '[]'::jsonb)
  )
  where is_staff();
$$;

-- ---------------------------------------------------------------- grants
revoke all on function set_reservation_status(uuid, reservation_status, text) from public;
revoke all on function assign_reservation_unit(uuid, uuid, text) from public;
revoke all on function move_reservation(uuid, timestamptz, timestamptz, text) from public;
revoke all on function override_reservation_price(uuid, numeric, text) from public;
revoke all on function units_free_for_reservation(uuid) from public;
revoke all on function calendar_rows(timestamptz, timestamptz) from public;

/* `authenticated` only — every one of these re-checks is_staff() or
   can_manage_pricing() inside, so an authenticated non-staff user gets a
   FORBIDDEN payload rather than a silent success. */
grant execute on function set_reservation_status(uuid, reservation_status, text) to authenticated;
grant execute on function assign_reservation_unit(uuid, uuid, text)              to authenticated;
grant execute on function move_reservation(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function override_reservation_price(uuid, numeric, text)        to authenticated;
grant execute on function units_free_for_reservation(uuid)                       to authenticated;
grant execute on function calendar_rows(timestamptz, timestamptz)                to authenticated;
