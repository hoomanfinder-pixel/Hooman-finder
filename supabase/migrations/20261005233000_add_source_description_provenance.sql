begin;

alter table public.dogs
  add column if not exists source_description_hash text,
  add column if not exists source_description_conflict boolean not null default false;

comment on column public.dogs.source_description_hash is
  'SHA-256 of the most recent non-empty biography supplied by the canonical source importer. Used to distinguish safe upstream updates from possible local edits without storing duplicate biography text.';

comment on column public.dogs.source_description_conflict is
  'True when the stored description differs from both the previously imported source biography and the latest source biography, so automation preserved the possible local edit.';

commit;
