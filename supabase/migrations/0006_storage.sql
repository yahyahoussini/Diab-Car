-- ============================================================================
-- 0006 — storage buckets and their policies (plan 9.4)
--
--   vehicles     public read   — fleet photography, served straight from the CDN
--   inspections  PRIVATE       — pickup/return condition photos and signatures
--   documents    PRIVATE       — customer ID / licence scans
--
-- Private buckets are read through 15-minute signed URLs generated
-- server-side. Nothing in them is ever public, and anon has no policy at all.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('vehicles',    'vehicles',    true,  10485760, array['image/avif','image/webp','image/jpeg','image/png','image/svg+xml']),
  ('inspections', 'inspections', false, 10485760, array['image/avif','image/webp','image/jpeg','image/png']),
  ('documents',   'documents',   false, 10485760, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- vehicles
drop policy if exists "public read vehicle photos"   on storage.objects;
drop policy if exists "admin upload vehicle photos"  on storage.objects;
drop policy if exists "admin delete vehicle photos"  on storage.objects;

create policy "vehicle photos public read" on storage.objects
  for select using (bucket_id = 'vehicles');

-- Managing the gallery is a fleet job, so manager and owner (plan 7.1: the
-- per-car gallery is managed entirely from the admin).
create policy "vehicle photos manage" on storage.objects
  for all to authenticated
  using (bucket_id = 'vehicles' and can_manage_pricing())
  with check (bucket_id = 'vehicles' and can_manage_pricing());

-- ---------------------------------------------------------------- inspections
-- Any staff member runs a checklist, so any staff member may write; nobody
-- may delete, because an inspection photo is evidence.
create policy "inspections staff read" on storage.objects
  for select to authenticated using (bucket_id = 'inspections' and is_staff());

create policy "inspections staff write" on storage.objects
  for insert to authenticated with check (bucket_id = 'inspections' and is_staff());

create policy "inspections owner delete" on storage.objects
  for delete to authenticated using (bucket_id = 'inspections' and is_owner());

-- ---------------------------------------------------------------- documents
-- Customer identity documents. Narrowest access in the system.
create policy "documents staff read" on storage.objects
  for select to authenticated using (bucket_id = 'documents' and is_staff());

create policy "documents staff write" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents' and is_staff());

create policy "documents owner delete" on storage.objects
  for delete to authenticated using (bucket_id = 'documents' and is_owner());
