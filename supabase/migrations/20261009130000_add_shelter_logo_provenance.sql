begin;

alter table public.shelters
  add column if not exists logo_source_url text,
  add column if not exists logo_source_type text,
  add column if not exists logo_verification_status text,
  add column if not exists logo_checked_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shelters_logo_source_type_check'
      and conrelid = 'public.shelters'::regclass
  ) then
    alter table public.shelters
      add constraint shelters_logo_source_type_check
      check (logo_source_type in (
        'shelter_provided',
        'official_website',
        'official_provider',
        'official_social',
        'legacy'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'shelters_logo_verification_status_check'
      and conrelid = 'public.shelters'::regclass
  ) then
    alter table public.shelters
      add constraint shelters_logo_verification_status_check
      check (logo_verification_status in (
        'unverified',
        'verified',
        'fetch_failed',
        'rejected',
        'broken'
      ));
  end if;
end
$$;

comment on column public.shelters.logo_source_url is
  'Official page that directly supplied or referenced the current shelter logo.';
comment on column public.shelters.logo_source_type is
  'Deterministic provenance class for the current shelter logo.';
comment on column public.shelters.logo_verification_status is
  'Result of the most recent bounded shelter-logo verification or discovery check.';
comment on column public.shelters.logo_checked_at is
  'Time of the most recent shelter-logo verification or discovery check.';

commit;
