import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNationwideCoverageReport,
  buildUnverifiedCoverageReport,
  classifyEvidenceSource,
  classifyHighCompatibilityEvidence,
  compareCoverageReports,
  getUnscoredQuestions,
  isAggregateOnlyReport,
  isProductionStrongTier,
  isValidAggregateCoverageReport,
  US_STATE_CODES,
} from "./nationwideCoverageReport.mjs";
import {
  fetchPublicInventorySnapshot,
  IncompleteInventorySnapshotError,
  PUBLIC_DOG_SELECT,
} from "./publicCoverageInventory.mjs";

const REFERENCE = "2026-11-27T01:00:28.833Z";
const REVISIONS = {
  report_version: 1,
  matcher_revision: "matcher-hash",
  profile_set_version: "profile-hash",
  report_definition_revision: "definition-hash",
};

function rescueGroupsDog({
  id = "dog-1",
  placementState = "CA",
  shelterState = "MI",
  lastChecked = REFERENCE,
  sourceEnabled = true,
} = {}) {
  return {
    id,
    name: "Aggregate fixture dog",
    source: "rescuegroups",
    rescuegroups_id: id,
    external_id: id,
    rescuegroups_org_id: "org-1",
    ingestion_source_id: "source-1",
    placement_state: placementState,
    placement_city: "",
    adoptable: true,
    adoption_pending: false,
    availability_status: "available",
    imported_status: "visible",
    photo_url: "https://images.example.org/photo.jpg",
    adoption_url: "https://rescuegroups.org/organizations/org-1/dogs/" + id,
    last_checked_at: lastChecked,
    potty_trained: null,
    shelters: { id: "shelter-1", name: "Fixture Shelter", city: "Directory City", state: shelterState },
    ingestion_sources: {
      id: "source-1",
      source_type: "rescuegroups",
      external_org_id: "org-1",
      enabled: sourceEnabled,
      publication_eligible: true,
      last_successful_sync_at: REFERENCE,
    },
  };
}

function mockClient(rows, { fail = false, changingCount = false } = {}) {
  let pageNumber = 0;
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, "dogs");
      const query = {
        select(selection, options) { calls.push({ selection, options }); return query; },
        eq(...args) { calls.push({ eq: args }); return query; },
        or(value) { calls.push({ or: value }); return query; },
        in(...args) { calls.push({ in: args }); return query; },
        order(...args) { calls.push({ order: args }); return query; },
        range(from, to) {
          const current = pageNumber++;
          if (fail) return Promise.resolve({ data: null, error: { message: "database unavailable" }, count: null });
          const count = changingCount && current > 0 ? rows.length + 1 : rows.length;
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null, count });
        },
      };
      return query;
    },
  };
}

test("public source projection includes the authoritative external_org_id", () => {
  assert.match(PUBLIC_DOG_SELECT, /ingestion_sources\([^)]*external_org_id/);
});

test("fixed reference time filters disabled and stale listings without weakening visibility", async () => {
  const rows = [
    rescueGroupsDog(),
    rescueGroupsDog({ id: "disabled", sourceEnabled: false }),
    rescueGroupsDog({ id: "stale", lastChecked: new Date(Date.parse(REFERENCE) - 73 * 60 * 60 * 1000).toISOString() }),
  ];
  const client = mockClient(rows);
  const snapshot = await fetchPublicInventorySnapshot({ client, referenceTime: Date.parse(REFERENCE), pageSize: 1 });
  assert.equal(snapshot.reference_timestamp, REFERENCE);
  assert.equal(snapshot.query_rows, 3);
  assert.equal(snapshot.candidate_rows.length, 3);
  assert.deepEqual(snapshot.public_dogs.map((dog) => dog.id), ["dog-1"]);
  assert.equal(client.calls[0].options.count, "exact");
  assert.equal(client.calls[0].selection, PUBLIC_DOG_SELECT);
});

test("stale RescueGroups candidate checks are reported separately from public listings", () => {
  const stale = rescueGroupsDog({ lastChecked: new Date(Date.parse(REFERENCE) - 73 * 60 * 60 * 1000).toISOString() });
  const report = buildNationwideCoverageReport({
    candidateRows: [stale],
    publicDogs: [],
    referenceTimestamp: REFERENCE,
    profiles: [],
    revisions: REVISIONS,
  });
  assert.equal(report.listing_freshness.checked_over_72h, 0);
  assert.equal(report.candidate_check_freshness.stale_rescuegroups_candidate_rows, 1);
  assert.match(report.candidate_check_freshness.note, /not public listings/);
});

test("a valid empty query is different from a failed or incomplete query", async () => {
  const empty = await fetchPublicInventorySnapshot({
    client: mockClient([]),
    referenceTime: Date.parse(REFERENCE),
  });
  assert.equal(empty.query_rows, 0);
  assert.deepEqual(empty.public_dogs, []);

  await assert.rejects(
    fetchPublicInventorySnapshot({ client: mockClient([], { fail: true }), referenceTime: Date.parse(REFERENCE) }),
    /Public inventory query failed/
  );
  await assert.rejects(
    fetchPublicInventorySnapshot({
      client: mockClient([rescueGroupsDog(), rescueGroupsDog({ id: "dog-2" })], { changingCount: true }),
      referenceTime: Date.parse(REFERENCE),
      pageSize: 1,
    }),
    IncompleteInventorySnapshotError
  );
});

test("the report includes all 50 states, including Minnesota and zero-inventory states", () => {
  assert.equal(US_STATE_CODES.length, 50);
  assert.ok(US_STATE_CODES.includes("MN"));
  const report = buildNationwideCoverageReport({
    candidateRows: [],
    publicDogs: [],
    referenceTimestamp: REFERENCE,
    profiles: [],
    revisions: REVISIONS,
  });
  assert.equal(report.nationwide_coverage.states_with_zero_public_inventory, 50);
  assert.ok(report.nationwide_coverage.zero_inventory_states.includes("MN"));
  assert.equal(report.realistic_matching.state_scenarios, 0);
});

test("repeat analysis of one fixed snapshot and reference time is deterministic", () => {
  const args = {
    candidateRows: [rescueGroupsDog()],
    publicDogs: [rescueGroupsDog()],
    referenceTimestamp: REFERENCE,
    evidenceQuality: { alone_time: { structured: { dogs: 0 }, unknown: { dogs: 1 } } },
    revisions: REVISIONS,
  };
  assert.deepEqual(buildNationwideCoverageReport(args), buildNationwideCoverageReport(args));
});

test("dog placement geography remains separate from shelter directory geography", () => {
  const dog = rescueGroupsDog({ placementState: "CA", shelterState: "MI" });
  const report = buildNationwideCoverageReport({
    candidateRows: [dog],
    publicDogs: [dog],
    referenceTimestamp: REFERENCE,
    profiles: [],
    revisions: REVISIONS,
  });
  const states = new Map(report.nationwide_coverage.state_inventory.map((row) => [row.state, row]));
  assert.equal(states.get("CA").public_dogs, 1);
  assert.equal(states.get("MI").public_dogs, 0);
  assert.equal(report.nationwide_coverage.shelter_directory_locations.MI, 1);
  assert.equal(report.nationwide_coverage.placement_city_unknown_dogs, 1);
});

test("evidence categories distinguish structured, explicit biography, AI estimates, mixed, and unknown", () => {
  assert.equal(classifyEvidenceSource("structured"), "structured_confirmed");
  assert.equal(classifyEvidenceSource("bio_explicit"), "biography_explicit");
  assert.equal(classifyEvidenceSource("breed_coat_inference"), "ai_estimated");
  assert.equal(classifyEvidenceSource("profile_inference"), "ai_estimated");
  assert.equal(classifyEvidenceSource("mixed"), "mixed");
  assert.equal(classifyEvidenceSource(null), "unknown");
  assert.equal(classifyEvidenceSource("unexpected-provenance"), "unknown");
});

test("Strong-tier classification uses the production tier label, not raw compatibility", () => {
  assert.equal(isProductionStrongTier({ scorePct: 97, breakdown: { tierLabel: "Limited information" } }), false);
  assert.equal(isProductionStrongTier({ scorePct: 85, breakdown: { tierLabel: "Strong potential fit" } }), true);
  assert.equal(isProductionStrongTier({ scorePct: 84, breakdown: { tierLabel: "Good potential fit" } }), false);
});

test("high raw compatibility diagnostics measure both 60% and 80% evidence boundaries", () => {
  assert.deepEqual(classifyHighCompatibilityEvidence(95, 59), {
    high_raw_compatibility: true,
    below_limited_information_threshold: true,
    below_80_evidence_coverage: true,
  });
  assert.deepEqual(classifyHighCompatibilityEvidence(95, 79), {
    high_raw_compatibility: true,
    below_limited_information_threshold: false,
    below_80_evidence_coverage: true,
  });
  assert.equal(classifyHighCompatibilityEvidence(89, 40).below_80_evidence_coverage, false);
});

test("the baseline alone-time unknown count remains separately reportable", () => {
  const report = buildNationwideCoverageReport({
    candidateRows: [],
    publicDogs: [],
    referenceTimestamp: REFERENCE,
    evidenceQuality: { alone_time: { structured: { dogs: 0 }, bio_explicit: { dogs: 12 }, unknown: { dogs: 1063 } } },
    profiles: [],
    revisions: REVISIONS,
  });
  assert.deepEqual(report.matching_evidence.alone_time, {
    structured: { dogs: 0 }, bio_explicit: { dogs: 12 }, unknown: { dogs: 1063 },
  });
});

test("the 12 unscored quiz questions remain explicit", () => {
  const unscored = getUnscoredQuestions();
  assert.equal(unscored.length, 12);
  assert.ok(unscored.some((question) => question.id === "adoption_city"));
  assert.ok(unscored.some((question) => question.id === "medication_comfort"));
});

test("historical comparison requires matching report, matcher, profile, and definition revisions", () => {
  const current = buildNationwideCoverageReport({ candidateRows: [], publicDogs: [], referenceTimestamp: "2026-11-28T00:00:00.000Z", profiles: [], revisions: REVISIONS });
  const previous = structuredClone(current);
  previous.verification.reference_timestamp = "2026-11-27T00:00:00.000Z";
  assert.equal(isValidAggregateCoverageReport(previous), true);
  assert.equal(compareCoverageReports(current, previous).status, "comparable");
  assert.equal(compareCoverageReports(current, { ...previous, profile_set_version: "new-profile-set" }).status, "unavailable");
  assert.equal(compareCoverageReports(current, buildUnverifiedCoverageReport({ reason: "no data", referenceTimestamp: previous.verification.reference_timestamp, revisions: REVISIONS })).status, "unavailable");
  assert.equal(compareCoverageReports(current, null).status, "unavailable");
  assert.equal(isValidAggregateCoverageReport({ ...previous, nationwide_coverage: { state_inventory: [] } }), false);
});

test("weekly comparisons alert on material changes, not unchanged baseline gaps", () => {
  const previous = buildNationwideCoverageReport({ candidateRows: [], publicDogs: [], referenceTimestamp: "2026-11-27T00:00:00.000Z", profiles: [], revisions: REVISIONS });
  previous.nationwide_coverage.public_dogs = 10;
  previous.nationwide_coverage.states_with_public_inventory = 1;
  previous.nationwide_coverage.state_inventory[0].public_dogs = 10;
  previous.realistic_matching.state_scenarios_without_eligible_dogs = 10;
  previous.realistic_matching.state_scenarios_without_suitable_matches = 100;
  previous.match_confidence.production_tier_counts["Strong potential fit"] = 5;
  previous.match_confidence.raw_compatibility_ge_90_below_80_evidence = 10;
  previous.match_confidence.raw_compatibility_ge_90 = 100;
  previous.match_confidence.high_score_low_evidence_proportions.below_80_pct = 10;
  previous.enrichment.eligible_backlog = 100;
  previous.candidate_check_freshness.stale_rescuegroups_candidate_rows = 0;
  previous.sources.public_source_count = 3;
  const unchanged = structuredClone(previous);
  unchanged.verification.reference_timestamp = "2026-11-28T00:00:00.000Z";
  const unchangedResult = compareCoverageReports(unchanged, previous);
  assert.deepEqual(unchangedResult.alerts, []);

  const current = structuredClone(unchanged);
  current.nationwide_coverage.public_dogs = 0;
  current.nationwide_coverage.states_with_public_inventory = 0;
  current.nationwide_coverage.state_inventory[0].public_dogs = 0;
  current.realistic_matching.state_scenarios_without_suitable_matches = 125;
  current.match_confidence.high_score_low_evidence_proportions.below_80_pct = 21;
  current.enrichment.eligible_backlog = 130;
  current.candidate_check_freshness.stale_rescuegroups_candidate_rows = 1;
  current.sources.public_source_count = 2;
  const result = compareCoverageReports(current, previous);
  assert.ok(result.alerts.some((alert) => alert.code === "state_inventory_lost"));
  assert.ok(result.alerts.some((alert) => alert.code === "stale_candidate_inventory"));
  assert.ok(result.alerts.some((alert) => alert.code === "scenario_coverage_regression"));
  assert.ok(result.alerts.some((alert) => alert.code === "high_score_evidence_regression"));
  assert.ok(result.alerts.some((alert) => alert.code === "enrichment_backlog_growth"));
  assert.ok(result.alerts.some((alert) => alert.code === "public_source_count_drop"));
});

test("artifacts contain aggregates only and unverified inventory is never represented as zero", () => {
  const report = buildNationwideCoverageReport({
    candidateRows: [rescueGroupsDog()],
    publicDogs: [rescueGroupsDog()],
    referenceTimestamp: REFERENCE,
    profiles: [],
    revisions: REVISIONS,
  });
  assert.equal(isAggregateOnlyReport(report), true);
  assert.equal(JSON.stringify(report).includes("Aggregate fixture dog"), false);
  assert.equal(JSON.stringify(report).includes("source_url"), false);

  const unverified = buildUnverifiedCoverageReport({ reason: "query failed", referenceTimestamp: REFERENCE, revisions: REVISIONS });
  assert.equal(unverified.verification.status, "unverified");
  assert.equal("nationwide_coverage" in unverified, false);
  assert.match(unverified.verification.reason, /query failed/);
});
