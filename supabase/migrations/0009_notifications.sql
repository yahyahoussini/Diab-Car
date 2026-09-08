-- ============================================================================
-- 0009 — notifications become real (plan 7.4)
--
-- The table has existed since 0003 and nothing has ever written to it: no
-- trigger, no publication entry, no read path. This migration makes it the
-- admin's nervous system.
-- ============================================================================

-- ---------------------------------------------------------------- new reservation
-- Written by a trigger rather than by the booking action, so a reservation
-- created from the admin, from a script or by a future channel raises the same
-- notification as one from the website. The application cannot forget.
create or replace function notify_new_reservation() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_label text;
begin
  select v.brand || ' ' || v.model into v_label from vehicles v where v.id = new.vehicle_id;

  insert into notifications (level, title, body, href, for_role)
  values (
    'action',
    'Nouvelle réservation ' || new.reference,
    coalesce(v_label, 'Véhicule') || ' · ' ||
      to_char(new.start_at at time zone 'Africa/Casablanca', 'DD/MM HH24:MI') || ' → ' ||
      to_char(new.end_at   at time zone 'Africa/Casablanca', 'DD/MM HH24:MI'),
    '/reservations/' || new.id,
    /* null = everyone. A new booking is everyone's business. */
    null
  );
  return null;
end $$;

drop trigger if exists reservations_notify_new on reservations;
create trigger reservations_notify_new after insert on reservations
  for each row execute function notify_new_reservation();

-- ---------------------------------------------------------------- status changes
-- Only the transitions a human needs to see. `pending → confirmed` is routine;
-- a cancellation or a no-show is not.
create or replace function notify_reservation_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_level notification_level;
begin
  if new.status is not distinct from old.status then return null; end if;

  v_level := case new.status
    when 'cancelled' then 'urgent'
    when 'no_show'   then 'urgent'
    when 'active'    then 'info'
    when 'returned'  then 'action'
    else 'info'
  end;

  /* Routine forward steps do not earn a notification — a bell that rings for
     everything is a bell nobody reads. */
  if new.status in ('confirmed', 'ready', 'closed') then return null; end if;

  insert into notifications (level, title, body, href, for_role)
  values (
    v_level,
    'Réservation ' || new.reference || ' · ' || new.status,
    'Statut : ' || old.status || ' → ' || new.status,
    '/reservations/' || new.id,
    null
  );
  return null;
end $$;

drop trigger if exists reservations_notify_status on reservations;
create trigger reservations_notify_status after update of status on reservations
  for each row execute function notify_reservation_status();

-- ---------------------------------------------------------------- unit out of service
create or replace function notify_unit_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status not in ('maintenance', 'out_of_service') then return null; end if;

  insert into notifications (level, title, body, href, for_role)
  values (
    'action',
    'Véhicule ' || coalesce(new.plate, '—') || ' · ' || new.status,
    'Retiré de la disponibilité.',
    '/flotte/unites/' || new.id,
    /* Only the people who can put it back. */
    'manager'
  );
  return null;
end $$;

drop trigger if exists units_notify_status on units;
create trigger units_notify_status after update of status on units
  for each row execute function notify_unit_status();

-- ---------------------------------------------------------------- writes
-- 0005 gave `notifications` a select and an update policy but no INSERT, so a
-- staff member acting in the admin could not create one. The triggers above are
-- SECURITY DEFINER and bypass this, but the cron route and any future in-app
-- write need it.
drop policy if exists "notifications staff insert" on notifications;
create policy "notifications staff insert" on notifications for insert to authenticated with check (is_staff());

-- ---------------------------------------------------------------- realtime
-- The bell updates without a reload. This table is safe to stream: a row is a
-- title, a level and a link — never a customer, a phone number or a price
-- (plan 9.4), and it is readable only by authenticated staff under the 0005
-- policy, which Realtime honours.
do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null;
         when undefined_object then raise notice 'publication supabase_realtime not found — enable Realtime in the dashboard';
end $$;

-- ---------------------------------------------------------------- reminders
-- What the cron route asks for. Kept as SQL rather than three queries in the
-- route so the definition of "late" lives with the data.
--
-- Returns one row per thing a human should look at now. The route turns them
-- into notifications; it does not decide what counts.
create or replace function operations_due(p_now timestamptz default now())
returns table (
  kind        text,
  level       notification_level,
  reservation uuid,
  reference   text,
  label       text,
  due_at      timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  -- pickups inside the next 45 minutes that are not marked ready
  select 'pickup_soon', 'action'::notification_level, r.id, r.reference,
         'Départ dans moins de 45 min', r.start_at
    from reservations r
   where r.status in ('pending', 'confirmed')
     and r.start_at between p_now and p_now + interval '45 minutes'

  union all
  -- returns due within two hours
  select 'return_soon', 'info', r.id, r.reference,
         'Retour prévu dans moins de 2 h', r.end_at
    from reservations r
   where r.status = 'active'
     and r.end_at between p_now and p_now + interval '2 hours'

  union all
  -- returns that should already have happened
  select 'return_overdue', 'urgent', r.id, r.reference,
         'Retour en retard', r.end_at
    from reservations r
   where r.status = 'active'
     and r.end_at < p_now;
$$;

revoke all on function operations_due(timestamptz) from public;
grant execute on function operations_due(timestamptz) to service_role, authenticated;
