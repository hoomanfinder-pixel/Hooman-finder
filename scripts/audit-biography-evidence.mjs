import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

import {
  BIOGRAPHY_EVIDENCE_POLICY,
  applyBiographyEvidenceForSimulation,
  extractBiographyEvidence,
} from "../src/lib/biographyEvidence.js";
import { filterPublicDogs } from "../src/lib/dogVisibility.js";
import { computeRankedMatches, getConfirmedIncompatibilities } from "../src/lib/matchingLogic.js";
import { buildRealisticMatchProfiles, REALISTIC_PROFILE_COUNT } from "./realistic-match-profiles.mjs";

dotenv.config({ path: ".env.local" });

const DEFAULT_OUTPUT = path.resolve("reports/biography-evidence-audit.json");
const SELECT = "*,shelters(id,name),ingestion_sources(id,source_type,external_org_id,enabled,publication_eligible,last_successful_sync_at)";
const TARGET_FIELDS = Object.keys(BIOGRAPHY_EVIDENCE_POLICY);

function parseArgs() {
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  return { output: outputArg ? path.resolve(outputArg.slice(9)) : DEFAULT_OUTPUT };
}

function parseTraits(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function useful(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && String(value).toLowerCase() !== "unknown";
}

function traitUseful(dog, key) {
  const value = parseTraits(dog?.ai_traits)?.[key]?.value;
  return useful(value);
}

function currentEvidenceKnown(field, dog) {
  if (field === "potty_training") return dog.potty_trained === true || dog.potty_trained === false || useful(dog.bio_potty_trained) || traitUseful(dog, "potty_trained");
  if (field === "training_needs") return useful(dog.obedience_training) || useful(dog.bio_training_needs) || traitUseful(dog, "training_needs");
  if (field === "barking_noise") return useful(dog.barking_level) || useful(dog.bio_barking_level) || traitUseful(dog, "barking_level");
  if (field === "dog_social_style") {
    if ([dog.dog_social_style, dog.social_with_dogs, dog.dog_social_behavior].some(useful) || dog.only_dog === true || dog.only_dog_required === true || traitUseful(dog, "dog_social_style")) return true;
    return /\b(only dog|must be (?:the )?only dog|no other dogs|dog selective|selective with dogs|slow introductions?|proper introductions?|dog meet and greet|loves other dogs|very dog friendly|highly social with dogs|social butterfly|thrives with other dogs|enjoys the company of other dogs)\b/i.test(String(dog.description || ""));
  }
  const config = {
    children: ["good_with_kids", "bio_good_with_kids", "good_with_kids"],
    dogs: ["good_with_dogs", "bio_good_with_dogs", "good_with_dogs"],
    cats: ["good_with_cats", "bio_good_with_cats", "good_with_cats"],
    small_animals: ["good_with_small_animals", null, "good_with_small_animals"],
  }[field];
  if (!config) return false;
  const [structured, bio, trait] = config;
  return dog[structured] === true || dog[structured] === false || (bio ? useful(dog[bio]) : false) || traitUseful(dog, trait);
}

async function fetchPublicDogs(now) {
  const client = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("dogs").select(SELECT)
      .eq("adoptable", true)
      .or("adoption_pending.is.null,adoption_pending.eq.false")
      .in("availability_status", ["available", "active", "unknown"])
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < 1000) break;
  }
  return filterPublicDogs(rows, { now: Date.parse(now) });
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = (sorted.length - 1) / 2;
  return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
}

function pct(count, total) {
  return total ? Number((count / total * 100).toFixed(2)) : 0;
}

function evaluateProfiles(dogs, profiles) {
  let confirmedLeakage = 0;
  let highSparseTop10 = 0;
  const rows = [];
  for (const profile of profiles) {
    const ranked = computeRankedMatches(dogs, profile.answers);
    const rankedIds = new Set(ranked.map((row) => String(row.dog.id)));
    confirmedLeakage += dogs.filter((dog) => getConfirmedIncompatibilities(dog, profile.answers).length > 0 && rankedIds.has(String(dog.id))).length;
    const top = ranked[0];
    highSparseTop10 += ranked.slice(0, 10).filter((row) => row.scorePct >= 85 && row.breakdown.evidenceCoveragePct < 60).length;
    rows.push({
      profileId: profile.id,
      top1: top?.scorePct ?? null,
      top1EvidenceCoverage: top?.breakdown?.evidenceCoveragePct ?? null,
      highSparseTop1: Boolean(top && top.scorePct >= 85 && top.breakdown.evidenceCoveragePct < 60),
    });
  }
  const top1 = rows.map((row) => row.top1).filter(Number.isFinite);
  return {
    profiles: rows.length,
    top1_ge_90: pct(top1.filter((score) => score >= 90).length, rows.length),
    top1_ge_85: pct(top1.filter((score) => score >= 85).length, rows.length),
    top1_ge_80: pct(top1.filter((score) => score >= 80).length, rows.length),
    median_top1: median(top1),
    median_top1_evidence_coverage: median(rows.map((row) => row.top1EvidenceCoverage)),
    high_scoring_sparse_top1_profiles: rows.filter((row) => row.highSparseTop1).length,
    high_scoring_sparse_top10_instances: highSparseTop10,
    confirmed_incompatibility_leakage: confirmedLeakage,
  };
}

function negativeCompatibilityConcern(profile, row, extractionById) {
  if (row.scorePct < 85) return [];
  const extraction = extractionById.get(String(row.dog.id));
  if (!extraction) return [];
  const concerns = [];
  const kidsRequested = (profile.answers.kids_in_home || []).some((value) => value !== "no_children");
  const pets = profile.answers.pets_in_home || [];
  if (kidsRequested && extraction.fields.children.applied && extraction.fields.children.value === "no") concerns.push("children");
  if (pets.includes("dogs") && extraction.fields.dogs.applied && extraction.fields.dogs.value === "no") concerns.push("dogs");
  if (pets.includes("cats") && extraction.fields.cats.applied && extraction.fields.cats.value === "no") concerns.push("cats");
  if (pets.includes("small_pets") && extraction.fields.small_animals.applied && extraction.fields.small_animals.value === "no") concerns.push("small_animals");
  return concerns;
}

async function main() {
  const args = parseArgs();
  const generatedAt = new Date().toISOString();
  const dogs = await fetchPublicDogs(generatedAt);
  const profiles = buildRealisticMatchProfiles();
  if (profiles.length !== REALISTIC_PROFILE_COUNT || profiles.length !== 128) throw new Error(`Expected 128 profiles, found ${profiles.length}.`);

  const extractions = dogs.map((dog) => extractBiographyEvidence(dog));
  const extractionById = new Map(extractions.map((entry) => [String(entry.dogId), entry]));
  const appliedResults = dogs.map((dog, index) => applyBiographyEvidenceForSimulation(dog, extractions[index]));
  const simulatedDogs = appliedResults.map((entry) => entry.dog);

  const fields = {};
  for (const field of TARGET_FIELDS) {
    const rows = dogs.map((dog, index) => ({ dog, decision: extractions[index].fields[field], result: appliedResults[index] }));
    const reviewRow = ({ dog, decision }) => ({
      dog_id: dog.id,
      dog_name: dog.name,
      organization: dog.shelters?.name || dog.shelter_name || dog.rescuegroups_org_id || null,
      state: dog.placement_state || null,
      status: decision.status,
      value: decision.value,
      confidence: decision.confidence,
      pattern_id: decision.patternId,
      evidence: decision.evidence,
      snippet: decision.snippet,
      reason: decision.reason,
      structured_present: decision.structuredPresent,
      structured_conflict: decision.structuredConflict,
      applied: decision.applied,
      blocked_reason: decision.blockedReason,
    });
    const beforeKnown = rows.filter(({ dog }) => currentEvidenceKnown(field, dog)).length;
    const afterKnown = rows.filter(({ dog, decision }) => currentEvidenceKnown(field, dog) || decision.applied).length;
    fields[field] = {
      biography_candidates: rows.filter(({ decision }) => decision.status !== "none").length,
      accepted: rows.filter(({ decision }) => decision.status === "accepted").length,
      ambiguous_or_rejected: rows.filter(({ decision }) => decision.status === "ambiguous").length,
      structured_conflicts: rows.filter(({ decision }) => decision.structuredConflict).length,
      applied_in_simulation: rows.filter(({ decision }) => decision.applied).length,
      coverage_before: { dogs: beforeKnown, pct: pct(beforeKnown, dogs.length) },
      coverage_after: { dogs: afterKnown, pct: pct(afterKnown, dogs.length) },
      accepted_dogs: rows.filter(({ decision }) => decision.status === "accepted").map(reviewRow),
      ambiguous_or_rejected_dogs: rows.filter(({ decision }) => decision.status === "ambiguous").map(reviewRow),
      conflict_dogs: rows.filter(({ decision }) => decision.structuredConflict).map(reviewRow),
    };
  }

  const baseline = evaluateProfiles(dogs, profiles);
  const after = evaluateProfiles(simulatedDogs, profiles);
  const byField = {};
  for (const field of TARGET_FIELDS) {
    const fieldDogs = dogs.map((dog, index) => applyBiographyEvidenceForSimulation(dog, extractions[index], { fields: [field] }).dog);
    const metrics = evaluateProfiles(fieldDogs, profiles);
    byField[field] = {
      ...metrics,
      delta_top1_ge_90: Number((metrics.top1_ge_90 - baseline.top1_ge_90).toFixed(2)),
      delta_top1_ge_85: Number((metrics.top1_ge_85 - baseline.top1_ge_85).toFixed(2)),
      delta_median_evidence_coverage: Number((metrics.median_top1_evidence_coverage - baseline.median_top1_evidence_coverage).toFixed(2)),
    };
  }

  let biographyNegativeHighScores = 0;
  const biographyNegativeExamples = [];
  for (const profile of profiles) {
    for (const row of computeRankedMatches(simulatedDogs, profile.answers).slice(0, 10)) {
      const concerns = negativeCompatibilityConcern(profile, row, extractionById);
      if (!concerns.length) continue;
      biographyNegativeHighScores += 1;
      if (biographyNegativeExamples.length < 30) biographyNegativeExamples.push({ profile_id: profile.id, dog_id: row.dog.id, dog_name: row.dog.name, score: row.scorePct, concerns });
    }
  }

  const report = {
    generated_at: generatedAt,
    mode: "read_only_simulation",
    inventory: { public_dogs: dogs.length },
    methodology: {
      profiles: profiles.length,
      evidence_application: "Extracted evidence was applied only to in-memory dog clones. Structured fields were never changed. Biography-derived compatibility remained soft scoring evidence and never entered hard exclusions.",
      sparse_evidence_definition: "A match scoring at least 85 with evidence coverage below 60%.",
    },
    policy: BIOGRAPHY_EVIDENCE_POLICY,
    fields,
    matching_simulation: { before: baseline, after, by_field: byField },
    safety: {
      structured_precedence_skips: appliedResults.reduce((sum, result) => sum + result.skipped.filter((entry) => entry.reason === "structured_source_precedence").length, 0),
      structured_conflicts_applied: extractions.reduce((sum, extraction) => sum + Object.values(extraction.fields).filter((decision) => decision.structuredConflict && decision.applied).length, 0),
      age_restricted_child_evidence_applied: extractions.filter((entry) => entry.fields.children.value === "older_children_only" && entry.fields.children.applied).length,
      confirmed_incompatibility_leakage_after: after.confirmed_incompatibility_leakage,
      high_scoring_results_with_applied_negative_biography_compatibility: biographyNegativeHighScores,
      high_scoring_negative_examples: biographyNegativeExamples,
    },
    guarantees: { production_writes: 0, ai_calls: 0, sync_runs: 0, production_logic_changed: false, deployed: false },
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ output: args.output, inventory: report.inventory, field_summary: Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, { biography_candidates: value.biography_candidates, accepted: value.accepted, ambiguous_or_rejected: value.ambiguous_or_rejected, structured_conflicts: value.structured_conflicts, applied_in_simulation: value.applied_in_simulation, coverage_before: value.coverage_before, coverage_after: value.coverage_after }])), matching_simulation: report.matching_simulation, safety: report.safety }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
