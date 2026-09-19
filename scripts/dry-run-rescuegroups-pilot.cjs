/* eslint-disable no-console */

// Read-only rehearsal for the bounded RescueGroups pilot. It fetches complete
// authoritative rosters and reads production state but performs no writes.

require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { fetchDogsForRescue } = require("../sync-rescuegroups-dogs.cjs");

const INPUT = path.join(process.cwd(), "reports", "rescuegroups-pilot-selection.json");
const OUTPUT = path.join(process.cwd(), "reports", "rescuegroups-pilot-dry-run.json");

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

function normalizePlace(value) {
  return String(value || "").trim().toLowerCase();
}

function classifyShelter(source, shelters) {
  const orgMatches = shelters.filter(
    (shelter) => String(shelter.rescuegroups_org_id || "") === String(source.org_id)
  );
  if (orgMatches.length > 1) return { action: "ambiguous", reason: "duplicate_rescuegroups_org_id", matches: orgMatches.map((row) => row.id) };
  if (orgMatches.length === 1) return { action: "match_by_org_id", shelter_id: orgMatches[0].id };

  const nameMatches = shelters.filter(
    (shelter) => normalizeName(shelter.name) === normalizeName(source.name)
  );
  const geographicMatches = nameMatches.filter(
    (shelter) => normalizePlace(shelter.state) === normalizePlace(source.state) &&
      normalizePlace(shelter.city) === normalizePlace(source.city)
  );
  if (geographicMatches.length > 1) {
    return { action: "ambiguous", reason: "duplicate_name_and_geography", matches: geographicMatches.map((row) => row.id) };
  }
  if (geographicMatches.length === 1) {
    const match = geographicMatches[0];
    if (match.rescuegroups_org_id && String(match.rescuegroups_org_id) !== String(source.org_id)) {
      return { action: "conflict", reason: "name_match_linked_to_different_org", shelter_id: match.id, existing_org_id: match.rescuegroups_org_id };
    }
    return { action: "match_by_name_and_geography", shelter_id: match.id };
  }
  return {
    action: "create",
    cross_state_same_name_count: nameMatches.filter(
      (shelter) => normalizePlace(shelter.state) !== normalizePlace(source.state)
    ).length,
  };
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return counts;
}

async function main() {
  for (const key of ["RESCUEGROUPS_API_KEY", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[key]) throw new Error(`Missing ${key}.`);
  }
  const selection = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const client = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: shelters, error: shelterError } = await client
    .from("shelters")
    .select("id,name,city,state,rescuegroups_org_id");
  if (shelterError) throw shelterError;

  const fetched = [];
  const allIds = [];
  for (const organization of selection.selected) {
    const source = {
      name: organization.name,
      city: organization.city,
      state: organization.state,
      rescueGroupsOrgId: organization.org_id,
      ingestionSourceId: "dry-run-only",
      ingestionSourceState: {
        id: "dry-run-only",
        source_type: "rescuegroups",
        external_org_id: organization.org_id,
        enabled: true,
        publication_eligible: true,
        last_successful_sync_at: new Date().toISOString(),
      },
    };
    const result = await fetchDogsForRescue(source);
    allIds.push(...result.dogs.map((dog) => String(dog.rescuegroups_id)));
    fetched.push({ organization, source, roster: result.roster, dogs: result.dogs });
  }

  const { data: existingDogs, error: existingError } = await client
    .from("dogs")
    .select("id,rescuegroups_id,rescuegroups_org_id,source,external_id,adoptable,availability_status")
    .in("rescuegroups_id", [...new Set(allIds)]);
  if (existingError) throw existingError;
  const existingById = new Map((existingDogs || []).map((dog) => [String(dog.rescuegroups_id), dog]));
  const selectedIdCounts = countBy(allIds);
  const crossRosterDuplicates = Object.entries(selectedIdCounts).filter(([, count]) => count > 1).map(([id, count]) => ({ id, count }));

  const organizations = fetched.map(({ organization, dogs }) => {
    const accepted = dogs.filter((dog) => !dog._publicationFilterReason);
    const rejected = dogs.filter((dog) => dog._publicationFilterReason);
    const collisions = dogs.filter((dog) => {
      const existing = existingById.get(String(dog.rescuegroups_id));
      return existing && String(existing.rescuegroups_org_id || "") !== String(organization.org_id);
    });
    const updates = dogs.filter((dog) => existingById.has(String(dog.rescuegroups_id))).length;
    const rejectedReasons = countBy(rejected.map((dog) => dog._publicationFilterReason));
    return {
      org_id: organization.org_id,
      name: organization.name,
      state: organization.state,
      fetched: dogs.length,
      accepted: accepted.length,
      rejected: rejected.length,
      would_insert: accepted.filter((dog) => !existingById.has(String(dog.rescuegroups_id))).length,
      would_update: updates,
      publication_eligible: accepted.length,
      missing_links: dogs.filter((dog) => !dog.adoption_url).length,
      missing_photos: dogs.filter((dog) => !dog.photo_url).length,
      invalid_states: dogs.filter((dog) => !/^(?:A[LKZR]|C[AOT]|D[CE]|F[LM]|G[AU]|HI|I[ADLN]|K[SY]|LA|M[ADEHINOPST]|N[CDEHJMVY]|O[HKR]|P[A R]|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY])$/.test(String(dog.placement_state || "").toUpperCase())).length,
      pending_or_unavailable: dogs.filter((dog) => dog.adoption_pending || dog.adoptable !== true).length,
      potential_duplicates: collisions.length,
      source_collisions: collisions.map((dog) => ({ rescuegroups_id: dog.rescuegroups_id, existing_org_id: existingById.get(String(dog.rescuegroups_id))?.rescuegroups_org_id })),
      rejection_reasons: rejectedReasons,
      shelter: classifyShelter(organization, shelters || []),
    };
  });

  const byState = [];
  for (const state of selection.states) {
    const rows = organizations.filter((row) => row.state === state);
    byState.push({
      state,
      organizations: rows.length,
      fetched: rows.reduce((sum, row) => sum + row.fetched, 0),
      publication_eligible: rows.reduce((sum, row) => sum + row.publication_eligible, 0),
      rejected: rows.reduce((sum, row) => sum + row.rejected, 0),
    });
  }
  const aggregateReasons = {};
  for (const row of organizations) {
    for (const [reason, count] of Object.entries(row.rejection_reasons)) {
      aggregateReasons[reason] = (aggregateReasons[reason] || 0) + count;
    }
  }
  const totalFetched = organizations.reduce((sum, row) => sum + row.fetched, 0);
  const totalEligible = organizations.reduce((sum, row) => sum + row.publication_eligible, 0);
  const report = {
    generated_at: new Date().toISOString(),
    mode: "READ ONLY",
    selected_states: selection.states,
    summary: {
      organizations: organizations.length,
      fetched: totalFetched,
      accepted: totalEligible,
      rejected: totalFetched - totalEligible,
      would_insert: organizations.reduce((sum, row) => sum + row.would_insert, 0),
      would_update: organizations.reduce((sum, row) => sum + row.would_update, 0),
      exact_expected_public_increase: organizations.reduce((sum, row) => sum + row.would_insert, 0),
      missing_links: organizations.reduce((sum, row) => sum + row.missing_links, 0),
      missing_photos: organizations.reduce((sum, row) => sum + row.missing_photos, 0),
      invalid_states: organizations.reduce((sum, row) => sum + row.invalid_states, 0),
      pending_or_unavailable: organizations.reduce((sum, row) => sum + row.pending_or_unavailable, 0),
      potential_duplicates: organizations.reduce((sum, row) => sum + row.potential_duplicates, 0) + crossRosterDuplicates.length,
      shelter_ambiguities_or_conflicts: organizations.filter((row) => ["ambiguous", "conflict"].includes(row.shelter.action)).length,
      photo_coverage_pct: totalFetched ? Math.round((totalFetched - organizations.reduce((sum, row) => sum + row.missing_photos, 0)) / totalFetched * 10000) / 100 : 0,
      adoption_destination_coverage_pct: totalFetched ? Math.round((totalFetched - organizations.reduce((sum, row) => sum + row.missing_links, 0)) / totalFetched * 10000) / 100 : 0,
      publication_ready_pct: totalFetched ? Math.round(totalEligible / totalFetched * 10000) / 100 : 0,
    },
    rejection_reasons: aggregateReasons,
    cross_roster_duplicates: crossRosterDuplicates,
    by_state: byState,
    organizations,
  };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ summary: report.summary, rejection_reasons: report.rejection_reasons, by_state: report.by_state }, null, 2));
  console.log(`Wrote ${OUTPUT}`);

  if (report.summary.potential_duplicates > 0 || report.summary.shelter_ambiguities_or_conflicts > 0) {
    throw new Error("Pilot dry run failed collision or shelter safety gates.");
  }
  if (report.summary.exact_expected_public_increase < 500 || report.summary.exact_expected_public_increase > 1500) {
    throw new Error("Pilot dry run is outside the 500-1500 qualified-dog target.");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Pilot dry run failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { classifyShelter };
