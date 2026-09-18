# Ingestion operations

`ingestion_sources` is the control plane for RescueGroups organizations. The
application only publishes an imported RescueGroups dog when its linked source
has both `enabled = true` and `publication_eligible = true`.

## Disable an organization safely

1. Set `enabled = false`, `publication_eligible = false`,
   `last_sync_status = 'disabled'`, and a non-empty `disabled_reason` for the
   exact `(source_type, external_org_id)` row.
2. Do not delete dog rows. The sync skips the source and every linked dog is
   hidden immediately by the shared publication policy.
3. Review `ingestion_runs`, the source error, and a fresh authoritative roster.

## Recover and re-enable

1. Keep publication disabled while running a bounded complete-roster validation
   in a controlled environment.
2. After the roster and mappings are correct, set `enabled = true` but leave
   `publication_eligible = false` for the first successful managed sync.
3. Confirm its successful `ingestion_runs` record and sampled dog destinations,
   then set `publication_eligible = true` and clear `disabled_reason`.

## Purge (exception only)

Normal disablement never deletes inventory. If legal or provider requirements
require physical removal, first export the exact source and dog IDs, then delete
only rows whose `ingestion_source_id` matches the reviewed source. Purge is a
manual, separately approved operation and is not implemented in automation.

## Rollback notes

The migration is operationally reversible by disabling every source before
rolling application code back. Schema removal should only happen after removing
the two unique indexes, the `dogs.ingestion_source_id` foreign key/column, and
the tracker column. Keep run tables for audit history unless retention policy
explicitly authorizes their deletion.
