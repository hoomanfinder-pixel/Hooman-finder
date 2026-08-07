begin;

alter table public.dogs
  add column if not exists source_content_hash text,
  add column if not exists ai_enriched_source_hash text;

comment on column public.dogs.source_content_hash is
  'Hash of the current bio/structured fields AI enrichment reads as evidence (see scripts/dog-enrichment-hash.cjs). Recomputed on every write by sync-rescuegroups-dogs.cjs and scripts/enrich-dacc-bios.cjs.';

comment on column public.dogs.ai_enriched_source_hash is
  'The source_content_hash value in effect the last time scripts/enrich-dogs-ai.cjs checked this dog against OpenAI. When this differs from source_content_hash, the dog is eligible for automatic re-enrichment. Run scripts/backfill-source-content-hash.cjs once after this migration, before the first automated enrichment run, to avoid flagging every already-enriched dog as changed.';

commit;
