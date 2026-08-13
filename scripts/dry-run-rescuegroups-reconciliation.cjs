/* eslint-disable no-console */

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");
const { RESCUEGROUPS_SOURCES } = require("./rescuegroups-sources.cjs");
const { planStaleDogs } = require("./rescuegroups-roster.cjs");
const {
  fetchDogsForRescue,
} = require("../sync-rescuegroups-dogs.cjs");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INCLUDE_DETAILS = process.argv.includes("--details");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing read-only dry-run Supabase configuration.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAllDogs() {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("dogs")
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }
  return rows;
}

function countReasons(dogs) {
  const reasons = new Map();
  for (const dog of dogs) {
    const reason = dog._publicationFilterReason;
    if (!reason) continue;
    reasons.set(reason, (reasons.get(reason) || 0) + 1);
  }
  return Object.fromEntries([...reasons.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function main() {
  const { filterPublicDogs } = await import("../src/lib/dogVisibility.js");
  const allDogs = await fetchAllDogs();
  const results = [];

  for (const source of RESCUEGROUPS_SOURCES) {
    const { roster, dogs } = await fetchDogsForRescue(source);
    const existing = allDogs.filter(
      (dog) => String(dog.rescuegroups_org_id || "") === source.rescueGroupsOrgId
    );
    const existingByAnimalId = new Map(
      existing
        .filter((dog) => dog.rescuegroups_id)
        .map((dog) => [String(dog.rescuegroups_id), dog])
    );

    const inserts = dogs.filter(
      (dog) =>
        !existingByAnimalId.has(String(dog.rescuegroups_id)) &&
        !dog._publicationFilterReason
    );
    const updates = dogs.filter((dog) =>
      existingByAnimalId.has(String(dog.rescuegroups_id))
    );
    const filtered = dogs.filter((dog) => dog._publicationFilterReason);
    const stale = planStaleDogs(existing, source.rescueGroupsOrgId, roster.authoritativeIds);
    const publicIds = new Set(filterPublicDogs(existing).map((dog) => dog.id));

    results.push({
      org_id: source.rescueGroupsOrgId,
      organization: source.name,
      api_roster: roster.count,
      existing_db: existing.length,
      public_db: publicIds.size,
      inserts: inserts.length,
      updates: updates.length,
      stale_marks: stale.length,
      stale_public: stale.filter((dog) => publicIds.has(dog.id)).length,
      filtered_not_public: filtered.length,
      filtered_reasons: countReasons(filtered),
      ...(INCLUDE_DETAILS
        ? {
            insert_names: inserts.map((dog) => dog.name),
            stale_names: stale.map((dog) => dog.name),
          }
        : {}),
    });
  }

  const totals = results.reduce(
    (sum, row) => {
      for (const key of [
        "api_roster",
        "existing_db",
        "public_db",
        "inserts",
        "updates",
        "stale_marks",
        "stale_public",
        "filtered_not_public",
      ]) {
        sum[key] += row[key];
      }
      return sum;
    },
    {
      api_roster: 0,
      existing_db: 0,
      public_db: 0,
      inserts: 0,
      updates: 0,
      stale_marks: 0,
      stale_public: 0,
      filtered_not_public: 0,
    }
  );

  const report = {
    generated_at: new Date().toISOString(),
    mode: "READ ONLY - no Supabase writes",
    results,
    totals,
    quarantined: [
      {
        org_id: "3182",
        organization: "Last Day Dog Rescue",
        reason: "Current RescueGroups roster is zero and has not been independently verified as legitimate",
      },
    ],
  };

  console.table(
    results.map(({ filtered_reasons, insert_names, stale_names, ...row }) => row)
  );
  console.log(JSON.stringify(report, null, 2));
  console.log("READ ONLY dry-run complete. No database writes were made.");
}

main().catch((error) => {
  console.error(`Dry-run failed: ${error.message}`);
  process.exit(1);
});
