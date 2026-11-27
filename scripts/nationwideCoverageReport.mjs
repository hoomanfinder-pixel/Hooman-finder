import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeRankedMatches, MATCH_WEIGHTS } from "../src/lib/matchingLogic.js";
import { ALL_QUESTIONS } from "../src/lib/quizQuestions.js";
import { filterDogItems } from "../src/lib/dogListFilters.js";
import { buildRealisticMatchProfiles } from "./realistic-match-profiles.mjs";

export const COVERAGE_REPORT_VERSION = 1;
export const LIMITED_INFORMATION_COVERAGE_PCT = 60;
export const HIGH_RAW_COMPATIBILITY_PCT = 90;
export const LOW_EVIDENCE_COVERAGE_PCT = 80;
export const ALERT_THRESHOLDS = Object.freeze({
  minimum_scenario_regression: 10,
  scenario_regression_pct: 20,
  evidence_regression_percentage_points: 10,
  enrichment_backlog_growth_pct: 25,
  enrichment_backlog_growth_dogs: 25,
  meaningful_high_score_sample: 30,
});

export const US_STATE_CODES = Object.freeze([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MATCHER_FILES = [
  "src/lib/matchingLogic.js",
  "src/lib/childCompatibility.js",
  "src/lib/dogVisibility.js",
  "src/lib/dogAvailability.js",
  "src/lib/dogListFilters.js",
  "src/lib/quizQuestions.js",
];

function hashFiles(files, root = ROOT) {
  const hash = crypto.createHash("sha256");
  for (const filename of files) {
    hash.update(filename);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(root, filename)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function getCoverageReportRevisions(root = ROOT) {
  return {
    report_version: COVERAGE_REPORT_VERSION,
    matcher_revision: hashFiles(MATCHER_FILES, root),
    profile_set_version: hashFiles(["scripts/realistic-match-profiles.mjs"], root),
    report_definition_revision: hashFiles([
      "scripts/nationwideCoverageReport.mjs",
      "scripts/publicCoverageInventory.mjs",
      "scripts/audit-match-coverage.mjs",
    ], root),
  };
}

export function getUnscoredQuestions(questions = ALL_QUESTIONS) {
  return questions
    .filter((question) => !Object.hasOwn(MATCH_WEIGHTS, question.id))
    .map((question) => ({ id: question.id, title: question.title || question.label || question.id }));
}

function firstRelation(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function pct(part, total) {
  return total ? Number((part / total * 100).toFixed(2)) : 0;
}

export function classifyEvidenceSource(source) {
  if (source === "structured") return "structured_confirmed";
  if (source === "bio_explicit") return "biography_explicit";
  if (source === "breed_coat_inference" || source === "profile_inference") return "ai_estimated";
  if (source === "mixed") return "mixed";
  return "unknown";
}

export function isProductionStrongTier(result) {
  return result?.breakdown?.tierLabel === "Strong potential fit";
}

export function classifyHighCompatibilityEvidence(rawCompatibilityPct, evidenceCoveragePct) {
  const high = Number(rawCompatibilityPct) >= HIGH_RAW_COMPATIBILITY_PCT;
  const coverage = Number(evidenceCoveragePct);
  return {
    high_raw_compatibility: high,
    below_limited_information_threshold: high && Number.isFinite(coverage) && coverage < LIMITED_INFORMATION_COVERAGE_PCT,
    below_80_evidence_coverage: high && Number.isFinite(coverage) && coverage < LOW_EVIDENCE_COVERAGE_PCT,
  };
}

function normalizedState(value) {
  return String(value || "").trim().toUpperCase();
}

function initializeState(state) {
  return {
    state,
    public_dogs: 0,
    active_sources: new Set(),
    disabled_candidate_dogs: 0,
    placement_cities: new Map(),
    unknown_placement_city_dogs: 0,
    public_dogs_last_checked_within_24h: 0,
    public_dogs_last_checked_24_to_72h: 0,
    public_dogs_last_checked_over_72h: 0,
    public_dogs_last_checked_missing: 0,
    scenario_count: 0,
    scenarios_without_eligible_dogs: 0,
    scenarios_without_suitable_matches: 0,
    scenarios_without_strong_matches: 0,
    eligible_dog_scenario_pairs: 0,
    suitable_dog_scenario_pairs: 0,
    strong_dog_scenario_pairs: 0,
    high_score_low_evidence_pairs: 0,
  };
}

function countLastChecked(state, dog, referenceTime) {
  if (!dog.last_checked_at) {
    state.public_dogs_last_checked_missing += 1;
    return;
  }
  const checked = Date.parse(dog.last_checked_at);
  if (!Number.isFinite(checked)) {
    state.public_dogs_last_checked_missing += 1;
    return;
  }
  const age = referenceTime - checked;
  if (age <= 24 * 60 * 60 * 1000) state.public_dogs_last_checked_within_24h += 1;
  else if (age <= 72 * 60 * 60 * 1000) state.public_dogs_last_checked_24_to_72h += 1;
  else state.public_dogs_last_checked_over_72h += 1;
}

function sourceId(dog, source) {
  return source?.id || dog.ingestion_source_id || dog.shelter_id || dog.rescuegroups_org_id || null;
}

function summarizeSources(candidateRows, publicDogs, referenceTime) {
  const allSources = new Map();
  for (const dog of candidateRows) {
    const source = firstRelation(dog.ingestion_sources);
    if (source?.id) allSources.set(String(source.id), source);
  }
  const publicSources = new Map();
  for (const dog of publicDogs) {
    const source = firstRelation(dog.ingestion_sources);
    const id = sourceId(dog, source);
    if (id) publicSources.set(String(id), source || { id: String(id), enabled: null });
  }
  const syncFreshness = { within_24h: 0, within_72h: 0, over_72h: 0, missing: 0 };
  for (const source of publicSources.values()) {
    const timestamp = Date.parse(source?.last_successful_sync_at || "");
    if (!Number.isFinite(timestamp)) syncFreshness.missing += 1;
    else if (referenceTime - timestamp <= 24 * 60 * 60 * 1000) syncFreshness.within_24h += 1;
    else if (referenceTime - timestamp <= 72 * 60 * 60 * 1000) syncFreshness.within_72h += 1;
    else syncFreshness.over_72h += 1;
  }
  return {
    public_source_count: publicSources.size,
    public_sources_enabled: [...publicSources.values()].filter((source) => source?.enabled === true).length,
    public_sources_disabled_or_unverified: [...publicSources.values()].filter((source) => source?.enabled !== true).length,
    candidate_source_count: allSources.size,
    candidate_sources_disabled: [...allSources.values()].filter((source) => source?.enabled === false).length,
    last_successful_sync_freshness: syncFreshness,
  };
}

function summarizeCandidateCheckFreshness(candidateRows, referenceTime) {
  let stale_rescuegroups_candidate_rows = 0;
  let missing_or_invalid_rescuegroups_check_time = 0;
  for (const dog of candidateRows) {
    if (String(dog?.source || "").trim().toLowerCase() !== "rescuegroups" && !dog?.rescuegroups_id && !dog?.rescuegroups_org_id) continue;
    const checked = Date.parse(dog?.last_checked_at || "");
    if (!Number.isFinite(checked)) missing_or_invalid_rescuegroups_check_time += 1;
    else if (referenceTime - checked > 72 * 60 * 60 * 1000) stale_rescuegroups_candidate_rows += 1;
  }
  return {
    stale_rescuegroups_candidate_rows,
    missing_or_invalid_rescuegroups_check_time,
    note: "Candidate rows may already be hidden by the existing 72-hour publication rule; these counts are not public listings.",
  };
}

function summarizeGeography(dogs, candidateRows, states, referenceTime) {
  const stateRows = new Map(states.map((state) => [state, initializeState(state)]));
  const directories = new Map();
  const directoryStates = new Map();

  for (const dog of dogs) {
    const stateCode = normalizedState(dog.placement_state);
    const state = stateRows.get(stateCode);
    if (!state) continue;
    state.public_dogs += 1;
    countLastChecked(state, dog, referenceTime);
    const source = firstRelation(dog.ingestion_sources);
    const id = sourceId(dog, source);
    if (id) state.active_sources.add(String(id));
    const city = String(dog.placement_city || "").trim();
    if (!city) state.unknown_placement_city_dogs += 1;
    else state.placement_cities.set(city, (state.placement_cities.get(city) || 0) + 1);
    const shelter = firstRelation(dog.shelters);
    if (shelter?.id) {
      directories.set(String(shelter.id), shelter);
      const shelterState = normalizedState(shelter.state) || "UNKNOWN";
      directoryStates.set(shelterState, (directoryStates.get(shelterState) || 0) + 1);
    }
  }

  for (const dog of candidateRows) {
    const state = stateRows.get(normalizedState(dog.placement_state));
    const source = firstRelation(dog.ingestion_sources);
    if (state && source?.enabled === false) state.disabled_candidate_dogs += 1;
  }

  return {
    states: [...stateRows.values()].map((row) => ({
      state: row.state,
      public_dogs: row.public_dogs,
      active_sources: row.active_sources.size,
      disabled_candidate_dogs: row.disabled_candidate_dogs,
      unknown_placement_city_dogs: row.unknown_placement_city_dogs,
      placement_city_completeness_pct: pct(row.public_dogs - row.unknown_placement_city_dogs, row.public_dogs),
      top_placement_cities: [...row.placement_cities.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([city, dogs]) => ({ city, dogs })),
      public_dogs_last_checked_within_24h: row.public_dogs_last_checked_within_24h,
      public_dogs_last_checked_24_to_72h: row.public_dogs_last_checked_24_to_72h,
      public_dogs_last_checked_over_72h: row.public_dogs_last_checked_over_72h,
      public_dogs_last_checked_missing: row.public_dogs_last_checked_missing,
      scenario_count: row.scenario_count,
      scenarios_without_eligible_dogs: row.scenarios_without_eligible_dogs,
      scenarios_without_suitable_matches: row.scenarios_without_suitable_matches,
      scenarios_without_strong_matches: row.scenarios_without_strong_matches,
      eligible_dog_scenario_pairs: row.eligible_dog_scenario_pairs,
      suitable_dog_scenario_pairs: row.suitable_dog_scenario_pairs,
      strong_dog_scenario_pairs: row.strong_dog_scenario_pairs,
      high_score_low_evidence_pairs: row.high_score_low_evidence_pairs,
    })),
    shelter_directory_locations: [...directories.values()].reduce((locations, shelter) => {
      const state = normalizedState(shelter.state) || "UNKNOWN";
      locations[state] = (locations[state] || 0) + 1;
      return locations;
    }, {}),
    shelter_directory_records: directories.size,
    note: "Dog geography uses placement_state and placement_city. Shelter directory geography uses shelters.state/city and is not assumed to be the dog's placement or a verified headquarters.",
  };
}

function enrichStateScenarios(geography, dogs, profiles) {
  const byState = new Map(geography.states.map((row) => [row.state, row]));
  const archetypes = new Map();
  for (const profile of profiles) {
    const ranked = computeRankedMatches(dogs, profile.answers);
    for (const state of US_STATE_CODES) {
      const stateRow = byState.get(state);
      const rows = filterDogItems(ranked, { stateFilter: state }, (item) => item.dog);
      const suitable = rows.filter((row) => ["Good potential fit", "Strong potential fit"].includes(row.breakdown?.tierLabel));
      const strong = rows.filter(isProductionStrongTier);
      stateRow.scenario_count += 1;
      if (!rows.length) stateRow.scenarios_without_eligible_dogs += 1;
      if (!suitable.length) stateRow.scenarios_without_suitable_matches += 1;
      if (!strong.length) stateRow.scenarios_without_strong_matches += 1;
      stateRow.eligible_dog_scenario_pairs += rows.length;
      stateRow.suitable_dog_scenario_pairs += suitable.length;
      stateRow.strong_dog_scenario_pairs += strong.length;
      stateRow.high_score_low_evidence_pairs += rows.filter((row) =>
        Number(row.breakdown?.rawCompatibilityPct) >= HIGH_RAW_COMPATIBILITY_PCT &&
        Number(row.breakdown?.evidenceCoveragePct) < LOW_EVIDENCE_COVERAGE_PCT
      ).length;

      const key = profile.archetype;
      if (!archetypes.has(key)) archetypes.set(key, {
        adopter_scenario: key,
        profile_variants: 0,
        state_scenarios: 0,
        state_scenarios_with_inventory: 0,
        scenarios_without_eligible_dogs: 0,
        scenarios_without_suitable_matches: 0,
        scenarios_without_strong_matches: 0,
        covered_scenarios_without_eligible_dogs: 0,
        covered_scenarios_without_suitable_matches: 0,
        covered_scenarios_without_strong_matches: 0,
        strong_match_pairs: 0,
        eligible_dog_scenario_pairs: 0,
      });
      const archetype = archetypes.get(key);
      archetype.state_scenarios += 1;
      if (!rows.length) archetype.scenarios_without_eligible_dogs += 1;
      if (!suitable.length) archetype.scenarios_without_suitable_matches += 1;
      if (!strong.length) archetype.scenarios_without_strong_matches += 1;
      if (stateRow.public_dogs > 0) {
        archetype.state_scenarios_with_inventory += 1;
        if (!rows.length) archetype.covered_scenarios_without_eligible_dogs += 1;
        if (!suitable.length) archetype.covered_scenarios_without_suitable_matches += 1;
        if (!strong.length) archetype.covered_scenarios_without_strong_matches += 1;
      }
      archetype.strong_match_pairs += strong.length;
      archetype.eligible_dog_scenario_pairs += rows.length;
    }
    const archetype = archetypes.get(profile.archetype);
    archetype.profile_variants += 1;
  }
  return [...archetypes.values()].map((row) => ({
    ...row,
    no_strong_match_pct_in_covered_states: pct(row.covered_scenarios_without_strong_matches, row.state_scenarios_with_inventory),
    no_suitable_match_pct_in_covered_states: pct(row.covered_scenarios_without_suitable_matches, row.state_scenarios_with_inventory),
  })).sort((a, b) => b.no_strong_match_pct_in_covered_states - a.no_strong_match_pct_in_covered_states || a.adopter_scenario.localeCompare(b.adopter_scenario));
}

function summarizeMatchConfidence(dogs, profiles) {
  const output = {
    scenario_count: profiles.length,
    evaluated_dog_scenario_pairs: 0,
    raw_compatibility_observations: 0,
    raw_compatibility_ge_90: 0,
    raw_compatibility_ge_90_below_60_evidence: 0,
    raw_compatibility_ge_90_below_80_evidence: 0,
    limited_information_labels: 0,
    production_tier_counts: {},
    raw_compatibility_score_distribution: { below_50: 0, from_50_to_69: 0, from_70_to_89: 0, from_90_to_100: 0 },
    displayed_score_distribution: { below_50: 0, from_50_to_69: 0, from_70_to_89: 0, from_90_to_100: 0 },
    evidence_coverage_distribution: { below_60: 0, from_60_to_79: 0, from_80_to_100: 0, missing: 0 },
    evidence_observations: { structured_confirmed: 0, biography_explicit: 0, ai_estimated: 0, mixed: 0, unknown: 0 },
    displayed_score_ge_90: 0,
  };
  const dimensionEvidence = {};

  for (const profile of profiles) {
    const ranked = computeRankedMatches(dogs, profile.answers);
    for (const row of ranked) {
      const breakdown = row.breakdown || {};
      output.evaluated_dog_scenario_pairs += 1;
      if (breakdown.limitedInformation === true) output.limited_information_labels += 1;
      const tier = breakdown.tierLabel || "Unknown";
      output.production_tier_counts[tier] = (output.production_tier_counts[tier] || 0) + 1;
      if (Number(row.scorePct) >= 90) output.displayed_score_ge_90 += 1;
      const bandScore = (score, distribution) => {
        if (!Number.isFinite(score)) return;
        if (score < 50) distribution.below_50 += 1;
        else if (score < 70) distribution.from_50_to_69 += 1;
        else if (score < 90) distribution.from_70_to_89 += 1;
        else distribution.from_90_to_100 += 1;
      };
      bandScore(Number(row.scorePct), output.displayed_score_distribution);

      const rawPct = Number(breakdown.rawCompatibilityPct);
      const evidencePct = Number(breakdown.evidenceCoveragePct);
      if (Number.isFinite(evidencePct)) {
        if (evidencePct < LIMITED_INFORMATION_COVERAGE_PCT) output.evidence_coverage_distribution.below_60 += 1;
        else if (evidencePct < LOW_EVIDENCE_COVERAGE_PCT) output.evidence_coverage_distribution.from_60_to_79 += 1;
        else output.evidence_coverage_distribution.from_80_to_100 += 1;
      } else {
        output.evidence_coverage_distribution.missing += 1;
      }
      if (Number.isFinite(rawPct)) {
        output.raw_compatibility_observations += 1;
        bandScore(rawPct, output.raw_compatibility_score_distribution);
        const highEvidence = classifyHighCompatibilityEvidence(rawPct, evidencePct);
        if (highEvidence.high_raw_compatibility) {
          output.raw_compatibility_ge_90 += 1;
          if (highEvidence.below_limited_information_threshold) output.raw_compatibility_ge_90_below_60_evidence += 1;
          if (highEvidence.below_80_evidence_coverage) output.raw_compatibility_ge_90_below_80_evidence += 1;
        }
      }

      for (const questionId of breakdown.activePreferenceIds || []) {
        const contribution = breakdown.contributions?.find((item) => item.questionId === questionId);
        const evidenceClass = classifyEvidenceSource(contribution?.source);
        output.evidence_observations[evidenceClass] += 1;
        const bucket = dimensionEvidence[questionId] || (dimensionEvidence[questionId] = {
          structured_confirmed: 0, biography_explicit: 0, ai_estimated: 0, mixed: 0, unknown: 0, observations: 0,
        });
        bucket.observations += 1;
        bucket[evidenceClass] += 1;
      }
    }
  }
  output.high_score_low_evidence_proportions = {
    below_60_pct: pct(output.raw_compatibility_ge_90_below_60_evidence, output.raw_compatibility_ge_90),
    below_80_pct: pct(output.raw_compatibility_ge_90_below_80_evidence, output.raw_compatibility_ge_90),
    threshold_60_is_existing_limited_information_boundary: true,
  };
  output.evidence_by_dimension = dimensionEvidence;
  return output;
}

export function buildNationwideCoverageReport({
  candidateRows,
  publicDogs,
  referenceTimestamp,
  queryRows = candidateRows?.length,
  evidenceQuality = {},
  inventoryDiversity = {},
  enrichmentEligibility = {},
  revisions = getCoverageReportRevisions(),
  profiles = buildRealisticMatchProfiles(),
} = {}) {
  if (!Array.isArray(candidateRows) || !Array.isArray(publicDogs)) throw new TypeError("Complete candidate and public dog arrays are required.");
  if (!Number.isFinite(Date.parse(referenceTimestamp))) throw new TypeError("A valid fixed reference timestamp is required.");
  if (publicDogs.length > queryRows) throw new TypeError("Public dog count exceeds candidate query count.");

  const ref = Date.parse(referenceTimestamp);
  const geography = summarizeGeography(publicDogs, candidateRows, US_STATE_CODES, ref);
  const archetypes = enrichStateScenarios(geography, publicDogs, profiles);
  const matchConfidence = summarizeMatchConfidence(publicDogs, profiles);
  const publicStateRows = geography.states.filter((row) => row.public_dogs > 0);
  const sourceStats = summarizeSources(candidateRows, publicDogs, ref);
  const candidateFreshness = summarizeCandidateCheckFreshness(candidateRows, ref);
  const completedAi = publicDogs.filter((dog) => Boolean(dog.ai_enriched_at)).length;
  const backlogByReason = {};
  for (const dog of publicDogs) {
    const reason = enrichmentEligibility[String(dog.id)] || null;
    if (reason) backlogByReason[reason] = (backlogByReason[reason] || 0) + 1;
  }
  const unscored = getUnscoredQuestions();

  return {
    ...revisions,
    verification: {
      status: "verified",
      candidate_query_rows: queryRows,
      public_dog_rows: publicDogs.length,
      excluded_candidate_rows: queryRows - publicDogs.length,
      reference_timestamp: referenceTimestamp,
      fixed_reference_time_ms: ref,
    },
    nationwide_coverage: {
      state_count: US_STATE_CODES.length,
      states_with_public_inventory: publicStateRows.length,
      states_with_zero_public_inventory: geography.states.filter((row) => row.public_dogs === 0).length,
      zero_inventory_states: geography.states.filter((row) => row.public_dogs === 0).map((row) => row.state),
      public_dogs: publicDogs.length,
      geographic_inventory_concentration: publicStateRows.slice().sort((a, b) => b.public_dogs - a.public_dogs).slice(0, 10),
      state_inventory: geography.states,
      placement_city_unknown_dogs: geography.states.reduce((sum, row) => sum + row.unknown_placement_city_dogs, 0),
      placement_city_unknown_pct: pct(geography.states.reduce((sum, row) => sum + row.unknown_placement_city_dogs, 0), publicDogs.length),
      shelter_directory_records: geography.shelter_directory_records,
      shelter_directory_locations: geography.shelter_directory_locations,
      geography_note: geography.note,
    },
    sources: sourceStats,
    listing_freshness: {
      checked_within_24h: publicDogs.filter((dog) => Number.isFinite(Date.parse(dog.last_checked_at)) && ref - Date.parse(dog.last_checked_at) <= 24 * 60 * 60 * 1000).length,
      checked_24_to_72h: publicDogs.filter((dog) => {
        const checked = Date.parse(dog.last_checked_at);
        const age = ref - checked;
        return Number.isFinite(checked) && age > 24 * 60 * 60 * 1000 && age <= 72 * 60 * 60 * 1000;
      }).length,
      checked_over_72h: publicDogs.filter((dog) => Number.isFinite(Date.parse(dog.last_checked_at)) && ref - Date.parse(dog.last_checked_at) > 72 * 60 * 60 * 1000).length,
      missing_or_invalid_check_time: publicDogs.filter((dog) => !Number.isFinite(Date.parse(dog.last_checked_at))).length,
      existing_publication_max_age_hours: 72,
    },
    candidate_check_freshness: candidateFreshness,
    enrichment: {
      completed: completedAi,
      completed_pct: pct(completedAi, publicDogs.length),
      eligible_backlog: Object.values(backlogByReason).reduce((sum, count) => sum + count, 0),
      backlog_by_reason: backlogByReason,
      no_ai_processing_performed: true,
    },
    matching_evidence: {
      by_question_probe: evidenceQuality,
      by_realistic_profile_observation: matchConfidence.evidence_by_dimension,
      inventory_attributes: inventoryDiversity,
      alone_time: evidenceQuality.alone_time || matchConfidence.evidence_by_dimension.alone_time || null,
      estimated_evidence_is_not_confirmed: true,
    },
    realistic_matching: {
      profile_set_version: revisions.profile_set_version,
      profiles: profiles.length,
      state_scenarios: profiles.length * US_STATE_CODES.length,
      state_scenarios_without_eligible_dogs: geography.states.reduce((sum, row) => sum + row.scenarios_without_eligible_dogs, 0),
      state_scenarios_without_suitable_matches: geography.states.reduce((sum, row) => sum + row.scenarios_without_suitable_matches, 0),
      state_scenarios_without_strong_matches: geography.states.reduce((sum, row) => sum + row.scenarios_without_strong_matches, 0),
      underserved_adopter_scenarios: archetypes.slice(0, 8),
      state_scenario_results: geography.states,
      suitable_tiers: ["Good potential fit", "Strong potential fit"],
      strong_tier: "Strong potential fit",
      geographic_behavior: "The current product ranks across the public inventory and applies an optional exact placement_state filter. City and travel-radius answers do not constrain matching.",
    },
    match_confidence: matchConfidence,
    unscored_questions: unscored,
    comparison: { status: "unavailable", reason: "No previous report has been provided." },
  };
}

export function buildUnverifiedCoverageReport({ reason, referenceTimestamp = new Date().toISOString(), revisions = getCoverageReportRevisions() } = {}) {
  return {
    ...revisions,
    verification: {
      status: "unverified",
      reason: String(reason || "Inventory access or validation failed.").slice(0, 180),
      reference_timestamp: referenceTimestamp,
    },
    comparison: { status: "unavailable", reason: "Current inventory is unverified." },
  };
}

export function compareCoverageReports(current, previous) {
  if (!previous) return { status: "unavailable", reason: "No previous report was available." };
  if (!isValidAggregateCoverageReport(previous)) return { status: "unavailable", reason: "Previous report failed aggregate artifact validation." };
  if (!isValidAggregateCoverageReport(current)) return { status: "unavailable", reason: "Current report failed aggregate validation." };
  const keys = ["report_version", "matcher_revision", "profile_set_version", "report_definition_revision"];
  const changed = keys.filter((key) => current[key] !== previous[key]);
  if (changed.length) return { status: "unavailable", reason: `Report definitions differ: ${changed.join(", ")}.` };
  if (!Number.isFinite(Date.parse(previous.verification?.reference_timestamp)) ||
      Date.parse(previous.verification.reference_timestamp) >= Date.parse(current.verification.reference_timestamp)) {
    return { status: "unavailable", reason: "Previous report timestamp is missing or not earlier than the current report." };
  }

  const currentCoverage = current.nationwide_coverage;
  const previousCoverage = previous.nationwide_coverage;
  const currentStates = new Map(currentCoverage.state_inventory.map((row) => [row.state, row]));
  const previousStates = new Map(previousCoverage.state_inventory.map((row) => [row.state, row]));
  const stateChanges = [...currentStates.keys()].map((state) => {
    const now = currentStates.get(state);
    const before = previousStates.get(state);
    const dogDelta = now.public_dogs - (before?.public_dogs || 0);
    const strongDelta = now.strong_dog_scenario_pairs - (before?.strong_dog_scenario_pairs || 0);
    return { state, public_dog_delta: dogDelta, strong_dog_scenario_pair_delta: strongDelta };
  });
  const improvements = [];
  const regressions = [];
  const publicDogDelta = currentCoverage.public_dogs - previousCoverage.public_dogs;
  const stateDelta = currentCoverage.states_with_public_inventory - previousCoverage.states_with_public_inventory;
  const noEligibleDelta = current.realistic_matching.state_scenarios_without_eligible_dogs - previous.realistic_matching.state_scenarios_without_eligible_dogs;
  const noSuitableDelta = current.realistic_matching.state_scenarios_without_suitable_matches - previous.realistic_matching.state_scenarios_without_suitable_matches;
  const strongDelta = (current.match_confidence.production_tier_counts["Strong potential fit"] || 0) - (previous.match_confidence.production_tier_counts["Strong potential fit"] || 0);
  const backlogDelta = current.enrichment.eligible_backlog - previous.enrichment.eligible_backlog;
  const highLowEvidenceDelta = current.match_confidence.raw_compatibility_ge_90_below_80_evidence - previous.match_confidence.raw_compatibility_ge_90_below_80_evidence;
  const staleCandidateDelta = (current.candidate_check_freshness?.stale_rescuegroups_candidate_rows || 0) -
    (previous.candidate_check_freshness?.stale_rescuegroups_candidate_rows || 0);
  const previousLowEvidencePct = Number(previous.match_confidence.high_score_low_evidence_proportions?.below_80_pct || 0);
  const currentLowEvidencePct = Number(current.match_confidence.high_score_low_evidence_proportions?.below_80_pct || 0);
  const evidencePctDelta = currentLowEvidencePct - previousLowEvidencePct;
  const stateLosses = stateChanges.filter((row) => {
    const before = previousStates.get(row.state);
    const now = currentStates.get(row.state);
    return before?.public_dogs > 0 && now?.public_dogs === 0;
  });
  const noSuitableThreshold = Math.max(
    ALERT_THRESHOLDS.minimum_scenario_regression,
    Math.ceil(previous.realistic_matching.state_scenarios_without_suitable_matches * ALERT_THRESHOLDS.scenario_regression_pct / 100)
  );
  const backlogGrowthThreshold = Math.max(
    ALERT_THRESHOLDS.enrichment_backlog_growth_dogs,
    Math.ceil(previous.enrichment.eligible_backlog * ALERT_THRESHOLDS.enrichment_backlog_growth_pct / 100)
  );
  const alerts = [];
  for (const row of stateLosses) alerts.push({ severity: "action", code: "state_inventory_lost", message: `${row.state} public inventory fell to zero.` });
  if (staleCandidateDelta > 0) {
    alerts.push({ severity: "action", code: "stale_candidate_inventory", message: `${staleCandidateDelta} additional RescueGroups candidate rows have source checks older than 72 hours; the existing publication guard excludes stale rows from public results.` });
  }
  if (noSuitableDelta >= noSuitableThreshold) {
    alerts.push({ severity: "action", code: "scenario_coverage_regression", message: `No-suitable-match scenarios increased by ${noSuitableDelta}, meeting the ${noSuitableThreshold}-scenario regression threshold.` });
  }
  if (current.match_confidence.raw_compatibility_ge_90 >= ALERT_THRESHOLDS.meaningful_high_score_sample &&
      evidencePctDelta >= ALERT_THRESHOLDS.evidence_regression_percentage_points) {
    alerts.push({ severity: "action", code: "high_score_evidence_regression", message: `The share of raw-90+ results below 80% evidence coverage rose ${evidencePctDelta.toFixed(2)} percentage points.` });
  }
  if (backlogDelta >= backlogGrowthThreshold) {
    alerts.push({ severity: "action", code: "enrichment_backlog_growth", message: `Enrichment eligibility backlog grew by ${backlogDelta} dogs, meeting the ${backlogGrowthThreshold}-dog growth threshold.` });
  }
  const sourceDelta = (current.sources?.public_source_count ?? 0) - (previous.sources?.public_source_count ?? 0);
  if (sourceDelta < 0) {
    alerts.push({ severity: "action", code: "public_source_count_drop", message: `${Math.abs(sourceDelta)} fewer sources are linked to public listings.` });
  }
  const add = (condition, list, label) => { if (condition) list.push(label); };
  add(stateDelta > 0, improvements, `${stateDelta} more states with public inventory`);
  add(publicDogDelta > 0, improvements, `${publicDogDelta} more public dogs`);
  add(noEligibleDelta < 0, improvements, `${Math.abs(noEligibleDelta)} fewer no-eligible scenarios`);
  add(noSuitableDelta < 0, improvements, `${Math.abs(noSuitableDelta)} fewer no-suitable-match scenarios`);
  add(strongDelta > 0, improvements, `${strongDelta} more Strong-tier profile/dog results`);
  add(backlogDelta < 0, improvements, `${Math.abs(backlogDelta)} fewer enrichment-eligible dogs`);
  add(highLowEvidenceDelta < 0, improvements, `${Math.abs(highLowEvidenceDelta)} fewer raw-90+ results below 80% evidence coverage`);
  add(staleCandidateDelta < 0, improvements, `${Math.abs(staleCandidateDelta)} fewer stale RescueGroups candidate records`);
  add(stateDelta < 0, regressions, `${Math.abs(stateDelta)} fewer states with public inventory`);
  add(publicDogDelta < 0, regressions, `${Math.abs(publicDogDelta)} fewer public dogs`);
  add(noEligibleDelta > 0, regressions, `${noEligibleDelta} more no-eligible scenarios`);
  add(noSuitableDelta > 0, regressions, `${noSuitableDelta} more no-suitable-match scenarios`);
  add(strongDelta < 0, regressions, `${Math.abs(strongDelta)} fewer Strong-tier profile/dog results`);
  add(backlogDelta > 0, regressions, `${backlogDelta} more enrichment-eligible dogs`);
  add(highLowEvidenceDelta > 0, regressions, `${highLowEvidenceDelta} more raw-90+ results below 80% evidence coverage`);
  add(staleCandidateDelta > 0, regressions, `${staleCandidateDelta} more stale RescueGroups candidate records`);
  return {
    status: "comparable",
    previous_reference_timestamp: previous.verification.reference_timestamp,
    improvements,
    regressions,
    unchanged: improvements.length === 0 && regressions.length === 0,
    deltas: {
      public_dogs: publicDogDelta,
      states_with_inventory: stateDelta,
      scenarios_without_eligible_dogs: noEligibleDelta,
      scenarios_without_suitable_matches: noSuitableDelta,
      strong_tier_profile_dog_results: strongDelta,
      enrichment_eligible: backlogDelta,
      public_source_count: sourceDelta,
      raw_90_plus_below_80_evidence: highLowEvidenceDelta,
      stale_rescuegroups_candidate_rows: staleCandidateDelta,
      high_score_below_80_evidence_percentage_points: Number(evidencePctDelta.toFixed(2)),
    },
    alerts,
    state_changes: stateChanges.filter((row) => row.public_dog_delta || row.strong_dog_scenario_pair_delta),
  };
}

export function renderFounderSummary(report) {
  if (report.verification?.status !== "verified") {
    return [
      "# Nationwide matching coverage",
      "",
      `**Status: Unverified.** ${report.verification?.reason || "Inventory could not be verified."}`,
      "",
      "Coverage values are unavailable and must not be interpreted as zero.",
    ].join("\n");
  }
  const coverage = report.nationwide_coverage;
  const comparison = report.comparison;
  const stateRows = coverage.state_inventory;
  const underserved = report.realistic_matching.underserved_adopter_scenarios.slice(0, 5);
  const gaps = stateRows.filter((row) => row.public_dogs > 0)
    .sort((a, b) => b.scenarios_without_strong_matches - a.scenarios_without_strong_matches || a.public_dogs - b.public_dogs)
    .slice(0, 5);
  const evidence = report.matching_evidence.alone_time;
  const aloneMissing = evidence?.unknown?.dogs ?? report.match_confidence.evidence_by_dimension.alone_time?.missing ?? null;
  const lines = [
    "# Nationwide matching coverage",
    "",
    `**Status: Verified.** Reference time: ${report.verification.reference_timestamp}. Report v${report.report_version}; matcher ${report.matcher_revision.slice(0, 12)}; profile set ${report.profile_set_version.slice(0, 12)}.`,
    "",
    "## Nationwide coverage",
    "",
    `${coverage.public_dogs.toLocaleString()} public dogs across ${coverage.states_with_public_inventory}/50 states; ${coverage.states_with_zero_public_inventory} states have no public inventory. ${report.sources.public_source_count} source records are linked to public listings. ${coverage.placement_city_unknown_pct}% of dog placement cities are missing.`,
    "",
    `Listing checks: ${report.listing_freshness.checked_within_24h.toLocaleString()} within 24h, ${report.listing_freshness.checked_24_to_72h.toLocaleString()} between 24–72h, ${report.listing_freshness.checked_over_72h.toLocaleString()} over 72h. Enrichment backlog: ${report.enrichment.eligible_backlog.toLocaleString()} eligible dogs; no AI processing was performed.`,
    "",
    "## Changes since the previous comparable report",
    "",
    comparison.status === "comparable"
      ? comparison.unchanged
        ? `No measured changes since ${comparison.previous_reference_timestamp}.`
        : [
          ...(comparison.improvements.length ? [`Improvements: ${comparison.improvements.join("; ")}.`] : []),
          ...(comparison.regressions.length ? [`Regressions: ${comparison.regressions.join("; ")}.`] : []),
        ].join(" ")
      : `Comparison unavailable: ${comparison.reason}`,
    ...(comparison.status === "comparable"
      ? ["", "## Actionable alerts", "", ...(comparison.alerts?.length ? comparison.alerts.map((alert) => `- ${alert.severity}: ${alert.message}`) : ["No configured alert thresholds were crossed."])]
      : []),
    "",
    "## Most underserved adopter scenarios",
    "",
    ...underserved.map((row) => `- ${row.adopter_scenario}: ${row.covered_scenarios_without_strong_matches}/${row.state_scenarios_with_inventory} scenarios in states with inventory had no Strong-tier match; ${row.covered_scenarios_without_eligible_dogs} had no eligible dogs there.`),
    "",
    "## Geographic inventory gaps",
    "",
    `Zero inventory: ${coverage.zero_inventory_states.join(", ") || "none"}. Thin current states: ${gaps.map((row) => `${row.state} (${row.public_dogs} dogs, ${row.active_sources} sources)`).join(", ") || "none"}.`,
    "",
    "## Evidence quality",
    "",
    `Production tiers: ${report.match_confidence.production_tier_counts["Strong potential fit"] || 0} Strong, ${report.match_confidence.production_tier_counts["Good potential fit"] || 0} Good, ${report.match_confidence.limited_information_labels} Limited information. Raw compatibility bands (<50 / 50–69 / 70–89 / 90+): ${Object.values(report.match_confidence.raw_compatibility_score_distribution).map((count) => count.toLocaleString()).join(" / ")}. Evidence coverage bands (<60 / 60–79 / 80+ / missing): ${Object.values(report.match_confidence.evidence_coverage_distribution).map((count) => count.toLocaleString()).join(" / ")}.`,
    "",
    `${report.match_confidence.raw_compatibility_ge_90.toLocaleString()} realistic profile/dog results had raw compatibility at least 90. ${report.match_confidence.raw_compatibility_ge_90_below_60_evidence.toLocaleString()} (${report.match_confidence.high_score_low_evidence_proportions.below_60_pct}%) were below the existing 60% limited-information boundary; ${report.match_confidence.raw_compatibility_ge_90_below_80_evidence.toLocaleString()} (${report.match_confidence.high_score_low_evidence_proportions.below_80_pct}%) were below 80% evidence coverage. Alone-time unknown evidence: ${aloneMissing ?? "unavailable"}. Structured-confirmed, explicit biography, AI-estimated, mixed, and unknown evidence are reported separately.`,
    "",
    `Unscored quiz questions: ${report.unscored_questions.map((question) => question.id).join(", ")}.`,
    "",
    "## Recommended next actions",
    "",
    "1. Recruit or validate public source coverage in zero-inventory states; review disabled source records without automatically activating them.",
    "2. Prioritize reliable shelter-confirmed potty, child/cat, alone-time, and placement-city evidence.",
    "3. Treat city/radius preferences as informational until product matching supports verified distance; current location filtering is by state only.",
  ];
  return lines.join("\n");
}

export function isAggregateOnlyReport(report) {
  const forbiddenKeys = new Set(["dog_id", "dog_name", "source_url", "adoption_url", "description", "bio", "raw_inventory", "candidate_rows"]);
  const visit = (value) => {
    if (Array.isArray(value)) return value.every(visit);
    if (!value || typeof value !== "object") return true;
    return Object.entries(value).every(([key, child]) => !forbiddenKeys.has(key) && visit(child));
  };
  return visit(report);
}

export function isValidAggregateCoverageReport(report) {
  if (!report || !isAggregateOnlyReport(report)) return false;
  if (report.verification?.status !== "verified") return false;
  if (!Number.isInteger(report.report_version) || !report.matcher_revision || !report.profile_set_version || !report.report_definition_revision) return false;
  if (!Number.isFinite(Date.parse(report.verification.reference_timestamp))) return false;
  if (!Number.isInteger(report.nationwide_coverage?.public_dogs) || report.nationwide_coverage.public_dogs < 0) return false;
  if (!Array.isArray(report.nationwide_coverage?.state_inventory) || report.nationwide_coverage.state_inventory.length !== 50) return false;
  const states = new Set(report.nationwide_coverage.state_inventory.map((row) => row?.state));
  if (states.size !== 50 || !states.has("MN") || US_STATE_CODES.some((state) => !states.has(state))) return false;
  if (!Number.isFinite(report.enrichment?.eligible_backlog) || report.enrichment.eligible_backlog < 0) return false;
  if (!Number.isFinite(report.realistic_matching?.state_scenarios)) return false;
  if (!Number.isFinite(report.match_confidence?.raw_compatibility_ge_90)) return false;
  return true;
}
