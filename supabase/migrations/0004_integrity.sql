-- ============================================================================
-- 0004 — integrity enforced in Postgres, not in the UI (plan 6.3)
--
-- CLAUDE.md rule 5: availability truth is Postgres. Everything here is a
-- constraint or a trigger, so a bug in the app cannot double-book a car.
-- ============================================================================

-- ---------------------------------------------------------------- no double booking
-- A unit can never hold two overlapping reservations while the reservation is
-- one that actually occupies the car. `pending` is excluded on purpose: a
-- pending request has no unit assigned and blocks nothing.
do $$ begin
  alter table reservations add constraint reservations_no_overlap
    exclude using gist (unit_id with =, period with &&)
    where (unit_id is not null and status in ('confirmed', 'ready', 'active'));
exception when duplicate_object then null; end $$;

-- A unit cannot be blocked twice for overlapping periods.
do $$ begin
  alter table blocks add constraint blocks_no_overlap
    exclude using gist (unit_id with =, period with &&);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- block vs reservation
-- The exclusion constraints above cannot see across tables, so a trigger does
-- it. The error payload names the conflict so the admin can show
-- "Conflit : réservé 10–15 sept" instead of a generic failure (plan 6.3).
create or replace function reject_block_over_reservation() returns trigger
language plpgsql as $$
declare conflict record;
begin
  select r.reference,
         lower(r.period) as starts,
         upper(r.period) as ends
    into conflict
    from reservations r
   where r.unit_id = new.unit_id
     and r.status in ('confirmed', 'ready', 'active')
     and r.period && new.period
   order by lower(r.period)
   limit 1;

  if found then
    raise exception using
      errcode = 'exclusion_violation',
      message = 'BLOCK_CONFLICTS_RESERVATION',
      detail  = json_build_object(
        'code', 'BLOCK_CONFLICTS_RESERVATION',
        'unit_id', new.unit_id,
        'reservation_reference', conflict.reference,
        'reserved_from', conflict.starts,
        'reserved_to', conflict.ends
      )::text,
      hint = 'Release or move the reservation before blocking this unit.';
  end if;
  return new;
end $$;

drop trigger if exists blocks_reject_over_reservation on blocks;
create trigger blocks_reject_over_reservation before insert or update on blocks
  for each row execute function reject_block_over_reservation();

-- ---------------------------------------------------------------- the reason channel
-- Sensitive writes carry a reason (CLAUDE.md rule 5). The app sets it for the
-- transaction with `select set_config('app.reason', $1, true)` before the
-- write; these helpers read it back. `true` = missing setting returns null
-- rather than raising, so a plain SQL console still works.
create or replace function current_reason() returns text
language sql stable as $$ select nullif(current_setting('app.reason', true), '') $$;

create or replace function current_actor() returns uuid
language sql stable as $$ select auth.uid() $$;

-- The app calls this over PostgREST immediately before a sensitive write, so
-- the audit trigger records WHY as well as what. `true` scopes the setting to
-- the transaction; PostgREST runs each request in one, so it cannot leak into
-- another caller's session.
create or replace function set_reason(p_reason text) returns void
language sql volatile as $$ select set_config('app.reason', coalesce(p_reason, ''), true); $$;

grant execute on function set_reason(text) to authenticated;

-- ---------------------------------------------------------------- audit
-- Generic: before + after + actor + reason, for every table it is attached to.
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_row_id uuid;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_after  := null;
    v_row_id := (to_jsonb(old) ->> 'id')::uuid;
  elsif tg_op = 'INSERT' then
    v_before := null;
    v_after  := to_jsonb(new);
    v_row_id := (to_jsonb(new) ->> 'id')::uuid;
  else
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    v_row_id := (to_jsonb(new) ->> 'id')::uuid;
    -- Nothing changed but updated_at: not worth an audit row.
    if v_before - 'updated_at' = v_after - 'updated_at' then
      return coalesce(new, old);
    end if;
  end if;

  insert into audit_log (table_name, row_id, action, before, after, actor_id, reason)
  values (tg_table_name, v_row_id, tg_op, v_before, v_after, current_actor(), current_reason());

  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['reservations', 'units', 'vehicles', 'blocks', 'settings']
  loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format(
      'create trigger %I after insert or update or delete on %I for each row execute function audit_row()',
      t || '_audit', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------- unit status events
-- Every unit status change is an append-only fact (plan 6.3).
create or replace function log_unit_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into vehicle_events (unit_id, type, actor_id, location_id, mileage_km, fuel_pct, reason, data)
    values (
      new.id, 'STATUS_CHANGED', current_actor(), new.current_location_id,
      new.mileage_km, new.fuel_pct, current_reason(),
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end $$;

drop trigger if exists units_log_status on units;
create trigger units_log_status after update on units
  for each row execute function log_unit_status_change();

-- ---------------------------------------------------------------- pickup / return events
-- A reservation entering `active` is a pickup; entering `returned` is a return.
create or replace function log_reservation_transition() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_type event_type;
begin
  if tg_op <> 'UPDATE' or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'active' then
    v_type := 'PICKUP';
  elsif new.status = 'returned' then
    v_type := 'RETURN';
  else
    return new;
  end if;

  if new.unit_id is not null then
    insert into vehicle_events (unit_id, reservation_id, type, actor_id, location_id, reason, data)
    values (
      new.unit_id, new.id, v_type, current_actor(),
      case when v_type = 'PICKUP' then new.pickup_location_id else new.dropoff_location_id end,
      current_reason(),
      jsonb_build_object('from', old.status, 'to', new.status, 'reference', new.reference)
    );
  end if;
  return new;
end $$;

drop trigger if exists reservations_log_transition on reservations;
create trigger reservations_log_transition after update on reservations
  for each row execute function log_reservation_transition();
