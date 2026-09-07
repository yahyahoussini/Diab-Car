-- ============================================================================
-- 0005 — roles in the JWT, and RLS on every table (plan 7.2 / 9.4)
--
-- Model: profiles.role is the source of truth. A custom access-token hook
-- copies it into the JWT as `user_role`, so every policy reads one claim
-- instead of joining profiles on each row.
--
-- YOU MUST CLICK TWO THINGS IN THE DASHBOARD — see 0005b at the bottom.
-- ============================================================================

-- ---------------------------------------------------------------- the hook
-- Supabase calls this on every token issue/refresh with
-- {user_id, claims, authentication_method}; it must return the event with
-- claims modified. Inactive staff fall back to no role, which locks them out
-- without deleting the account.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_role   staff_role;
  v_claims jsonb;
begin
  select p.role into v_role
    from profiles p
   where p.id = (event ->> 'user_id')::uuid
     and p.is_active;

  v_claims := event -> 'claims';

  if v_role is not null then
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role::text));
  else
    v_claims := v_claims - 'user_role';
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end $$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on table public.profiles to supabase_auth_admin;
do $$ begin
  create policy "auth admin reads profiles" on profiles
    as permissive for select to supabase_auth_admin using (true);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- helpers
-- Read the role from the JWT. The old `app_metadata.role = 'admin'` shape the
-- starter used is still honoured so an existing admin login keeps working.
create or replace function auth_role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_role', ''),
    case
      when (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') = 'admin'
      then 'owner'
    end
  )
$$;

create or replace function has_role(roles text[]) returns boolean
language sql stable as $$ select auth_role() = any(roles) $$;

create or replace function is_staff() returns boolean
language sql stable as $$ select auth_role() is not null $$;

-- Who may touch money and configuration. Plan 7.2: an agent may not.
create or replace function can_manage_pricing() returns boolean
language sql stable as $$ select has_role(array['owner', 'manager']) $$;

create or replace function is_owner() returns boolean
language sql stable as $$ select has_role(array['owner']) $$;

-- ---------------------------------------------------------------- public settings
-- The settings row carries internal fields (keys, quotas, notify addresses).
-- The public site reads this view instead of the table, so nothing internal
-- can leak through a `select *`.
create or replace view public_settings
with (security_invoker = true) as
select
  s.id, s.name, s.legal_name, s.tagline, s.phone_primary, s.phone_landline,
  s.fax, s.whatsapp, s.email, s.address_line, s.city, s.postal_code, s.country,
  s.lat, s.lng, s.google_maps_url, s.gbp_url, s.facebook_url, s.instagram_url,
  s.tiktok_url, s.hours, s.airport_service24h, s.rc, s.ice, s.capital_mad,
  s.founded_year, s.eur_rate, s.min_age, s.premium_min_age, s.min_license_years,
  s.fuel_policy, s.free_cancellation_hours, s.deposit_release_days,
  s.pricing_tiers, s.monthly_from, s.airport_delivery_fee, s.city_delivery_fee,
  s.one_way_fee, s.cndp_receipt, s.services, s.booking_channels,
  s.google_rating, s.google_review_count, s.google_review_url, s.response_time
from settings s;
-- Deliberately NOT exposed: ga_id, index_now_key, and any future key or quota.

grant select on public_settings to anon, authenticated;

-- ---------------------------------------------------------------- enable RLS
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'units', 'customers', 'reservations', 'blocks', 'holds',
    'vehicle_events', 'audit_log', 'notifications', 'push_subscriptions'
  ]
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- policies
-- Written idempotently: drop then create, so re-running the file is safe.

-- profiles: a member reads their own row; owner/manager read and write all.
drop policy if exists "profiles self read"  on profiles;
drop policy if exists "profiles staff read" on profiles;
drop policy if exists "profiles owner write" on profiles;
create policy "profiles self read"   on profiles for select to authenticated using (id = auth.uid());
create policy "profiles staff read"  on profiles for select to authenticated using (has_role(array['owner', 'manager']));
create policy "profiles owner write" on profiles for all    to authenticated using (is_owner()) with check (is_owner());

-- units, customers, events, audit: STAFF ONLY. Anonymous visitors must never
-- see a plate, a phone number or an operational history (plan 6.5 / 9.4).
drop policy if exists "units staff read"  on units;
drop policy if exists "units staff write" on units;
create policy "units staff read"  on units for select to authenticated using (is_staff());
create policy "units staff write" on units for all    to authenticated using (has_role(array['owner', 'manager'])) with check (has_role(array['owner', 'manager']));

drop policy if exists "customers staff read"  on customers;
drop policy if exists "customers staff write" on customers;
create policy "customers staff read"  on customers for select to authenticated using (is_staff());
create policy "customers staff write" on customers for all    to authenticated using (is_staff()) with check (is_staff());

drop policy if exists "events staff read"  on vehicle_events;
drop policy if exists "events staff write" on vehicle_events;
create policy "events staff read"  on vehicle_events for select to authenticated using (is_staff());
create policy "events staff write" on vehicle_events for insert to authenticated with check (is_staff());

drop policy if exists "audit owner read" on audit_log;
create policy "audit owner read" on audit_log for select to authenticated using (has_role(array['owner', 'manager']));

-- reservations: staff read and write. The public NEVER selects reservations;
-- it creates them through the create_reservation() RPC (prompt 06), which is
-- security definer, so no anon insert policy exists here on purpose.
drop policy if exists "reservations staff read"  on reservations;
drop policy if exists "reservations staff write" on reservations;
create policy "reservations staff read"  on reservations for select to authenticated using (is_staff());
create policy "reservations staff write" on reservations for all    to authenticated using (is_staff()) with check (is_staff());

-- blocks: managers and owners take a car out of service; agents may not.
drop policy if exists "blocks staff read"  on blocks;
drop policy if exists "blocks manage"      on blocks;
create policy "blocks staff read" on blocks for select to authenticated using (is_staff());
create policy "blocks manage"     on blocks for all    to authenticated using (can_manage_pricing()) with check (can_manage_pricing());

-- holds: written only by the RPC (prompt 06). Staff may read to debug.
drop policy if exists "holds staff read" on holds;
create policy "holds staff read" on holds for select to authenticated using (is_staff());

drop policy if exists "notifications staff read"   on notifications;
drop policy if exists "notifications staff update" on notifications;
create policy "notifications staff read"   on notifications for select to authenticated using (is_staff() and (for_role is null or for_role::text = auth_role()));
create policy "notifications staff update" on notifications for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists "push self" on push_subscriptions;
create policy "push self" on push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- tighten the old policies
-- The starter granted writes to any `is_admin()`. Re-scope to the role model,
-- and stop `settings` being world-readable now that public_settings exists.
drop policy if exists "public read settings" on settings;
drop policy if exists "admin write settings" on settings;
create policy "settings staff read"  on settings for select to authenticated using (is_staff());
create policy "settings owner write" on settings for all    to authenticated using (can_manage_pricing()) with check (can_manage_pricing());

drop policy if exists "public read vehicles" on vehicles;
drop policy if exists "admin write vehicles" on vehicles;
create policy "vehicles public read" on vehicles for select using (is_published = true or is_staff());
create policy "vehicles manage"      on vehicles for all to authenticated using (can_manage_pricing()) with check (can_manage_pricing());

drop policy if exists "admin write seasons" on seasons;
drop policy if exists "admin write extras"  on extras;
create policy "seasons manage" on seasons for all to authenticated using (can_manage_pricing()) with check (can_manage_pricing());
create policy "extras manage"  on extras  for all to authenticated using (can_manage_pricing()) with check (can_manage_pricing());

drop policy if exists "admin write locations" on locations;
create policy "locations manage" on locations for all to authenticated using (can_manage_pricing()) with check (can_manage_pricing());

drop policy if exists "public read faqs"    on faqs;
drop policy if exists "admin write faqs"    on faqs;
drop policy if exists "public read reviews" on reviews;
drop policy if exists "admin write reviews" on reviews;
drop policy if exists "admin write posts"   on posts;
create policy "faqs public read" on faqs    for select using (coalesce(is_published, published) = true or is_staff());
create policy "faqs manage"      on faqs    for all to authenticated using (is_staff()) with check (is_staff());
create policy "reviews manage"   on reviews for all to authenticated using (is_staff()) with check (is_staff());
create policy "posts manage"     on posts   for all to authenticated using (is_staff()) with check (is_staff());
