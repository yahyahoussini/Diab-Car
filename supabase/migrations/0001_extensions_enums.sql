-- ============================================================================
-- 0001 — extensions and enums (plan 6.2)
--
-- Run order: supabase/schema.sql  →  0001 … 0006  →  `npm run db:seed`.
--
-- schema.sql FIRST. It creates the baseline tables (settings, vehicles,
-- seasons, extras, locations, faqs, posts, reviews, bookings); 0002 and 0003
-- widen those in place with ALTER. On a fresh project, skipping it makes the
-- first ALTER fail with a bare `relation "settings" does not exist` that says
-- nothing about the real cause — so the guard below fails first, with the
-- instruction.
--
-- Every migration is idempotent: re-running it is a no-op, so a partially
-- applied file can simply be run again.
-- ============================================================================

-- ---------------------------------------------------------------- baseline guard
do $$
begin
  if to_regclass('public.settings') is null then
    raise exception
      'Baseline missing: run supabase/schema.sql before 0001..0006. It creates settings, vehicles, locations, faqs, posts and reviews, which 0002/0003 only ALTER.'
      using errcode = 'undefined_table';
  end if;
end $$;

create extension if not exists "pgcrypto";

-- btree_gist lets a GiST index mix equality (unit_id) with overlap (period),
-- which is what makes the anti-double-booking exclusion constraint possible
-- (plan 6.3). Without it the EXCLUDE below cannot be created.
create extension if not exists "btree_gist";

-- ---------------------------------------------------------------- enums
-- Postgres has no `create type if not exists`, so each enum is guarded.

do $$ begin
  create type unit_status as enum (
    'available', 'reserved', 'rented', 'returned',
    'cleaning', 'maintenance', 'blocked', 'out_of_service'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type reservation_status as enum (
    'pending', 'confirmed', 'ready', 'active',
    'returned', 'closed', 'cancelled', 'no_show'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_type as enum (
    'PURCHASED', 'STATUS_CHANGED', 'PICKUP', 'RETURN', 'INSPECTION',
    'DAMAGE_REPORTED', 'CLEANING_STARTED', 'CLEANING_COMPLETED',
    'MAINTENANCE_STARTED', 'MAINTENANCE_COMPLETED', 'DOCUMENT_UPDATED',
    'TRANSFER_STARTED', 'TRANSFER_COMPLETED', 'NOTE'
  );
exception when duplicate_object then null; end $$;

-- Roles, plan 7.2. `driver` is Phase 3 but the value exists now so the enum
-- never has to change under RLS policies that already reference it.
do $$ begin
  create type staff_role as enum ('owner', 'manager', 'agent', 'driver');
exception when duplicate_object then null; end $$;

do $$ begin
  create type block_kind as enum ('maintenance', 'cleaning', 'transfer', 'private', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reservation_source as enum ('web', 'whatsapp', 'phone', 'walkin', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_level as enum ('urgent', 'action', 'info');
exception when duplicate_object then null; end $$;

-- `city` is the owner's requirement (Sept 2026): delivery to other Moroccan
-- cities is a place Diab Car adds from the admin, not a hardcoded list.
do $$ begin
  create type location_kind as enum ('agency', 'airport', 'district', 'city', 'custom');
exception when duplicate_object then null; end $$;
