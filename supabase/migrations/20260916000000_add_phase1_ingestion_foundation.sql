-- Phase 1 ingestion controls. This migration is intentionally not applied by
-- application code; deploy it through the normal reviewed Supabase process.

create table if not exists public.ingestion_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  external_org_id text not null,
  shelter_id uuid references public.shelters(id) on delete set null,
  display_name text not null,
  enabled boolean not null default true,
  publication_eligible boolean not null default true,
  last_sync_attempt_at timestamptz,
  last_successful_sync_at timestamptz,
  last_sync_status text not null default 'never',
  last_error text,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingestion_sources_source_org_unique unique (source_type, external_org_id),
  constraint ingestion_sources_status_check check (
    last_sync_status in ('never', 'running', 'success', 'partial', 'failed', 'disabled')
  ),
  constraint ingestion_sources_disable_reason_check check (
    enabled or nullif(btrim(disabled_reason), '') is not null
  )
);

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  ingestion_source_id uuid not null references public.ingestion_sources(id) on delete restrict,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  fetched_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  filtered_count integer not null default 0,
  stale_marked_count integer not null default 0,
  failed_count integer not null default 0,
  error_summary text,
  created_at timestamptz not null default now(),
  constraint ingestion_runs_status_check check (
    status in ('running', 'success', 'partial', 'failed')
  ),
  constraint ingestion_runs_counts_nonnegative check (
    fetched_count >= 0 and inserted_count >= 0 and updated_count >= 0 and
    filtered_count >= 0 and stale_marked_count >= 0 and failed_count >= 0
  )
);

create index if not exists ingestion_runs_source_started_idx
  on public.ingestion_runs (ingestion_source_id, started_at desc);

create or replace function public.touch_ingestion_source_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ingestion_sources_touch_updated_at on public.ingestion_sources;
create trigger ingestion_sources_touch_updated_at
before update on public.ingestion_sources
for each row execute function public.touch_ingestion_source_updated_at();

create table if not exists public.ai_enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  model text not null,
  max_dogs integer not null,
  attempted_count integer not null default 0,
  succeeded_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  error_summary text,
  created_at timestamptz not null default now(),
  constraint ai_enrichment_runs_status_check check (
    status in ('running', 'success', 'partial', 'failed', 'disabled')
  ),
  constraint ai_enrichment_runs_bounds_check check (
    max_dogs > 0 and attempted_count >= 0 and succeeded_count >= 0 and
    skipped_count >= 0 and failed_count >= 0 and input_tokens >= 0 and
    output_tokens >= 0 and total_tokens >= 0
  )
);

alter table public.dogs
  add column if not exists ingestion_source_id uuid
    references public.ingestion_sources(id) on delete set null,
  add column if not exists tracker_image_url text;

insert into public.ingestion_sources (
  source_type, external_org_id, shelter_id, display_name, enabled,
  publication_eligible, last_sync_status, disabled_reason
)
values
  ('rescuegroups', '4470',  '5b478625-1518-486b-9ef6-1defaa42fdd2', 'Allies for Greyhounds of West Michigan', true, true, 'never', null),
  ('rescuegroups', '6172',  '2c69b35a-aecf-4bb0-99b4-be39ea2c9f49', 'Canine Companions Rescue Center', true, true, 'never', null),
  ('rescuegroups', '8883',  '1aee8551-8d35-49bf-9522-4b0b20411210', 'Detroit Animal Care and Control', true, true, 'never', null),
  ('rescuegroups', '7921',  '2bd4355c-93f6-4f8d-8e47-4b734a24e953', 'Happy Days Dog and Cat Rescue', true, true, 'never', null),
  ('rescuegroups', '5470',  '324ff4ca-b15a-4948-9281-e815ec085694', 'LUVUMALL ANIMAL RESCUE', true, true, 'never', null),
  ('rescuegroups', '2033',  '5a34ee1d-354f-4c8b-94b5-d9d298a2c56f', 'Macomb County Animal Shelter and Animal Control', true, true, 'never', null),
  ('rescuegroups', '6454',  '8d9ffe7d-b251-4250-b138-86d791736b23', 'Project Hope Animal Rescue', true, true, 'never', null),
  ('rescuegroups', '6843',  '36292715-5216-4e55-8f6e-80eb5a87ecb9', 'Saving Tails Animal Rescue', true, true, 'never', null),
  ('rescuegroups', '9242',  '27aba566-a878-45b8-971c-0e42304dbfa9', 'The Life of Fostering Furbabies Animal Rescue', false, false, 'disabled', 'Source is quarantined pending a validated authoritative roster'),
  ('rescuegroups', '8099',  '77b4a846-9247-41d8-8514-677e55e18b49', 'Angels Among Us Pet Rescue', true, true, 'never', null),
  ('rescuegroups', '3910',  'c6adcec0-cd7a-45fb-b07a-007a02417971', 'Naked K9 & Small Dog Rescue', true, true, 'never', null),
  ('rescuegroups', '10584', '13d87c7b-dd4f-4f5e-8796-f1740c68f8b3', 'Noah Project', true, true, 'never', null),
  ('rescuegroups', '1445',  '7bf9d983-da7a-45a4-b7b0-fd8824bc1f5b', 'The Buster Foundation Pit Bull Education and Rescue', true, true, 'never', null),
  ('rescuegroups', '3182',  '8e2fec86-bbb7-4fa7-a879-6ffa831ab7f4', 'Last Day Dog Rescue', false, false, 'disabled', 'Legacy source is quarantined until it is enrolled in complete-roster sync')
on conflict (source_type, external_org_id) do update set
  shelter_id = excluded.shelter_id,
  display_name = excluded.display_name,
  updated_at = now();

-- Reconcile the three audited Last Day rows to their authoritative IDs, but
-- do not fabricate a successful check. They remain hidden by the source kill
-- switch until org 3182 completes a managed full-roster sync.
update public.dogs
set
  source = 'rescuegroups',
  external_id = rescuegroups_id,
  ingestion_source_id = (
    select id from public.ingestion_sources
    where source_type = 'rescuegroups' and external_org_id = '3182'
  )
where rescuegroups_org_id = '3182'
  and rescuegroups_id in ('10978556', '19792942', '19688759');

update public.dogs d
set ingestion_source_id = s.id
from public.ingestion_sources s
where d.ingestion_source_id is null
  and lower(coalesce(d.source, '')) = 'rescuegroups'
  and d.rescuegroups_org_id = s.external_org_id
  and s.source_type = 'rescuegroups';

-- Fail loudly if a future production preflight finds duplicates. Creating a
-- unique index must never pick a winner or delete inventory implicitly.
do $$
begin
  if exists (
    select 1 from public.dogs
    where rescuegroups_id is not null
    group by rescuegroups_id having count(*) > 1
  ) then
    raise exception 'Duplicate dogs.rescuegroups_id values found; resolve before applying Phase 1 migration';
  end if;

  if exists (
    select 1 from public.dogs
    where source is not null and external_id is not null
    group by lower(source), external_id having count(*) > 1
  ) then
    raise exception 'Duplicate dogs (source, external_id) values found; resolve before applying Phase 1 migration';
  end if;
end $$;

create unique index if not exists dogs_rescuegroups_id_unique
  on public.dogs (rescuegroups_id)
  where rescuegroups_id is not null;

create unique index if not exists dogs_source_external_id_unique
  on public.dogs (lower(source), external_id)
  where source is not null and external_id is not null;

create index if not exists dogs_ingestion_source_id_idx
  on public.dogs (ingestion_source_id);

alter table public.ingestion_sources enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.ai_enrichment_runs enable row level security;

drop policy if exists "Public can read ingestion publication state" on public.ingestion_sources;
create policy "Public can read ingestion publication state"
  on public.ingestion_sources for select
  using (true);

grant select on public.ingestion_sources to anon, authenticated;

-- ingestion_runs and ai_enrichment_runs intentionally have no public policy;
-- service-role automation can read/write them while operational errors and
-- token usage stay private.
