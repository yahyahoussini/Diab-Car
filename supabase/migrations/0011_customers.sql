-- ============================================================================
-- 0011 — customer profiles and the merge (plan 7.1)
-- Run after 0010. Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------- normalising
-- The last nine digits of a Moroccan number, whatever was typed around them.
-- `+212612345678`, `0612345678` and `06 12 34 56 78` are one human, but they
-- are three DIFFERENT values in a column with a UNIQUE constraint — which is
-- exactly why duplicates exist at all: Postgres cannot see that they collide.
create or replace function phone_key(p_phone text)
returns text language sql immutable parallel safe as $$
  select right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 9);
$$;

create index if not exists customers_phone_key_idx on customers (phone_key(phone));

-- ---------------------------------------------------------------- duplicates
-- Groups of two or more customers whose numbers normalise to the same thing.
-- Staff-only, like everything else that returns customer data.
create or replace function customer_duplicates()
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(g order by g ->> 'key'), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'key', phone_key(c.phone),
             'customers', jsonb_agg(jsonb_build_object(
               'id', c.id, 'firstName', c.first_name, 'lastName', c.last_name,
               'phone', c.phone, 'email', c.email, 'createdAt', c.created_at,
               'reservations', (select count(*) from reservations r where r.customer_id = c.id)
             ) order by c.created_at)
           ) as g
      from customers c
     where phone_key(c.phone) <> ''
     group by phone_key(c.phone)
    having count(*) > 1
  ) s
  where is_staff();
$$;

-- ---------------------------------------------------------------- one profile
-- Everything the profile page shows, in one round trip: the customer, their
-- reservations with the vehicle already named, and the totals. Computed in SQL
-- because "how much has this client actually paid us" must not depend on which
-- rows the admin happened to have loaded.
create or replace function customer_profile(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'customer', (
      select jsonb_build_object(
        'id', c.id, 'firstName', c.first_name, 'lastName', c.last_name,
        'phone', c.phone, 'whatsapp', c.whatsapp, 'email', c.email,
        'locale', c.locale, 'notes', c.notes,
        'createdAt', c.created_at, 'updatedAt', c.updated_at
      ) from customers c where c.id = p_id
    ),
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'reference', r.reference, 'status', r.status,
        'startAt', r.start_at, 'endAt', r.end_at,
        'total', (r.quote ->> 'total')::numeric,
        'vehicle', v.brand || ' ' || v.model
      ) order by r.start_at desc)
      from reservations r left join vehicles v on v.id = r.vehicle_id
     where r.customer_id = p_id
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'count', count(*),
        -- Only money we actually earned: a cancellation is not revenue (rule 11).
        'revenue', coalesce(sum((r.quote ->> 'total')::numeric)
                     filter (where r.status in ('active', 'returned', 'closed')), 0),
        'cancelled', count(*) filter (where r.status in ('cancelled', 'no_show')),
        'days', coalesce(sum(ceil(extract(epoch from (r.end_at - r.start_at)) / 86400))
                  filter (where r.status in ('active', 'returned', 'closed')), 0)
      ) from reservations r where r.customer_id = p_id
    )
  )
  where is_staff();
$$;

-- ---------------------------------------------------------------- notes
create or replace function set_customer_notes(p_id uuid, p_notes text)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  perform set_reason('note client');
  update customers set notes = nullif(btrim(p_notes), ''), updated_at = now() where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- merge
-- Two rows, one human. The survivor keeps its own values and inherits only
-- what it was missing; the reservations move across BEFORE the delete, so the
-- `on delete set null` on reservations.customer_id can never fire and orphan a
-- booking's identity.
--
-- A reason is mandatory and the whole thing is one transaction, so the audit
-- rows for the moved reservations and for the deleted customer all carry it.
create or replace function merge_customers(p_keep uuid, p_drop uuid, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_keep  customers%rowtype;
  v_drop  customers%rowtype;
  v_moved int;
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if p_keep is null or p_drop is null or p_keep = p_drop then
    return jsonb_build_object('ok', false, 'error', 'SAME');
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
  end if;

  -- Both rows locked in id order, so two operators merging the same pair from
  -- opposite directions wait for each other instead of deadlocking.
  perform 1 from customers where id in (p_keep, p_drop) order by id for update;

  select * into v_keep from customers where id = p_keep;
  select * into v_drop from customers where id = p_drop;
  if v_keep.id is null or v_drop.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  perform set_reason(p_reason);

  update reservations set customer_id = p_keep where customer_id = p_drop;
  get diagnostics v_moved = row_count;

  update customers set
    email     = coalesce(v_keep.email, v_drop.email),
    whatsapp  = coalesce(v_keep.whatsapp, v_drop.whatsapp),
    notes     = nullif(concat_ws(E'\n', nullif(btrim(coalesce(v_keep.notes, '')), ''),
                                        nullif(btrim(coalesce(v_drop.notes, '')), '')), ''),
    updated_at = now()
  where id = p_keep;

  delete from customers where id = p_drop;

  -- `customers` deliberately carries no audit trigger: every public booking
  -- inserts one, and copying a name, a phone and an e-mail into audit_log on
  -- each of those would duplicate the whole customer table into a second place
  -- for nothing. A merge is different — a row DISAPPEARS — so it is logged
  -- here, by id and count only, with the operator's reason. No PII moves.
  insert into audit_log (table_name, row_id, action, before, after, actor_id, reason)
  values ('customers', p_drop, 'DELETE',
          jsonb_build_object('id', p_drop, 'mergedInto', p_keep, 'reservationsMoved', v_moved),
          null, auth.uid(), p_reason);

  return jsonb_build_object(
    'ok', true, 'moved', v_moved,
    'kept', v_keep.phone, 'dropped', v_drop.phone
  );
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function customer_duplicates() from public;
revoke all on function customer_profile(uuid) from public;
revoke all on function set_customer_notes(uuid, text) from public;
revoke all on function merge_customers(uuid, uuid, text) from public;

grant execute on function customer_duplicates() to authenticated;
grant execute on function customer_profile(uuid) to authenticated;
grant execute on function set_customer_notes(uuid, text) to authenticated;
grant execute on function merge_customers(uuid, uuid, text) to authenticated;
grant execute on function phone_key(text) to authenticated;
