import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (filename) => fs.readFileSync(path.join(ROOT, filename), "utf8");

test("rollout keeps scheduling paused while manual dispatch uses bounded retrying drain mode", () => {
  const workflow = read(".github/workflows/enrich-dogs-ai.yml");
  assert.doesNotMatch(workflow, /^\s{2}schedule:/m);
  assert.match(workflow, /restore the planned schedule:/);
  assert.match(workflow, /cron:\s*["']0 13 \* \* \*["']/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /--drain/);
  assert.match(workflow, /--limit="\$BATCH_SIZE"/);
  assert.match(workflow, /--max-batches="\$MAX_BATCHES"/);
  assert.match(workflow, /--max-attempts=3/);
  assert.match(workflow, /default:\s*4/);
  assert.doesNotMatch(workflow, /--force/);
});

test("the canonical supported importer uses shared source-content hashing", () => {
  const sync = read("sync-rescuegroups-dogs.cjs");
  assert.match(sync, /require\("\.\/scripts\/dog-enrichment-hash\.cjs"\)/);
  assert.match(sync, /computeSourceContentHash\(cleanDog\)/);
  assert.match(sync, /mergeHashedSnapshot\(existingDog, updateRow\)/);
});

test("legacy importer write paths are explicitly blocked or deprecated", () => {
  const assertDeprecatedBeforeClientCreation = (filename) => {
    const source = read(filename);
    assert.match(source, /Deprecated importer:/, filename);
    const stopCall = source.lastIndexOf("stopDeprecatedImporter();");
    const firstClientCreation = source.indexOf("createClient(");
    assert.ok(stopCall >= 0, `${filename} must call its deprecation guard`);
    assert.ok(
      firstClientCreation < 0 || stopCall < firstClientCreation,
      `${filename} must stop before creating a database client`
    );
  };

  assertDeprecatedBeforeClientCreation("import-top-recommended-rescues.js");

  // These obsolete local scripts are not tracked production paths. If a
  // developer has either historical copy in the working tree, it must still
  // carry the same fail-closed guard.
  for (const filename of ["import-happy-days-dogs.js", "import-michigan-dogs.js"]) {
    if (fs.existsSync(path.join(ROOT, filename))) {
      assertDeprecatedBeforeClientCreation(filename);
    }
  }

  const dacc = read("scripts/import-dacc-rescuegroups.cjs");
  assert.match(dacc, /if \(CONFIRMED\)/);
  assert.match(dacc, /Deprecated production write path:/);
});

test("source-description provenance migration is backward-safe and constraint-free", () => {
  const migration = read("supabase/migrations/20261005233000_add_source_description_provenance.sql");
  assert.match(migration, /add column if not exists source_description_hash text/);
  assert.match(migration, /add column if not exists source_description_conflict boolean not null default false/);
  assert.doesNotMatch(migration, /bio_good_with_(?:dogs|cats|kids)_check/);
});
