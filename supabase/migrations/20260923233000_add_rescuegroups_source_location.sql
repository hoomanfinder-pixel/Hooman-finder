-- Retain privacy-minimized RescueGroups animal-location evidence separately
-- from legacy placement_* display fields. This migration is intentionally not
-- a backfill and does not make these coordinates eligible for radius matching.

alter table public.dogs
  add column if not exists source_location_id text,
  add column if not exists source_location_city text,
  add column if not exists source_location_state text,
  add column if not exists source_location_postal_code text,
  add column if not exists source_location_latitude double precision,
  add column if not exists source_location_longitude double precision,
  add column if not exists source_location_name text,
  add column if not exists source_location_provenance text,
  add column if not exists source_location_checked_at timestamptz;

comment on column public.dogs.source_location_id is
  'RescueGroups animal locations relationship ID; not proof of adoption placement or mileage suitability.';
comment on column public.dogs.source_location_provenance is
  'Machine-readable origin/status for source_location_*; distinct from legacy placement_* display geography.';
comment on column public.dogs.source_location_checked_at is
  'Time a complete RescueGroups location relationship was last evaluated; incomplete responses preserve prior evidence.';
