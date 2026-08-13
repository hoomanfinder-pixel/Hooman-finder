begin;

alter table public.dogs
  add column if not exists dacc_bio_recovery_status text,
  add column if not exists dacc_bio_checked_at timestamptz,
  add column if not exists dacc_bio_source_hash text;

alter table public.dogs
  drop constraint if exists dogs_dacc_bio_recovery_status_check,
  add constraint dogs_dacc_bio_recovery_status_check
    check (
      dacc_bio_recovery_status is null
      or dacc_bio_recovery_status in (
        'recovered',
        'no_match',
        'no_bio',
        'fetch_failed',
        'parse_failed',
        'manual_conflict'
      )
    );

comment on column public.dogs.dacc_bio_recovery_status is
  'Latest DACC ShelterManager bio-recovery outcome. This is independent of roster availability and AI enrichment state.';

comment on column public.dogs.dacc_bio_checked_at is
  'Timestamp of the latest attempted DACC ShelterManager bio recovery.';

comment on column public.dogs.dacc_bio_source_hash is
  'SHA-256 hash of the cleaned authoritative ShelterManager bio last safely imported into description.';

commit;
