begin;

alter table public.dogs
  add column if not exists dacc_sheltermanager_missing_since timestamptz,
  add column if not exists dacc_sheltermanager_confirmed_absent_at timestamptz;

comment on column public.dogs.dacc_sheltermanager_missing_since is
  'First consecutive successful DACC ShelterManager roster check where the dog was absent. Cleared when the exact shelter code reappears.';

comment on column public.dogs.dacc_sheltermanager_confirmed_absent_at is
  'Timestamp when a second valid ShelterManager absence at least 24 hours later confirmed the DACC dog unavailable. RescueGroups must not republish the dog until ShelterManager confirms the exact code again.';

commit;
