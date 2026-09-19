/* eslint-disable no-console */

// Read-only national RescueGroups discovery and deterministic organization scoring.
// Writes an auditable JSON report only; it never writes to Supabase.

require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const {
  mapAnimalToDogRow,
  getDogPublicationFilterReason,
} = require("../sync-rescuegroups-dogs.cjs");
const {
  firstSafeAuthoritativeUrl,
} = require("./rescuegroups-adoption-urls.cjs");

const API_URL = "https://api.rescuegroups.org/v5/public/animals/search/available/dogs/";
const PAGE_SIZE = 250;
const OUTPUT = path.join(process.cwd(), "reports", "rescuegroups-pilot-discovery.json");
const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

function clean(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function pct(n, total) {
  return total > 0 ? Math.round((n / total) * 10000) / 100 : 0;
}

function relationshipId(entity, names) {
  for (const name of names) {
    const data = entity?.relationships?.[name]?.data;
    const ref = Array.isArray(data) ? data[0] : data;
    if (ref?.id) return String(ref.id);
  }
  return null;
}

function includedMap(included) {
  return new Map((included || []).filter((x) => x?.type && x?.id).map((x) => [`${x.type}:${x.id}`, x]));
}

function includedResource(map, types, id) {
  if (!id) return null;
  for (const type of types) {
    const found = map.get(`${type}:${id}`);
    if (found) return found;
  }
  return null;
}

function resourcesForAnimal(animal, map) {
  const resources = [];
  const seen = new Set();
  for (const relationship of Object.values(animal?.relationships || {})) {
    const refs = Array.isArray(relationship?.data) ? relationship.data : [relationship?.data];
    for (const ref of refs) {
      if (!ref?.type || !ref?.id) continue;
      const resource = map.get(`${ref.type}:${ref.id}`);
      const key = `${ref.type}:${ref.id}`;
      if (resource && !seen.has(key)) {
        seen.add(key);
        resources.push(resource);
      }
    }
  }
  return resources;
}

function animalSpecificUrl(animal) {
  const attrs = animal?.attributes || {};
  return firstSafeAuthoritativeUrl(attrs.url, attrs.webpageUrl, attrs.animalUrl, attrs.adoptionUrl, attrs.link);
}

function sourceState(animal, org, location) {
  const candidates = [
    animal?.attributes?.locationState,
    org?.attributes?.state,
    location?.attributes?.state,
  ];
  for (const value of candidates) {
    const state = String(value || "").trim().toUpperCase();
    if (US_STATES.has(state)) return state;
  }
  return null;
}

async function fetchPage(page, attempt = 1) {
  const url = new URL(API_URL);
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("include", "orgs,locations,pictures,statuses");
  url.searchParams.set("sort", "-animals.updatedDate");
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: process.env.RESCUEGROUPS_API_KEY,
        Accept: "application/vnd.api+json",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    return fetchPage(page, attempt + 1);
  }
}

async function fetchNationalFeed() {
  const snapshotDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "hooman-rg-pilot-"));
  let pages = 1;
  let advertisedCount = null;
  let fetchedCount = 0;
  for (let page = 1; page <= pages; page += 1) {
    const json = await fetchPage(page);
    const batch = Array.isArray(json.data) ? json.data : [];
    fetchedCount += batch.length;
    pages = Number(json.meta?.pages || 1);
    advertisedCount = Number(json.meta?.count || fetchedCount);
    fs.writeFileSync(path.join(snapshotDir, `${String(page).padStart(3, "0")}.json`), JSON.stringify(json));
    if (page === 1 || page % 10 === 0 || page === pages) {
      console.log(`Fetched page ${page}/${pages}; ${fetchedCount}/${advertisedCount} dogs.`);
    }
  }
  if (advertisedCount !== null && Math.abs(fetchedCount - advertisedCount) > PAGE_SIZE) {
    throw new Error(`Incomplete national feed: fetched ${fetchedCount}, API advertised ${advertisedCount}.`);
  }
  return { snapshotDir, pages, advertisedCount, fetchedCount };
}

async function knownSources() {
  const client = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from("ingestion_sources")
    .select("external_org_id,display_name,enabled,publication_eligible,shelter_id,last_sync_status");
  if (error) throw error;
  return new Map((data || []).map((row) => [String(row.external_org_id), row]));
}

function qualification(metrics) {
  const rejectionReasons = [];
  if (!metrics.state) rejectionReasons.push("invalid_or_missing_state");
  if (metrics.dog_count < 2) rejectionReasons.push("roster_too_small");
  if (metrics.photo_coverage_pct < 90) rejectionReasons.push("photo_coverage_below_90pct");
  if (metrics.adoption_destination_coverage_pct < 90) rejectionReasons.push("adoption_destination_coverage_below_90pct");
  if (metrics.publication_ready_pct < 70) rejectionReasons.push("publication_ready_below_70pct");
  if (metrics.identity_issue_count > 0) rejectionReasons.push("identity_issues");

  const sizeScore = Math.min(5, Math.log2(Math.max(1, metrics.dog_count)));
  const score = Math.max(0, Math.round((
    metrics.adoption_destination_coverage_pct * 0.3 +
    metrics.photo_coverage_pct * 0.25 +
    metrics.publication_ready_pct * 0.25 +
    metrics.description_coverage_pct * 0.08 +
    metrics.location_coverage_pct * 0.05 +
    metrics.animal_specific_link_coverage_pct * 0.05 +
    sizeScore * 0.4 -
    metrics.pending_or_courtesy_pct * 0.1
  ) * 10) / 10);

  if (score < 80) rejectionReasons.push("quality_score_below_80");
  return { score, qualified: rejectionReasons.length === 0, rejection_reasons: rejectionReasons };
}

async function analyze(feed, known) {
  const { getRescueGroupsPublicationIneligibilityReason } = await import("../src/lib/dogVisibility.js");
  const orgs = new Map();
  let invalidStateAnimals = 0;
  let missingOrgAnimals = 0;
  const checkedAt = new Date().toISOString();

  for (let page = 1; page <= feed.pages; page += 1) {
    const json = JSON.parse(fs.readFileSync(path.join(feed.snapshotDir, `${String(page).padStart(3, "0")}.json`), "utf8"));
    const map = includedMap(json.included || []);
    for (const animal of json.data || []) {
      const orgId = relationshipId(animal, ["orgs", "org", "organization", "organizations"]);
      const locationId = relationshipId(animal, ["locations", "location"]);
      const org = includedResource(map, ["orgs", "organizations"], orgId);
      const location = includedResource(map, ["locations", "location"], locationId);
      if (!orgId) { missingOrgAnimals += 1; continue; }
      const state = sourceState(animal, org, location);
      if (!state) { invalidStateAnimals += 1; continue; }
      if (!orgs.has(orgId)) {
        const attrs = org?.attributes || {};
        orgs.set(orgId, {
          org_id: orgId,
          name: clean(attrs.name) || clean(animal?.attributes?.orgName) || `RescueGroups org ${orgId}`,
          state,
          city: clean(attrs.city) || clean(location?.attributes?.city),
          organization_url: firstSafeAuthoritativeUrl(attrs.adoptionUrl, attrs.url, attrs.website),
          known_source: known.get(orgId) || null,
          counts: { total: 0, photo: 0, destination: 0, animalLink: 0, description: 0, location: 0, pendingCourtesy: 0, publishable: 0, identity: 0 },
          rejectionCounts: {},
        });
      }
      const group = orgs.get(orgId);
      const fakeSource = {
        name: group.name, city: group.city, state: group.state, rescueGroupsOrgId: group.org_id,
        supabaseShelterId: group.known_source?.shelter_id || null, ingestionSourceId: "discovery-only",
        ingestionSourceState: { id: "discovery-only", source_type: "rescuegroups", external_org_id: group.org_id, enabled: true, publication_eligible: true, last_successful_sync_at: checkedAt },
      };
      const row = mapAnimalToDogRow(animal, resourcesForAnimal(animal, map), fakeSource);
      if (!row.adoption_url && group.organization_url) { row.adoption_url = group.organization_url; row.source_url = group.organization_url; }
      const counts = group.counts;
      counts.total += 1;
      if (row.photo_url) counts.photo += 1;
      if (row.adoption_url) counts.destination += 1;
      if (animalSpecificUrl(animal)) counts.animalLink += 1;
      if (row.description) counts.description += 1;
      if (row.placement_city && row.placement_state) counts.location += 1;
      if (row.adoption_pending || animal?.attributes?.isCourtesyListing === true) counts.pendingCourtesy += 1;
      if (!row.rescuegroups_id || row.rescuegroups_id !== row.external_id) counts.identity += 1;
      const reason = getDogPublicationFilterReason(row) || getRescueGroupsPublicationIneligibilityReason(row);
      if (reason) group.rejectionCounts[reason] = (group.rejectionCounts[reason] || 0) + 1;
      else counts.publishable += 1;
    }
  }

  const rows = [];
  for (const group of orgs.values()) {
    const counts = group.counts;
    const total = counts.total;
    const metrics = {
      org_id: group.org_id,
      name: group.name,
      state: group.state,
      city: group.city,
      dog_count: total,
      estimated_publishable_dogs: counts.publishable,
      photo_coverage_pct: pct(counts.photo, total),
      adoption_destination_coverage_pct: pct(counts.destination, total),
      animal_specific_link_coverage_pct: pct(counts.animalLink, total),
      description_coverage_pct: pct(counts.description, total),
      location_coverage_pct: pct(counts.location, total),
      pending_or_courtesy_pct: pct(counts.pendingCourtesy, total),
      publication_ready_pct: pct(counts.publishable, total),
      identity_issue_count: counts.identity,
      rejection_counts: group.rejectionCounts,
      already_known: Boolean(group.known_source),
      known_enabled: group.known_source?.enabled ?? null,
      known_publication_eligible: group.known_source?.publication_eligible ?? null,
      organization_url: group.organization_url,
    };
    rows.push({ ...metrics, ...qualification(metrics) });
  }

  const stateMap = new Map();
  for (const row of rows) {
    if (!stateMap.has(row.state)) stateMap.set(row.state, { state: row.state, available_dogs: 0, organizations: 0, qualified_dogs: 0, qualified_organizations: 0 });
    const state = stateMap.get(row.state);
    state.available_dogs += row.dog_count;
    state.organizations += 1;
    if (row.qualified && !row.already_known) {
      state.qualified_dogs += row.estimated_publishable_dogs;
      state.qualified_organizations += 1;
    }
  }

  return {
    generated_at: new Date().toISOString(),
    mode: "READ ONLY",
    national: {
      api_available_dogs: feed.fetchedCount,
      valid_us_dogs: rows.reduce((sum, row) => sum + row.dog_count, 0),
      valid_us_organizations: rows.length,
      valid_us_states: stateMap.size,
      invalid_state_animals: invalidStateAnimals,
      missing_org_animals: missingOrgAnimals,
      api_pages: feed.pages,
    },
    states: [...stateMap.values()].sort((a, b) => b.available_dogs - a.available_dogs || a.state.localeCompare(b.state)),
    organizations: rows.sort((a, b) => b.score - a.score || b.estimated_publishable_dogs - a.estimated_publishable_dogs || a.name.localeCompare(b.name)),
  };
}

async function main() {
  for (const key of ["RESCUEGROUPS_API_KEY", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[key]) throw new Error(`Missing ${key}.`);
  }
  const [feed, known] = await Promise.all([fetchNationalFeed(), knownSources()]);
  const report = await analyze(feed, known);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ national: report.national, states: report.states }, null, 2));
  console.log(`Wrote ${OUTPUT}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Discovery failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { analyze, qualification, sourceState };
