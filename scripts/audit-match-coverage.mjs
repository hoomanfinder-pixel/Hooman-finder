import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

import { filterPublicDogs } from "../src/lib/dogVisibility.js";
import { MATCH_WEIGHTS, computeRankedMatches, getConfirmedIncompatibilities } from "../src/lib/matchingLogic.js";
import { ALL_QUESTIONS, QUESTION_TYPES } from "../src/lib/quizQuestions.js";
import enrichmentModule from "./enrich-dogs-ai.cjs";

const { getEnrichmentEligibilityReason } = enrichmentModule;

dotenv.config({ path: ".env.local" });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_JSON = path.join(ROOT, "reports", "match-coverage-audit.json");
const DEFAULT_MARKDOWN = path.join(ROOT, "reports", "match-coverage-audit.md");
const DEFAULT_PROFILES_CSV = path.join(ROOT, "reports", "match-coverage-profiles.csv");
const DEFAULT_PRIORITY_CSV = path.join(ROOT, "reports", "match-enrichment-priority.csv");

const STATES = ["CA", "FL", "GA", "MI", "MN", "NH", "RI", "SD", "TX"];
const STATE_NAMES = {
  CA: "California", FL: "Florida", GA: "Georgia", MI: "Michigan", MN: "Minnesota",
  NH: "New Hampshire", RI: "Rhode Island", SD: "South Dakota", TX: "Texas",
};

const QUESTION_META = {
  size_preference: { fields: ["size", "bio_size"], role: "strong preference", special: "Listed size is full-strength; bio size is confidence-weighted. A mismatch reduces score but never excludes." },
  age_preference: { fields: ["age_years", "age_text"], role: "strong preference", special: "Age is bucketed as puppy <2, adult 2–6, senior 7+. A mismatch reduces score but never excludes." },
  kids_in_home: { fields: ["good_with_kids", "bio_good_with_kids"], role: "confirmed-authoritative hard exclusion", special: "All child ages are treated identically. Confirmed incompatibility excludes; unknown and AI estimates do not." },
  pets_in_home: { fields: ["good_with_dogs", "good_with_cats", "good_with_small_animals", "bio/AI equivalents"], role: "confirmed-authoritative hard exclusion", special: "Confirmed dog, cat, or small-animal incompatibility excludes for that household pet. Unknown and AI estimates do not." },
  potty_requirement: { fields: ["potty_trained", "bio_potty_trained"], role: "strong preference", special: "Preferred halves distance from neutral; must-be-trained uses the full compatibility value." },
  dog_social_preference: { fields: ["dog_social_style", "only_dog", "description", "ai_traits.dog_social_style"], role: "strong preference", special: "Uses structured style first, then bio-explicit AI or narrow description phrases." },
  first_time_owner: { fields: ["first_time_friendly", "owner_experience", "bio_first_time_friendly"], role: "soft preference", special: "Only Yes is active; No and Not sure are neutral." },
  housing_type: { fields: ["ai_traits.apartment_friendly"], role: "ranking signal", special: "Only apartment/townhouse are active, and only AI trait evidence can score them." },
  landlord_restrictions: { fields: [], role: "not scored", special: "Stored only; weight/breed restrictions do not affect matching." },
  separation_anxiety_willingness: { fields: ["separation_anxiety", "has_separation_anxiety", "description", "ai_traits"], role: "strong preference", special: "Only No is active; structured or bio-explicit separation evidence is used." },
  crate_ok: { fields: [], role: "not scored", special: "Stored only." },
  training_commitment_level: { fields: ["obedience_training", "bio_training_needs", "ai_traits.training_needs"], role: "strong preference", special: "Capacity is compared with normalized training need; estimates are confidence-weighted." },
  reactivity_comfort: { fields: [], role: "not scored", special: "Stored only; explicit reactivity does not affect percentage." },
  behavior_tolerance: { fields: [], role: "not scored", special: "Stored only; selected behavior challenges do not affect percentage." },
  noise_preference: { fields: ["barking_level", "bio_barking_level", "ai_traits.barking_level"], role: "soft preference", special: "Alert okay and some barking okay are identical in scoring." },
  adoption_city: { fields: [], role: "not scored / no geographic constraint", special: "Free text is stored but does not filter or rank inventory." },
  adoption_travel_radius: { fields: [], role: "not scored / no geographic constraint", special: "Stored only; the Michigan-specific option has no geographic effect." },
  daily_walk_minutes: { fields: ["exercise_needs", "activity_level", "energy_level", "bio_exercise_needs"], role: "strong preference", special: "Exercise capacity is compared with need, using structured evidence before estimates." },
  weekend_activity_style: { fields: [], role: "not scored", special: "Stored only." },
  energy_preference: { fields: ["energy_level", "activity_level", "bio_energy_level"], role: "strong preference", special: "Uses distance across low to high energy levels." },
  play_styles: { fields: [], role: "not scored", special: "Stored only even though dogs can have play-style data." },
  yard: { fields: ["fence_needs", "yard_required", "ai_traits.needs_yard"], role: "ranking signal with caution", special: "Yard/fence values affect score and may add a caution, but do not hard-exclude until a verified-requirement classification exists. AI estimates remain confidence-weighted scoring inputs." },
  stairs: { fields: [], role: "not scored", special: "Stored only." },
  alone_time: { fields: ["max_alone_hours", "bio_max_alone_hours"], role: "strong preference", special: "Required hours are compared with confirmed capacity, then confidence-weighted estimate." },
  allergy_sensitivity: { fields: ["hypoallergenic", "shedding_level", "bio_shedding_level"], role: "strong preference", special: "Confirmed hypoallergenic status wins. If shedding preference is active, this dimension is suppressed to avoid double counting." },
  shedding_preference: { fields: ["shedding_level", "bio_shedding_level"], role: "soft preference", special: "Minimal/moderate are active; heavy okay and flexible are neutral." },
  monthly_pet_budget_range: { fields: [], role: "not scored", special: "Stored only." },
  medical_needs_ok: { fields: [], role: "not scored", special: "Stored only; known medical needs do not affect percentage." },
  medication_comfort: { fields: [], role: "not scored", special: "Stored only." },
};

const BASE_ANSWERS = {
  size_preference: ["flexible"], age_preference: ["flexible"], kids_in_home: ["no_children"],
  pets_in_home: ["none"], potty_requirement: "flexible", dog_social_preference: "flexible",
  first_time_owner: "no", housing_type: "house", landlord_restrictions: "none",
  separation_anxiety_willingness: "yes", crate_ok: "yes", training_commitment_level: "not_sure",
  reactivity_comfort: "yes", behavior_tolerance: ["flexible"], noise_preference: "no_preference",
  adoption_city: "Detroit, MI", adoption_travel_radius: "no_preference", daily_walk_minutes: "not_sure",
  weekend_activity_style: "not_sure", energy_preference: "flexible", play_styles: ["no_preference"],
  yard: "not_sure", stairs: "none", alone_time: "not_sure", allergy_sensitivity: "no_allergies",
  shedding_preference: "flexible", monthly_pet_budget_range: "not_sure", medical_needs_ok: "maybe",
  medication_comfort: "maybe",
};

function subsets(values) {
  const output = [];
  for (let mask = 1; mask < 2 ** values.length; mask += 1) {
    output.push(values.filter((_, index) => mask & (1 << index)));
  }
  return output;
}

const PROFILE_LEVELS = {
  size_preference: [...subsets(["small", "medium", "large", "extra_large"]), ["flexible"]],
  age_preference: [...subsets(["puppy", "adult", "senior"]), ["flexible"]],
  kids_in_home: [["no_children"], ["under_3"], ["3_5"], ["6_9"], ["10_12"], ["13_plus"], ["children_visit"]],
  pets_in_home: [...subsets(["dogs", "cats", "small_pets"]), ["none"], ["not_sure"]],
  potty_requirement: ["must_be_trained", "preferred", "flexible"],
  dog_social_preference: ["very_dog_friendly", "selective_ok", "only_dog", "flexible"],
  first_time_owner: ["yes", "no", "not_sure"],
  housing_type: ["apartment", "townhouse", "house", "other"],
  separation_anxiety_willingness: ["yes", "maybe", "no", "not_sure"],
  training_commitment_level: ["low", "medium", "high", "not_sure"],
  noise_preference: ["alert_ok", "some_ok", "prefer_quiet", "need_very_quiet", "no_preference"],
  daily_walk_minutes: ["0_15", "15_30", "30_60", "60_plus", "not_sure"],
  energy_preference: ["low", "moderate", "high", "flexible"],
  yard: ["yes", "no", "not_sure"],
  alone_time: ["lt4", "4_6", "6_8", "8_plus", "not_sure"],
  allergy_sensitivity: ["have_allergies", "mild_allergies", "no_allergies"],
  shedding_preference: ["minimal", "moderate", "heavy_ok", "flexible"],
};

const CORE_LEVELS = {
  size_preference: PROFILE_LEVELS.size_preference,
  age_preference: PROFILE_LEVELS.age_preference,
  // The production scorer collapses every child age/subset to the same has-children boolean.
  kids_in_home: [["no_children"], ["under_3"]],
  pets_in_home: PROFILE_LEVELS.pets_in_home,
  potty_requirement: PROFILE_LEVELS.potty_requirement,
};

const PROBE_ANSWERS = {
  size_preference: ["small"], age_preference: ["adult"], kids_in_home: ["under_3"],
  pets_in_home: ["dogs", "cats", "small_pets"], potty_requirement: "must_be_trained",
  dog_social_preference: "very_dog_friendly", first_time_owner: "yes", housing_type: "apartment",
  separation_anxiety_willingness: "no", training_commitment_level: "low", noise_preference: "need_very_quiet",
  daily_walk_minutes: "0_15", energy_preference: "low", yard: "no", alone_time: "8_plus",
  allergy_sensitivity: "have_allergies", shedding_preference: "minimal",
};

function isScoringRequested(questionId, answer, answers) {
  if (answer === undefined || answer === null || (Array.isArray(answer) && answer.length === 0)) return false;
  const values = (Array.isArray(answer) ? answer : [answer]).map((value) => String(value).toLowerCase());
  if (values.some((value) => ["flexible", "no_preference", "not_sure", "unknown", "doesnt_matter", "does_not_matter", "no_matter", "varies"].includes(value))) return false;
  if (questionId === "kids_in_home") return !values.includes("no_children");
  if (questionId === "pets_in_home") return !values.includes("none");
  if (questionId === "first_time_owner") return values[0] === "yes";
  if (questionId === "housing_type") return ["apartment", "townhouse"].includes(values[0]);
  if (questionId === "separation_anxiety_willingness") return values[0] === "no";
  if (questionId === "allergy_sensitivity") {
    if (values[0] === "no_allergies") return false;
    return !isScoringRequested("shedding_preference", answers.shedding_preference, answers);
  }
  if (questionId === "shedding_preference") return !["heavy_ok", "flexible"].includes(values[0]);
  return true;
}

function parseArgs(argv) {
  const args = { inventory: "production", json: DEFAULT_JSON, markdown: DEFAULT_MARKDOWN, profilesCsv: DEFAULT_PROFILES_CSV, priorityCsv: DEFAULT_PRIORITY_CSV };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--inventory=")) args.inventory = arg.slice(12);
    else if (arg.startsWith("--json=")) args.json = path.resolve(arg.slice(7));
    else if (arg.startsWith("--markdown=")) args.markdown = path.resolve(arg.slice(11));
    else if (arg.startsWith("--profiles-csv=")) args.profilesCsv = path.resolve(arg.slice(15));
    else if (arg.startsWith("--priority-csv=")) args.priorityCsv = path.resolve(arg.slice(15));
    else if (arg === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function cartesian(levelMap) {
  const entries = Object.entries(levelMap);
  const rows = [];
  function visit(index, current) {
    if (index === entries.length) { rows.push(structuredClone(current)); return; }
    const [id, levels] = entries[index];
    for (const value of levels) { current[id] = value; visit(index + 1, current); }
  }
  visit(0, {});
  return rows;
}

function buildProfiles() {
  const bySignature = new Map();
  const isLogicallyValid = (answers) => {
    const pets = Array.isArray(answers.pets_in_home) ? answers.pets_in_home : [answers.pets_in_home];
    if (pets.includes("dogs") && answers.dog_social_preference === "only_dog") return false;
    const activeScored = Object.keys(MATCH_WEIGHTS).filter((id) => isScoringRequested(id, answers[id], answers)).length;
    return activeScored >= 2;
  };
  const add = (answers, strategy) => {
    const complete = { ...BASE_ANSWERS, ...answers };
    if (!isLogicallyValid(complete)) return;
    const signature = stable(complete);
    if (!bySignature.has(signature)) bySignature.set(signature, { answers: complete, strategies: [strategy] });
    else if (!bySignature.get(signature).strategies.includes(strategy)) bySignature.get(signature).strategies.push(strategy);
  };

  for (const answers of cartesian(CORE_LEVELS)) add(answers, "exhaustive_core_dealbreakers");

  const dimensions = Object.keys(PROFILE_LEVELS);
  for (let left = 0; left < dimensions.length; left += 1) {
    for (let right = left + 1; right < dimensions.length; right += 1) {
      const a = dimensions[left];
      const b = dimensions[right];
      for (const av of PROFILE_LEVELS[a]) for (const bv of PROFILE_LEVELS[b]) add({ [a]: av, [b]: bv }, "all_pairs_scored_dimensions");
    }
  }

  // Deterministic Halton coverage supplies realistic full profiles with many
  // active constraints without pretending the billion-scale space is exhaustive.
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59];
  const halton = (index, base) => {
    let fraction = 1;
    let result = 0;
    let current = index;
    while (current > 0) { fraction /= base; result += fraction * (current % base); current = Math.floor(current / base); }
    return result;
  };
  for (let index = 1; index <= 2048; index += 1) {
    const answers = {};
    dimensions.forEach((id, dimensionIndex) => {
      const levels = PROFILE_LEVELS[id];
      answers[id] = levels[Math.min(levels.length - 1, Math.floor(halton(index, primes[dimensionIndex]) * levels.length))];
    });
    add(answers, "deterministic_space_filling_full_profiles");
  }

  return [...bySignature.values()].map((profile, index) => ({ id: `P${String(index + 1).padStart(5, "0")}`, ...profile }));
}

function countCombinationSpace() {
  let raw = 1n;
  let valid = 1n;
  for (const question of ALL_QUESTIONS) {
    if (question.type === QUESTION_TYPES.TEXT) continue;
    if (question.type === QUESTION_TYPES.SINGLE) {
      raw *= BigInt(question.options.length);
      valid *= BigInt(question.options.length);
      continue;
    }
    const optionCount = question.options.length;
    raw *= (1n << BigInt(optionCount)) - 1n;
    const exclusive = new Set(question.exclusiveValues || []);
    const regularCount = question.options.filter((option) => !exclusive.has(option.value)).length;
    valid *= ((1n << BigInt(regularCount)) - 1n) + BigInt(exclusive.size);
  }
  const semanticCounts = [16, 8, 2, 8, 3, 4, 2, 2, 2, 4, 4, 5, 4, 3, 5, 3, 3];
  const meaningful = semanticCounts.reduce((product, count) => product * BigInt(count), 1n);
  const logicallyValid = valid * 8n / 9n;
  const logicallyValidMeaningful = meaningful * 7n / 8n;
  const meaningfulAtLeastTwoActive = meaningful - 62n;
  const logicallyValidAtLeastTwoActive = logicallyValidMeaningful - 62n;
  return {
    free_text_note: "adoption_city is unconstrained text, so the literal full-input space is infinite; finite counts treat it as one answered placeholder",
    theoretical_raw_nonempty_multi: raw.toString(),
    ui_valid_respecting_exclusive_options: valid.toString(),
    logically_valid_after_excluding_other_dog_plus_only_dog: logicallyValid.toString(),
    distinct_matcher_behaviors_after_collapsing_equivalent_answers: meaningful.toString(),
    logically_valid_distinct_matcher_behaviors: logicallyValidMeaningful.toString(),
    meaningful_behaviors_with_at_least_two_active_scored_dimensions: meaningfulAtLeastTwoActive.toString(),
    logically_valid_meaningful_behaviors_with_at_least_two_active_scored_dimensions: logicallyValidAtLeastTwoActive.toString(),
    main_explosion_dimensions: [
      { question_id: "play_styles", valid_configurations: 128, affects_score: false },
      { question_id: "kids_in_home", valid_configurations: 64, matcher_behaviors: 2 },
      { question_id: "behavior_tolerance", valid_configurations: 32, affects_score: false },
      { question_id: "size_preference", valid_configurations: 16, matcher_behaviors: 16 },
      { question_id: "pets_in_home", valid_configurations: 9, matcher_behaviors: 8 },
      { question_id: "age_preference", valid_configurations: 8, matcher_behaviors: 8 },
    ],
  };
}

async function fetchProductionDogs(snapshotTime) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing VITE_SUPABASE_URL or a Supabase read key.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const dogs = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("dogs")
      .select("*,shelters(id,name,website,apply_url,logo_url,city,state),ingestion_sources(id,source_type,external_org_id,enabled,publication_eligible,last_successful_sync_at)")
      .eq("adoptable", true)
      .or("adoption_pending.is.null,adoption_pending.eq.false")
      .in("availability_status", ["available", "active", "unknown"])
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    dogs.push(...(data || []));
    if ((data || []).length < 1000) break;
  }
  return filterPublicDogs(dogs, { now: Date.parse(snapshotTime) });
}

function loadInventory(filename, snapshotTime) {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(filename), "utf8"));
  const dogs = Array.isArray(parsed) ? parsed : parsed.dogs;
  if (!Array.isArray(dogs)) throw new Error("Inventory JSON must be an array or an object with a dogs array.");
  return filterPublicDogs(dogs, { now: Date.parse(snapshotTime) });
}

function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function scoreBand(best, eligible) {
  if (eligible === 0) return "0 eligible dogs";
  if (!Number.isFinite(best) || best < 50) return "best under 50%";
  if (best < 60) return "50–59%";
  if (best < 70) return "60–69%";
  if (best < 80) return "70–79%";
  if (best < 90) return "80–89%";
  if (best < 95) return "90–94%";
  return "95–100%";
}

function summarizeRows(rows, totalCandidates = rows.length) {
  const scored = rows.filter((row) => Number.isFinite(row.scorePct));
  const scores = scored.map((row) => row.scorePct);
  const top = scored[0] || null;
  const atLeast = (threshold) => scored.filter((row) => row.scorePct >= threshold).length;
  return {
    eligible_dogs: rows.length,
    hard_excluded_dogs: Math.max(0, totalCandidates - rows.length),
    dogs_with_confirmed_caution: rows.filter((row) => row.breakdown.compatibilityCautions.length > 0).length,
    scored_dogs: scored.length,
    highest_match_pct: top?.scorePct ?? null,
    second_highest_pct: scored[1]?.scorePct ?? null,
    fifth_highest_pct: scored[4]?.scorePct ?? null,
    tenth_highest_pct: scored[9]?.scorePct ?? null,
    median_returned_pct: round(percentile(scores, 0.5)),
    top_dog_id: top?.dog?.id ?? null,
    top_dog_name: top?.dog?.name ?? null,
    top_dog_state: top?.dog?.placement_state ? String(top.dog.placement_state).toUpperCase() : null,
    top_positive_factors: top?.breakdown?.matchReasons || [],
    top_negative_factors: top?.breakdown?.matchTradeoffs || [],
    top_compatibility_cautions: top?.breakdown?.compatibilityCautions || [],
    top_evidence_presence_pct: top?.breakdown?.evidencePresencePct ?? null,
    top_evidence_quality_pct: top?.breakdown?.evidenceQualityPct ?? null,
    top_evidence_coverage_pct: top?.breakdown?.evidenceCoveragePct ?? null,
    dogs_at_least_50: atLeast(50), dogs_at_least_70: atLeast(70), dogs_at_least_80: atLeast(80), dogs_at_least_90: atLeast(90),
    band: scoreBand(top?.scorePct ?? null, rows.length),
  };
}

function optimisticScore(row) {
  const b = row.breakdown;
  if (!Number.isFinite(b?.evidenceRequestedWeight) || b.evidenceRequestedWeight <= 0) return null;
  const missing = b.evidenceRequestedWeight - b.evidenceCoveredWeight;
  const earned = Number(row.score || 0) + missing;
  const quality = Number(b.qualityWeightedEvidence || 0) + missing;
  const raw = earned / b.evidenceRequestedWeight;
  const qualityAdjusted = quality / b.evidenceRequestedWeight;
  const coverage = 0.5 + 0.5 * qualityAdjusted;
  let score = Math.round(raw * (0.6 + 0.4 * coverage) * 100);
  return score;
}

function aggregateProfileMetrics(summaries) {
  const count = summaries.length;
  const best = summaries.map((row) => row.highest_match_pct).filter(Number.isFinite);
  const bands = Object.fromEntries(["0 eligible dogs", "best under 50%", "50–59%", "60–69%", "70–79%", "80–89%", "90–94%", "95–100%"].map((label) => [label, 0]));
  for (const row of summaries) bands[row.band] += 1;
  const pct = (n) => round(count ? (n / count) * 100 : 0);
  return {
    profiles: count,
    zero_eligible_profiles: summaries.filter((row) => row.eligible_dogs === 0).length,
    zero_eligible_pct: pct(summaries.filter((row) => row.eligible_dogs === 0).length),
    one_eligible_profile_count: summaries.filter((row) => row.eligible_dogs === 1).length,
    one_eligible_profile_pct: pct(summaries.filter((row) => row.eligible_dogs === 1).length),
    no_scored_match_profiles: summaries.filter((row) => !Number.isFinite(row.highest_match_pct)).length,
    best_score_bands: Object.fromEntries(Object.entries(bands).map(([label, n]) => [label, { profiles: n, pct: pct(n) }])),
    best_at_least_70_pct: pct(summaries.filter((row) => row.dogs_at_least_70 > 0).length),
    best_at_least_80_pct: pct(summaries.filter((row) => row.dogs_at_least_80 > 0).length),
    best_at_least_90_pct: pct(summaries.filter((row) => row.dogs_at_least_90 > 0).length),
    at_least_three_80_pct: pct(summaries.filter((row) => row.dogs_at_least_80 >= 3).length),
    at_least_five_70_pct: pct(summaries.filter((row) => row.dogs_at_least_70 >= 5).length),
    average_best_match_pct: round(best.reduce((sum, value) => sum + value, 0) / Math.max(best.length, 1)),
    median_best_match_pct: round(percentile(best, 0.5)),
    p10_best_match_pct: round(percentile(best, 0.1)),
    p90_best_match_pct: round(percentile(best, 0.9)),
    median_eligible_dogs: round(percentile(summaries.map((row) => row.eligible_dogs), 0.5)),
    median_scored_dogs: round(percentile(summaries.map((row) => row.scored_dogs), 0.5)),
    profiles_with_confirmed_exclusions: summaries.filter((row) => row.hard_excluded_dogs > 0).length,
    profiles_with_confirmed_exclusions_pct: pct(summaries.filter((row) => row.hard_excluded_dogs > 0).length),
    average_confirmed_exclusions: round(summaries.reduce((sum, row) => sum + row.hard_excluded_dogs, 0) / Math.max(count, 1)),
    maximum_confirmed_exclusions: Math.max(0, ...summaries.map((row) => row.hard_excluded_dogs)),
  };
}

function constraintGapSummary(profileRows) {
  const weak = profileRows.filter((row) => !Number.isFinite(row.highest_match_pct) || row.highest_match_pct < 70);
  const tokenFor = (questionId, value) => `${questionId}=${answerLabel(questionId, value)}`;
  const overallCounts = new Map();
  const weakCounts = new Map();
  const pairCounts = new Map();
  for (const row of profileRows) {
    const tokens = Object.entries(row.active_answers).map(([id, value]) => tokenFor(id, value)).sort();
    for (const token of tokens) overallCounts.set(token, (overallCounts.get(token) || 0) + 1);
    if (!weak.includes(row)) continue;
    for (const token of tokens) weakCounts.set(token, (weakCounts.get(token) || 0) + 1);
    for (let left = 0; left < tokens.length; left += 1) for (let right = left + 1; right < tokens.length; right += 1) {
      const pair = `${tokens[left]} + ${tokens[right]}`;
      pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
    }
  }
  const factors = [...weakCounts.entries()].map(([answer, count]) => {
    const weakPct = count / Math.max(weak.length, 1) * 100;
    const overallPct = (overallCounts.get(answer) || 0) / profileRows.length * 100;
    return { answer, weak_profiles: count, weak_profile_pct: round(weakPct), all_profile_pct: round(overallPct), representation_lift: round(weakPct / Math.max(overallPct, 0.0001)) };
  }).sort((a, b) => b.representation_lift - a.representation_lift || b.weak_profiles - a.weak_profiles);
  const pairs = [...pairCounts.entries()].map(([answers, count]) => ({ answers, weak_profiles: count, weak_profile_pct: round(count / Math.max(weak.length, 1) * 100) })).sort((a, b) => b.weak_profiles - a.weak_profiles || a.answers.localeCompare(b.answers));
  return { weak_profile_count: weak.length, weak_profile_pct: round(weak.length / profileRows.length * 100), top_overrepresented_answers: factors.slice(0, 30), top_answer_pairs: pairs.slice(0, 30) };
}

function answerLabel(questionId, value) {
  const question = ALL_QUESTIONS.find((entry) => entry.id === questionId);
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => question?.options?.find((option) => option.value === item)?.label || item).join(" + ");
}

function csvCell(value) {
  const text = Array.isArray(value) || (value && typeof value === "object") ? JSON.stringify(value) : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function writeCsv(filename, headers, rows) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n") + "\n");
}

function questionAudit(evidence, impacts) {
  return ALL_QUESTIONS.map((question) => {
    const meta = QUESTION_META[question.id] || { fields: [], role: "unknown", special: "" };
    const scored = Object.hasOwn(MATCH_WEIGHTS, question.id);
    return {
      id: question.id,
      user_facing_question: question.title,
      answers: question.options?.map((option) => ({ value: option.value, label: option.label })) || [{ value: "free_text", label: question.placeholder || "Free text" }],
      selection: question.type,
      functionally_optional: true,
      mode: question.mode,
      affects_match_percentage: scored,
      weight: MATCH_WEIGHTS[question.id] ?? 0,
      affected_fields: meta.fields,
      matching_role: meta.role,
      unknown_handling: scored ? "No contribution; missing evidence reduces evidence coverage but is not treated as incompatibility." : "Not read by the matcher.",
      confirmed_handling: scored ? "Structured source data receives full evidence strength and overrides estimates." : "Not read by the matcher.",
      estimated_handling: scored ? "Bio-explicit evidence strength is 0.65×confidence, breed/coat inference 0.50×confidence, profile inference 0.25×confidence; estimates are pulled toward neutral 50%." : "Not read by the matcher.",
      special_cases: meta.special,
      evidence: evidence?.[question.id] || null,
      answer_impact: impacts?.filter((entry) => entry.question_id === question.id) || [],
    };
  });
}

function evidenceAudit(dogs) {
  const output = {};
  for (const questionId of Object.keys(MATCH_WEIGHTS)) {
    const answers = { ...BASE_ANSWERS, [questionId]: PROBE_ANSWERS[questionId] };
    const rows = computeRankedMatches(dogs, answers);
    const counts = { structured: 0, bio_explicit: 0, breed_coat_inference: 0, profile_inference: 0, mixed: 0, unknown: 0 };
    for (const row of rows) {
      const contribution = row.breakdown.contributions.find((item) => item.questionId === questionId);
      const source = contribution?.source;
      if (!source) counts.unknown += 1;
      else if (Object.hasOwn(counts, source)) counts[source] += 1;
      else counts.mixed += 1;
    }
    output[questionId] = Object.fromEntries(Object.entries(counts).map(([source, count]) => [source, { dogs: count, pct: round((count / dogs.length) * 100) }]));
  }
  return output;
}

function controlledQuestionImpacts(dogs, profiles) {
  const contextCount = 12;
  const contexts = Array.from({ length: contextCount }, (_, index) => profiles[Math.floor(index * (profiles.length - 1) / Math.max(contextCount - 1, 1))].answers);
  const results = [];
  for (const [questionId, levels] of Object.entries(PROFILE_LEVELS)) {
    for (const value of levels) {
      const deltas = [];
      for (const context of contexts) {
        const without = { ...context };
        delete without[questionId];
        const withAnswer = { ...without, [questionId]: value };
        const base = summarizeRows(computeRankedMatches(dogs, without));
        const changed = summarizeRows(computeRankedMatches(dogs, withAnswer));
        deltas.push({
          top: (changed.highest_match_pct ?? 0) - (base.highest_match_pct ?? 0),
          seventy: changed.dogs_at_least_70 - base.dogs_at_least_70,
          eighty: changed.dogs_at_least_80 - base.dogs_at_least_80,
          cautions: changed.dogs_with_confirmed_caution - base.dogs_with_confirmed_caution,
        });
      }
      const average = (key) => round(deltas.reduce((sum, row) => sum + row[key], 0) / deltas.length);
      results.push({ question_id: questionId, answer: value, answer_label: answerLabel(questionId, value), contexts: deltas.length, average_top_score_delta: average("top"), average_70_dog_delta: average("seventy"), average_80_dog_delta: average("eighty"), average_confirmed_caution_delta: average("cautions") });
    }
  }
  return results.sort((a, b) => a.average_80_dog_delta - b.average_80_dog_delta || a.average_top_score_delta - b.average_top_score_delta);
}

function inventoryDiversity(dogs, evidence) {
  const categorical = (field, normalize = (value) => String(value ?? "unknown").trim().toLowerCase() || "unknown") => {
    const counts = {};
    for (const dog of dogs) { const value = normalize(dog[field]); counts[value] = (counts[value] || 0) + 1; }
    return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([value, count]) => [value, { dogs: count, pct: round(count / dogs.length * 100) }]));
  };
  const boolean = (field) => categorical(field, (value) => value === true ? "yes" : value === false ? "no" : "unknown");
  const ageBucket = (dog) => {
    const text = String(dog.age_text || "").toLowerCase();
    const raw = Number(dog.age_years);
    const year = text.match(/(\d+(?:\.\d+)?)\s*year/);
    const month = text.match(/(\d+(?:\.\d+)?)\s*month/);
    const parsed = year ? Number(year[1]) : month ? Number(month[1]) / 12 : Number.isFinite(raw) ? raw : null;
    if (Number.isFinite(parsed)) return parsed < 2 ? "puppy" : parsed >= 7 ? "senior" : "adult";
    if (text.includes("puppy")) return "puppy";
    if (text.includes("senior")) return "senior";
    return "unknown";
  };
  const ages = {};
  for (const dog of dogs) { const value = ageBucket(dog); ages[value] = (ages[value] || 0) + 1; }
  return {
    size: categorical("size"),
    age: Object.fromEntries(Object.entries(ages).map(([value, count]) => [value, { dogs: count, pct: round(count / dogs.length * 100) }])),
    energy: categorical("energy_level"),
    good_with_kids: boolean("good_with_kids"),
    good_with_dogs: boolean("good_with_dogs"),
    good_with_cats: boolean("good_with_cats"),
    potty_trained: boolean("potty_trained"),
    hypoallergenic: boolean("hypoallergenic"),
    shedding: categorical("shedding_level"),
    barking: categorical("barking_level"),
    yard_required: boolean("yard_required"),
    matching_evidence_by_dimension: evidence,
  };
}

function enrichmentCandidates(dogs) {
  return dogs.filter((dog) => {
    if (!getEnrichmentEligibilityReason(dog)) return false;
    if (String(dog.description || "").trim().length < 80) return false;
    return candidateEvidenceProfile(dog).missing.length > 0;
  });
}

function candidateEvidenceProfile(dog) {
  const missing = [];
  const known = [];
  for (const questionId of Object.keys(MATCH_WEIGHTS)) {
    const answers = { ...BASE_ANSWERS, [questionId]: PROBE_ANSWERS[questionId] };
    const [row] = computeRankedMatches([dog], answers);
    const contribution = row?.breakdown?.contributions?.find((item) => item.questionId === questionId);
    (contribution ? known : missing).push(questionId);
  }
  return { known, missing };
}

function renderMarkdown(report) {
  const overall = report.overall;
  const lines = [
    "# Hooman Finder match-coverage audit",
    "",
    `Generated: ${report.generated_at}`,
    "",
    "## Executive summary",
    "",
    `This read-only audit evaluated **${report.simulation.profiles_evaluated.toLocaleString()} deterministic full quiz profiles** against **${report.inventory.public_dogs.toLocaleString()} currently public dogs** using the proposed local \`computeRankedMatches\` implementation.`,
    "",
    `The literal full-input space is infinite because city is free text. Holding city to one placeholder, there are **${Number(report.combination_space.theoretical_raw_nonempty_multi).toExponential(3)}** raw answer combinations, **${Number(report.combination_space.ui_valid_respecting_exclusive_options).toExponential(3)}** UI-valid combinations, and **${Number(report.combination_space.distinct_matcher_behaviors_after_collapsing_equivalent_answers).toExponential(3)}** distinct scoring behaviors.`,
    "",
    `The proposed local engine excludes confirmed child, dog, cat, and small-animal incompatibilities before scoring. Yard/fence remains a scoring and caution signal, while unknown and AI-estimated compatibility do not exclude. The resulting inventory-independent zero-eligible rate is **${overall.zero_eligible_pct}%**.`,
    "",
    `Best-match coverage: **${overall.best_at_least_70_pct}% ≥70**, **${overall.best_at_least_80_pct}% ≥80**, **${overall.best_at_least_90_pct}% ≥90**. Median best score: **${overall.median_best_match_pct}%**; average: **${overall.average_best_match_pct}%**.`,
    "",
    "## Simulation strategy",
    "",
    `- Exhaustive: ${report.simulation.exhaustive_core_profiles.toLocaleString()} combinations across every valid size selection, every valid age selection, child/no-child scoring behavior, every valid pet combination, and all potty answers.`,
    `- Systematic: deterministic all-pairs coverage across all ${Object.keys(MATCH_WEIGHTS).length} scored questions and their UI answers, plus ${report.simulation.space_filling_full_profiles.toLocaleString()} deterministic space-filling full personas with many simultaneous constraints.`,
    `- Total after deduplication: ${report.simulation.profiles_evaluated.toLocaleString()} profiles. No random sampling was used.`,
    `- Fully constrained space-filling subset: median best **${report.simulation_segments.deterministic_space_filling_full_profiles.median_best_match_pct}%**, ≥70 **${report.simulation_segments.deterministic_space_filling_full_profiles.best_at_least_70_pct}%**, ≥80 **${report.simulation_segments.deterministic_space_filling_full_profiles.best_at_least_80_pct}%**, ≥90 **${report.simulation_segments.deterministic_space_filling_full_profiles.best_at_least_90_pct}%**.`,
    "",
    "## Best-score distribution",
    "",
    "| Band | Profiles | Percent |",
    "|---|---:|---:|",
    ...Object.entries(overall.best_score_bands).map(([band, value]) => `| ${band} | ${value.profiles.toLocaleString()} | ${value.pct}% |`),
    "",
    "## Geographic coverage",
    "",
    "The quiz does not apply city, radius, ZIP, distance, or state automatically. These state metrics apply the existing Results state filter after scoring.",
    "",
    "| State | Dogs | Orgs | Median top | Zero dogs | ≥70 | ≥80 | ≥90 | Median eligible |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...report.geography.map((state) => `| ${state.state_name} | ${state.public_dogs} | ${state.public_organizations} | ${state.metrics.median_best_match_pct ?? "—"}% | ${state.metrics.zero_eligible_pct}% | ${state.metrics.best_at_least_70_pct}% | ${state.metrics.best_at_least_80_pct}% | ${state.metrics.best_at_least_90_pct}% | ${state.metrics.median_eligible_dogs} |`),
    "",
    "## Most restrictive answers",
    "",
    "Controlled deltas compare each answer with the same profile context and that question omitted.",
    "",
    "| Question | Answer | Δ top score | Δ ≥70 dogs | Δ ≥80 dogs | Δ cautions |",
    "|---|---|---:|---:|---:|---:|",
    ...report.question_impacts.slice(0, 20).map((row) => `| ${row.question_id} | ${row.answer_label} | ${row.average_top_score_delta} | ${row.average_70_dog_delta} | ${row.average_80_dog_delta} | ${row.average_confirmed_caution_delta} |`),
    "",
    "## Weakest profiles",
    "",
    ...report.weak_profiles.slice(0, 12).map((profile) => `- **${profile.profile_id} — best ${profile.highest_match_pct ?? "unscored"}%:** ${Object.entries(profile.active_answers).map(([id, value]) => `${id}=${answerLabel(id, value)}`).join("; ")}`),
    "",
    "### Overrepresented constraints among profiles with no ≥70 match",
    "",
    "| Answer | Weak profiles | Weak-profile share | Representation lift |",
    "|---|---:|---:|---:|",
    ...report.constraint_gaps.top_overrepresented_answers.slice(0, 15).map((row) => `| ${row.answer} | ${row.weak_profiles} | ${row.weak_profile_pct}% | ${row.representation_lift}× |`),
    "",
    "## Evidence gaps",
    "",
    "| Dimension | Structured | Bio explicit | Breed/coat | Profile inference | Mixed | Unknown |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...Object.entries(report.evidence_quality).map(([id, values]) => `| ${id} | ${values.structured.pct}% | ${values.bio_explicit.pct}% | ${values.breed_coat_inference.pct}% | ${values.profile_inference.pct}% | ${values.mixed.pct}% | ${values.unknown.pct}% |`),
    "",
    "## Enrichment priority",
    "",
    `The production eligibility predicate currently finds **${report.enrichment_priority.eligible_backlog} dogs** in the backlog (${Object.entries(report.enrichment_priority.eligibility_reasons).map(([reason, count]) => `${count} ${reason}`).join(", ")}). The material read-only candidate cohort contains **${report.enrichment_priority.material_candidates} dogs** with a substantive source biography and at least one missing scored dimension. Priority is based on how often completing currently missing evidence could move a weak profile across 70/80, then average optimistic uplift and state scarcity. It is an upper-bound triage signal, not a claim that enrichment will find favorable facts.`,
    "",
    "| Rank | Dog | State | Org | Eligibility | Potential ≥70 rescues | Potential ≥80 rescues | Avg upper-bound uplift | Missing scored fields |",
    "|---:|---|---|---|---|---:|---:|---:|---|",
    ...report.enrichment_priority.top_cohort.slice(0, 30).map((dog, index) => `| ${index + 1} | ${dog.name} | ${dog.state} | ${dog.organization} | ${dog.eligibility_reason} | ${dog.potential_70_profile_rescues} | ${dog.potential_80_profile_rescues} | ${dog.average_optimistic_uplift} | ${dog.missing_scored_dimensions.join(", ")} |`),
    "",
    "## Score anomalies",
    "",
    `- Suspicious high-score cases: ${report.anomalies.suspicious_high_count.toLocaleString()} profile/dog cases; ${report.anomalies.suspicious_high_examples.length} unique-dog examples retained.`,
    `- Of those, ${report.anomalies.high_with_under_80_evidence_coverage_count.toLocaleString()} had under 80% evidence coverage and ${report.anomalies.high_with_zero_compatibility_dimension_count.toLocaleString()} contained at least one zero-compatibility scored dimension.`,
    `- Suspicious low-score cases caused mainly by limited evidence: ${report.anomalies.suspicious_low_count.toLocaleString()} profile/dog cases; ${report.anomalies.suspicious_low_examples.length} unique-dog examples retained.`,
    `- Confirmed-incompatibility leakage into returned results: ${report.anomalies.confirmed_incompatibility_leakage_count}.`,
    "",
    "## Product findings",
    "",
    ...report.findings.map((finding) => `- **${finding.severity}: ${finding.title}.** ${finding.detail}`),
    "",
    "## Question usefulness",
    "",
    "| Question | Weight | Role | Evidence unknown | Current value |",
    "|---|---:|---|---:|---|",
    ...report.questions.map((question) => `| ${question.id} | ${question.weight} | ${question.matching_role} | ${question.evidence ? `${question.evidence.unknown.pct}%` : "—"} | ${question.affects_match_percentage ? "Scored" : "Does not affect percentage"} |`),
    "",
    "## Read-only guarantee",
    "",
    "The audit issued SELECT requests only. It did not run ingestion, enable sources, enrich dogs, mutate Supabase, change deployed production logic, or deploy anything. It evaluates the local proposed matching-safety change.",
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log("node scripts/audit-match-coverage.mjs [--inventory=production|file.json] [--json=...] [--markdown=...] [--profiles-csv=...] [--priority-csv=...]");
    return;
  }
  const generatedAt = new Date().toISOString();
  console.log("Loading read-only public inventory...");
  const dogs = args.inventory === "production" ? await fetchProductionDogs(generatedAt) : loadInventory(args.inventory, generatedAt);
  if (!dogs.length) throw new Error("No public dogs found.");
  const states = [...new Set(dogs.map((dog) => String(dog.placement_state || "").toUpperCase()))].sort();
  const profiles = buildProfiles();
  console.log(`Evaluating ${profiles.length} deterministic profiles against ${dogs.length} public dogs...`);
  const stateCounts = Object.fromEntries(states.map((state) => [state, dogs.filter((dog) => String(dog.placement_state || "").toUpperCase() === state).length]));

  const eligibleBacklog = dogs.map((dog) => ({ dog, reason: getEnrichmentEligibilityReason(dog) })).filter((row) => row.reason);
  const eligibilityReasonByDog = new Map(eligibleBacklog.map((row) => [String(row.dog.id), row.reason]));
  const candidates = enrichmentCandidates(dogs);
  const candidateIds = new Set(candidates.map((dog) => String(dog.id)));
  const candidateStats = new Map(candidates.map((dog) => [String(dog.id), { dog, eligibilityReason: eligibilityReasonByDog.get(String(dog.id)), potential70: 0, potential80: 0, upliftSum: 0, opportunities: 0, evidence: candidateEvidenceProfile(dog) }]));
  const profileRows = [];
  const stateProfileRows = new Map(states.map((state) => [state, []]));
  const weakProfiles = [];
  const highAnomalies = [];
  const highZeroExamples = [];
  const lowAnomalies = [];
  const highExampleDogs = new Set();
  const lowExampleDogs = new Set();
  let suspiciousHighCount = 0;
  let suspiciousHighCoverageCount = 0;
  let suspiciousHighZeroContributionCount = 0;
  let suspiciousLowCount = 0;
  let highWithCaution = 0;
  let confirmedIncompatibilityExclusionCount = 0;
  let confirmedIncompatibilityLeakageCount = 0;
  const confirmedIncompatibilityReasonCounts = new Map();

  for (let index = 0; index < profiles.length; index += 1) {
    const profile = profiles[index];
    const ranked = computeRankedMatches(dogs, profile.answers);
    const rankedDogIds = new Set(ranked.map((result) => String(result.dog.id)));
    const confirmedExcluded = dogs
      .map((dog) => ({ dog, reasons: getConfirmedIncompatibilities(dog, profile.answers) }))
      .filter(({ reasons }) => reasons.length > 0);
    confirmedIncompatibilityExclusionCount += confirmedExcluded.length;
    confirmedIncompatibilityLeakageCount += confirmedExcluded.filter(({ dog }) => rankedDogIds.has(String(dog.id))).length;
    for (const { reasons } of confirmedExcluded) {
      for (const { code } of reasons) confirmedIncompatibilityReasonCounts.set(code, (confirmedIncompatibilityReasonCounts.get(code) || 0) + 1);
    }
    const summary = summarizeRows(ranked, dogs.length);
    const activeAnswers = Object.fromEntries(Object.keys(MATCH_WEIGHTS).filter((id) => stable(profile.answers[id]) !== stable(BASE_ANSWERS[id])).map((id) => [id, profile.answers[id]]));
    const row = { profile_id: profile.id, strategies: profile.strategies.join("+"), ...summary, active_answers: activeAnswers, answers: profile.answers };
    profileRows.push(row);
    if (!Number.isFinite(summary.highest_match_pct) || summary.highest_match_pct < 70) weakProfiles.push(row);

    for (const state of states) stateProfileRows.get(state).push(summarizeRows(ranked.filter((result) => String(result.dog.placement_state || "").toUpperCase() === state), stateCounts[state] || 0));

    const currentTop = summary.highest_match_pct ?? 0;
    for (const result of ranked) {
      if (result.scorePct >= 90) {
        if (result.breakdown.compatibilityCautions.length) highWithCaution += 1;
        const zeroContribution = result.breakdown.contributions.find((item) => item.rawCompatibility === 0);
        if ((result.breakdown.evidenceCoveragePct ?? 0) < 80 || zeroContribution) {
          suspiciousHighCount += 1;
          if ((result.breakdown.evidenceCoveragePct ?? 0) < 80) suspiciousHighCoverageCount += 1;
          if (zeroContribution) suspiciousHighZeroContributionCount += 1;
          if (highAnomalies.length < 30 && !highExampleDogs.has(String(result.dog.id))) {
            highExampleDogs.add(String(result.dog.id));
            highAnomalies.push({ profile_id: profile.id, dog_id: result.dog.id, dog_name: result.dog.name, state: String(result.dog.placement_state || "").toUpperCase(), score_pct: result.scorePct, raw_score_pct: result.breakdown.rawScorePct, evidence_coverage_pct: result.breakdown.evidenceCoveragePct, zero_compatibility_dimension: zeroContribution?.questionId || null, cautions: result.breakdown.compatibilityCautions, answers: activeAnswers });
          }
          if (zeroContribution && highZeroExamples.length < 30) {
            highZeroExamples.push({ profile_id: profile.id, dog_id: result.dog.id, dog_name: result.dog.name, state: String(result.dog.placement_state || "").toUpperCase(), score_pct: result.scorePct, raw_score_pct: result.breakdown.rawScorePct, evidence_coverage_pct: result.breakdown.evidenceCoveragePct, zero_compatibility_dimension: zeroContribution.questionId, answers: activeAnswers });
          }
        }
      }
      if (result.scorePct < 70 && result.breakdown.rawScorePct >= 85 && !result.breakdown.compatibilityCautions.length && result.breakdown.evidenceCoveragePct < 70) {
        suspiciousLowCount += 1;
        if (lowAnomalies.length < 30 && !lowExampleDogs.has(String(result.dog.id))) {
          lowExampleDogs.add(String(result.dog.id));
          lowAnomalies.push({ profile_id: profile.id, dog_id: result.dog.id, dog_name: result.dog.name, state: String(result.dog.placement_state || "").toUpperCase(), score_pct: result.scorePct, raw_score_pct: result.breakdown.rawScorePct, evidence_coverage_pct: result.breakdown.evidenceCoveragePct, missing_weight: result.breakdown.evidenceRequestedWeight - result.breakdown.evidenceCoveredWeight, answers: activeAnswers });
        }
      }

      if (!candidateIds.has(String(result.dog.id)) || currentTop >= 80) continue;
      const optimistic = optimisticScore(result);
      if (!Number.isFinite(optimistic) || optimistic <= result.scorePct) continue;
      const stats = candidateStats.get(String(result.dog.id));
      stats.upliftSum += optimistic - (result.scorePct ?? 0);
      stats.opportunities += 1;
      if (currentTop < 70 && optimistic >= 70) stats.potential70 += 1;
      if (currentTop < 80 && optimistic >= 80) stats.potential80 += 1;
    }
    if ((index + 1) % 1000 === 0) console.log(`  ${index + 1}/${profiles.length}`);
  }

  console.log("Auditing evidence and controlled question impacts...");
  const evidence = evidenceAudit(dogs);
  const impacts = controlledQuestionImpacts(dogs, profiles);
  const geography = states.map((state) => {
    const stateDogs = dogs.filter((dog) => String(dog.placement_state || "").toUpperCase() === state);
    const organizations = new Set(stateDogs.map((dog) => String(dog.ingestion_source_id || dog.shelter_id || dog.rescuegroups_org_id || dog.shelter_name || "")).filter(Boolean));
    const rows = stateProfileRows.get(state);
    const hardest = [...rows].map((summary, index) => ({ ...summary, profile_id: profiles[index].id, active_answers: profileRows[index].active_answers })).sort((a, b) => (a.highest_match_pct ?? -1) - (b.highest_match_pct ?? -1)).slice(0, 10);
    const strongest = [...rows].map((summary, index) => ({ ...summary, profile_id: profiles[index].id, active_answers: profileRows[index].active_answers })).sort((a, b) => (b.highest_match_pct ?? -1) - (a.highest_match_pct ?? -1) || b.dogs_at_least_80 - a.dogs_at_least_80).slice(0, 10);
    return { state, state_name: STATE_NAMES[state] || state, public_dogs: stateDogs.length, public_organizations: organizations.size, metrics: aggregateProfileMetrics(rows), hardest_profiles: hardest, strongest_profiles: strongest };
  });

  const priority = [...candidateStats.values()].map((stats) => {
    const state = String(stats.dog.placement_state || "").toUpperCase();
    const organization = stats.dog.shelters?.name || stats.dog.shelter_name || stats.dog.rescuegroups_org_id || "Unknown";
    const averageUplift = round(stats.upliftSum / Math.max(stats.opportunities, 1));
    const descriptionStrength = Math.min(String(stats.dog.description || "").length / 100, 5);
    const scarcityBonus = 50 / Math.sqrt(Math.max(stateCounts[state] || 1, 1));
    const priorityScore = round(
      stats.potential70 * 0.2 + stats.potential80 * 0.05 + (averageUplift || 0) * 0.1 +
      stats.evidence.known.length * 8 - stats.evidence.missing.length * 2 + descriptionStrength * 2 + scarcityBonus
    );
    return {
      dog_id: stats.dog.id, name: stats.dog.name, state, organization,
      eligibility_reason: stats.eligibilityReason,
      description_length: String(stats.dog.description || "").length,
      potential_70_profile_rescues: stats.potential70,
      potential_80_profile_rescues: stats.potential80,
      average_optimistic_uplift: averageUplift,
      known_scored_dimensions: stats.evidence.known,
      missing_scored_dimensions: stats.evidence.missing,
      state_inventory: stateCounts[state] || 0,
      priority_score: priorityScore,
    };
  }).sort((a, b) => b.priority_score - a.priority_score || b.potential_70_profile_rescues - a.potential_70_profile_rescues || a.state_inventory - b.state_inventory || String(a.name).localeCompare(String(b.name)));

  const fieldPriority = {};
  for (const dog of priority) for (const field of dog.missing_scored_dimensions) fieldPriority[field] = (fieldPriority[field] || 0) + 1;
  const orgs = new Set(dogs.map((dog) => String(dog.ingestion_source_id || dog.shelter_id || dog.rescuegroups_org_id || dog.shelter_name || "")).filter(Boolean));
  const findings = [
    { severity: "High", title: "Geographic quiz answers do not constrain results", detail: "adoption_city and adoption_travel_radius are stored but never read by matching or the initial Results query. Geography is only an optional manual state filter." },
    { severity: "Resolved locally", title: "Confirmed household incompatibilities are hard exclusions", detail: "The proposed matcher excludes confirmed child, dog, cat, and small-animal conflicts before scoring. Unknown and AI-estimated values do not exclude." },
    { severity: "Deferred", title: "Yard/fence remains ranking and caution only", detail: "Current RescueGroups yard/fence fields are not semantically reliable enough for hard exclusion. Future filtering requires an explicit verified-requirement classification." },
    { severity: "High", title: "Child age detail is discarded", detail: "Under 3, ages 3–5, 6–9, 10–12, teens, visiting children, and any combinations all become the same has-children boolean." },
    { severity: "Medium", title: "Twelve of twenty-nine questions do not affect match percentage", detail: "Landlord restrictions, crate openness, reactivity comfort, behavior tolerance, city, travel radius, weekend activity, play style, stairs, budget, medical-needs openness, and medication comfort add quiz friction without changing ranking." },
    { severity: "Medium", title: "Apartment matching depends exclusively on AI trait evidence", detail: "housing_type does not use size, exercise, barking, yard, or any structured apartment field directly; without ai_traits.apartment_friendly it contributes no evidence." },
    { severity: "Design", title: "Displayed percentages mix compatibility with evidence coverage", detail: "The score is raw compatibility multiplied by a 60% floor plus 40% evidence-coverage modifier. It is not a probability of adoption success, and sparse profiles can still retain most of their compatibility score." },
  ];

  const report = {
    generated_at: generatedAt,
    mode: "read_only",
    inventory: { source: args.inventory, public_dogs: dogs.length, public_organizations: orgs.size, states, state_counts: stateCounts },
    combination_space: countCombinationSpace(),
    simulation: {
      profiles_evaluated: profiles.length,
      exhaustive_core_profiles: profiles.filter((profile) => profile.strategies.includes("exhaustive_core_dealbreakers")).length,
      space_filling_full_profiles: profiles.filter((profile) => profile.strategies.includes("deterministic_space_filling_full_profiles")).length,
      exhaustive_dimensions: Object.keys(CORE_LEVELS),
      systematic_dimensions: Object.keys(PROFILE_LEVELS),
      method: "Union of exhaustive code-distinct dealbreaker combinations and deterministic all-pairs coverage of every scored question/answer, deduplicated; all 29 questions are populated in every profile; no randomness.",
    },
    overall: aggregateProfileMetrics(profileRows),
    simulation_segments: Object.fromEntries([
      "exhaustive_core_dealbreakers",
      "all_pairs_scored_dimensions",
      "deterministic_space_filling_full_profiles",
    ].map((strategy) => [strategy, aggregateProfileMetrics(profileRows.filter((row) => row.strategies.split("+").includes(strategy)))])),
    geography,
    weak_profiles: weakProfiles.sort((a, b) => (a.highest_match_pct ?? -1) - (b.highest_match_pct ?? -1) || a.dogs_at_least_70 - b.dogs_at_least_70).slice(0, 100),
    constraint_gaps: constraintGapSummary(profileRows),
    best_covered_profiles: [...profileRows].sort((a, b) => (b.highest_match_pct ?? -1) - (a.highest_match_pct ?? -1) || b.dogs_at_least_80 - a.dogs_at_least_80).slice(0, 100),
    question_impacts: impacts,
    evidence_quality: evidence,
    inventory_diversity: inventoryDiversity(dogs, evidence),
    enrichment_priority: {
      eligible_backlog: eligibleBacklog.length,
      eligibility_reasons: eligibleBacklog.reduce((counts, row) => { counts[row.reason] = (counts[row.reason] || 0) + 1; return counts; }, {}),
      material_candidates: candidates.length,
      method: "Eligibility reuses the production enrichment predicate across all public sources, including new, version-outdated, and source-content-changed dogs. Material candidates also require a substantive source biography and at least one missing scored dimension. Potential profile rescues use an explicitly optimistic missing-evidence upper bound. Priority rewards existing scored evidence and source biography depth, penalizes broad missingness, and modestly favors thinner states; it does not rank dogs merely by number of missing fields.",
      missing_field_frequency_among_candidates: Object.fromEntries(Object.entries(fieldPriority).sort((a, b) => b[1] - a[1])),
      top_cohort: priority.slice(0, 50),
    },
    anomalies: { suspicious_high_count: suspiciousHighCount, high_with_under_80_evidence_coverage_count: suspiciousHighCoverageCount, high_with_zero_compatibility_dimension_count: suspiciousHighZeroContributionCount, suspicious_high_examples: highAnomalies, high_with_zero_compatibility_examples: highZeroExamples, suspicious_low_count: suspiciousLowCount, suspicious_low_examples: lowAnomalies, high_with_confirmed_caution_count: highWithCaution, confirmed_incompatibility_exclusion_cases: confirmedIncompatibilityExclusionCount, confirmed_incompatibility_reason_counts: Object.fromEntries([...confirmedIncompatibilityReasonCounts.entries()].sort((a, b) => b[1] - a[1])), confirmed_incompatibility_leakage_count: confirmedIncompatibilityLeakageCount },
    score_calibration: {
      meaning: "Confirmed child/dog/cat/small-animal conflicts are excluded first. Yard/fence remains a ranking signal with its existing caution and cap. For remaining dogs, displayed score = evidence-adjusted compatibility × (0.60 + 0.40 × coverage component), rounded.",
      thresholds_are_diagnostic_not_probabilities: true,
      by_active_answer_count: Object.entries(profileRows.reduce((groups, row) => { const count = Object.keys(row.active_answers).length; (groups[count] ||= []).push(row.highest_match_pct); return groups; }, {})).map(([activeAnswers, values]) => ({ active_answers: Number(activeAnswers), profiles: values.length, average_best: round(values.filter(Number.isFinite).reduce((a, b) => a + b, 0) / Math.max(values.filter(Number.isFinite).length, 1)), median_best: round(percentile(values, 0.5)) })),
    },
    questions: questionAudit(evidence, impacts),
    findings,
    interpretation: {
      primary_problem: "The audit separates three layers: thin-state inventory limits alternatives, widespread unknown evidence weakens constraint-sensitive matching, and several quiz/algorithm gaps make headline scores look more complete than the underlying evidence.",
      one_change_candidate: "Wire adoption city/travel radius into pre-ranking eligibility using real geospatial distance. The quiz currently asks for location but ignores it, so a high percentage can describe a dog the adopter cannot realistically reach. Targeted evidence enrichment is the next data-quality action, not a substitute for geographic eligibility.",
    },
    guarantees: { production_writes: 0, sync_runs: 0, ai_enrichment_runs: 0, organizations_enabled: 0, deployments: 0, production_logic_changed: false, local_matching_logic_changed: true },
  };

  fs.mkdirSync(path.dirname(args.json), { recursive: true });
  fs.writeFileSync(args.json, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(args.markdown, renderMarkdown(report) + "\n");
  writeCsv(args.profilesCsv, ["profile_id", "strategies", "eligible_dogs", "hard_excluded_dogs", "dogs_with_confirmed_caution", "scored_dogs", "highest_match_pct", "second_highest_pct", "fifth_highest_pct", "tenth_highest_pct", "median_returned_pct", "top_dog_id", "top_dog_name", "top_dog_state", "top_positive_factors", "top_negative_factors", "top_compatibility_cautions", "top_evidence_presence_pct", "top_evidence_quality_pct", "top_evidence_coverage_pct", "dogs_at_least_50", "dogs_at_least_70", "dogs_at_least_80", "dogs_at_least_90", "band", "active_answers", "answers"], profileRows);
  writeCsv(args.priorityCsv, ["dog_id", "name", "state", "organization", "eligibility_reason", "description_length", "potential_70_profile_rescues", "potential_80_profile_rescues", "average_optimistic_uplift", "known_scored_dimensions", "missing_scored_dimensions", "state_inventory", "priority_score"], priority);
  console.log(JSON.stringify({ output: { json: args.json, markdown: args.markdown, profiles_csv: args.profilesCsv, priority_csv: args.priorityCsv }, inventory: report.inventory, profiles: profiles.length, overall: report.overall, eligible_backlog: eligibleBacklog.length, candidates: candidates.length }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
