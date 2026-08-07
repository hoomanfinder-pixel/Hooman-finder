// scripts/backfill-source-content-hash.cjs
//
// One-time (idempotent) backfill for the source_content_hash /
// ai_enriched_source_hash columns added for automated AI enrichment
// (see scripts/dog-enrichment-hash.cjs and the
// 20260806000000_add_ai_enrichment_automation_tracking.sql migration).
//
// Run this ONCE, right after applying that migration and BEFORE the first
// automated enrichment run (scheduled or manual). It establishes today's DB
// state as the enrichment baseline so already-enriched dogs are not all
// flagged as "changed" and re-sent to OpenAI purely because the tracking
// columns are new and empty.
//
// Safe to re-run: for a dog that was already enriched (ai_enriched_at set),
// it stamps ai_enriched_source_hash to match today's source_content_hash
// only if it doesn't already match. It never touches bio_*, ai_traits, or
// any confirmed shelter/structured field, and it never enriches a dog that
// was never enriched before (that dog stays eligible the normal way, via
// ai_enriched_at IS NULL, unaffected by this script).
//
// Run:
//   node scripts/backfill-source-content-hash.cjs             (writes)
//   node scripts/backfill-source-content-hash.cjs --dry-run   (prints only)

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");
const { computeSourceContentHash, HASHED_FIELDS } = require("./dog-enrichment-hash.cjs");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPABASE_URL) throw new Error("Missing VITE_SUPABASE_URL in .env.local");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function main() {
  console.log("========================================");
  console.log(`Source content hash backfill — ${DRY_RUN ? "DRY RUN (writes nothing)" : "WRITE"}`);
  console.log("========================================");

  // Explicit safety-net cap so this one-time backfill can't silently cover
  // only a partial table under PostgREST's own default row cap (commonly
  // 1000) — see the matching note in scripts/enrich-dogs-ai.cjs's fetchDogs().
  const { data: dogs, error } = await supabase
    .from("dogs")
    .select(`id, ai_enriched_at, source_content_hash, ai_enriched_source_hash, ${HASHED_FIELDS.join(", ")}`)
    .limit(5000);

  if (error) throw error;

  if (dogs?.length === 5000) {
    console.warn(
      "WARNING: fetched exactly 5000 rows — the dogs table may be larger than this script's safety cap. Re-run with a higher .limit() to confirm full coverage."
    );
  }

  let updated = 0;
  let alreadyCurrent = 0;

  for (const dog of dogs || []) {
    const hash = computeSourceContentHash(dog);
    const payload = {};

    if (dog.source_content_hash !== hash) {
      payload.source_content_hash = hash;
    }

    // Only stamp ai_enriched_source_hash for dogs that were already
    // enriched — this is what stops the migration rollout from flagging
    // every existing dog as "changed" on the first automated run.
    // Never-enriched dogs are left alone; they stay eligible the normal way.
    if (dog.ai_enriched_at && dog.ai_enriched_source_hash !== hash) {
      payload.ai_enriched_source_hash = hash;
    }

    if (Object.keys(payload).length === 0) {
      alreadyCurrent += 1;
      continue;
    }

    console.log(`${DRY_RUN ? "Would update" : "Updating"} ${dog.name || dog.id}: ${JSON.stringify(payload)}`);

    if (!DRY_RUN) {
      const { error: updateError } = await supabase.from("dogs").update(payload).eq("id", dog.id);
      if (updateError) throw updateError;
    }

    updated += 1;
  }

  console.log("");
  console.log(`Done. ${DRY_RUN ? "Would update" : "Updated"}: ${updated}. Already current: ${alreadyCurrent}.`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
