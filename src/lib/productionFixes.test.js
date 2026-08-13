import test from "node:test";
import assert from "node:assert/strict";

import { MATCH_WEIGHTS, computeRankedMatches } from "./matchingLogic.js";
import { ALL_QUESTIONS, canonicalizeAllergySensitivity } from "./quizQuestions.js";
import { normalizeExternalUrl } from "./urlSafety.js";

function aiTrait(value, confidence, evidenceBasis) {
  return { value, confidence, evidence_basis: evidenceBasis, evidence: "Test evidence" };
}

const fullSupportedAnswers = {
  size_preference: ["small"],
  age_preference: ["adult"],
  kids_in_home: ["under_3"],
  pets_in_home: ["dogs"],
  potty_requirement: "must_be_trained",
  dog_social_preference: "very_dog_friendly",
  first_time_owner: "yes",
  housing_type: "apartment",
  separation_anxiety_willingness: "no",
  training_commitment_level: "medium",
  noise_preference: "prefer_quiet",
  daily_walk_minutes: "30_60",
  weekend_activity_style: "moderately_active",
  energy_preference: "moderate",
  yard: "yes",
  alone_time: "4_6",
  allergy_sensitivity: "mild_allergies",
  shedding_preference: "moderate",
};

const richStructuredDog = {
  name: "Rich",
  size: "Small",
  age_years: 4,
  good_with_kids: true,
  good_with_dogs: true,
  potty_trained: true,
  first_time_friendly: true,
  max_alone_hours: 6,
  obedience_training: "Basic Training",
  barking_level: "Quiet",
  exercise_needs: "Moderate",
  energy_level: "Moderate",
  yard_required: true,
  fence_needs: "Not Required",
  hypoallergenic: true,
  shedding_level: "Moderate",
};

test("external URLs require a real hostname", () => {
  assert.equal(normalizeExternalUrl("http://"), "");
  assert.equal(normalizeExternalUrl("https://"), "");
  assert.equal(normalizeExternalUrl("http://projecthoperescue.org"), "https://projecthoperescue.org");
});

test("external URLs continue to reject control and delimiter characters", () => {
  for (const unsafeCharacter of ["\u0000", "\u001f", "\u007f", "<", ">", '"', "'", "`", "\\"]) {
    assert.equal(normalizeExternalUrl(`https://example.com/${unsafeCharacter}unsafe`), "");
  }

  assert.equal(
    normalizeExternalUrl("https://example.com/safe-path?dog=Louise"),
    "https://example.com/safe-path?dog=Louise"
  );
});

test("allergy quiz options use the database constraint values", () => {
  const question = ALL_QUESTIONS.find(({ id }) => id === "allergy_sensitivity");
  assert.deepEqual(question.options.map(({ value }) => value), ["have_allergies", "mild_allergies", "no_allergies"]);
  assert.equal(canonicalizeAllergySensitivity("needs_low_shedding"), "have_allergies");
  assert.equal(canonicalizeAllergySensitivity("mild"), "mild_allergies");
  assert.equal(canonicalizeAllergySensitivity("none"), "no_allergies");
});

test("the refined scoreable set excludes weekend activity and unsupported questions", () => {
  assert.equal(Object.keys(MATCH_WEIGHTS).length, 17);
  for (const unsupported of [
    "landlord_restrictions",
    "crate_ok",
    "reactivity_comfort",
    "behavior_tolerance",
    "adoption_city",
    "adoption_travel_radius",
    "play_styles",
    "stairs",
    "monthly_pet_budget_range",
    "medical_needs_ok",
    "medication_comfort",
    "weekend_activity_style",
  ]) {
    assert.equal(Object.hasOwn(MATCH_WEIGHTS, unsupported), false, `${unsupported} must remain unscored`);
  }
});

test("confirmed child incompatibility retains its warning and 49 percent cap", () => {
  const dog = { ...richStructuredDog, name: "Toto", good_with_kids: false };
  const [result] = computeRankedMatches([dog], fullSupportedAnswers);
  assert.equal(result.scorePct, 49);
  assert.deepEqual(result.breakdown.compatibilityCautions, [
    "This dog is listed as not compatible with children, but your household includes children.",
  ]);
});

test("confirmed dog and cat negatives warn while unknown does not become a match", () => {
  const answers = { size_preference: ["flexible"], pets_in_home: ["dogs", "cats"] };
  const [negative] = computeRankedMatches([{ name: "Confirmed no", good_with_dogs: false, good_with_cats: false }], answers);
  const [unknown] = computeRankedMatches([{ name: "Unknown" }], answers);
  assert.ok(negative.scorePct <= 49);
  assert.equal(negative.breakdown.compatibilityCautions.length, 2);
  assert.equal(unknown.scorePct, null);
  assert.equal(unknown.breakdown.emptyReason, "no_dog_evidence");
  assert.deepEqual(unknown.breakdown.compatibilityCautions, []);
});

test("many unknowns produce a cautious score rather than a sparse 100", () => {
  const sparseDog = { name: "Sparse", size: "Small", age_years: 4 };
  const [result] = computeRankedMatches([sparseDog], fullSupportedAnswers);
  assert.equal(result.breakdown.rawCompatibilityPct, 100);
  assert.ok(result.breakdown.evidencePresencePct < 25);
  assert.ok(result.breakdown.evidenceCoveragePct < 25);
  assert.ok(result.scorePct >= 60 && result.scorePct < 75);
  assert.notEqual(result.scorePct, 100);
  assert.equal(result.breakdown.limitedInformation, true);
});

test("same raw compatibility ranks broad evidence above sparse evidence", () => {
  const sparseDog = { name: "Sparse", size: "Small", age_years: 4 };
  const results = computeRankedMatches([sparseDog, richStructuredDog], fullSupportedAnswers);
  const byName = new Map(results.map((row) => [row.dog.name, row]));
  assert.equal(byName.get("Sparse").breakdown.rawCompatibilityPct, 100);
  assert.equal(byName.get("Rich").breakdown.rawCompatibilityPct, 100);
  assert.ok(byName.get("Rich").breakdown.evidencePresencePct > byName.get("Sparse").breakdown.evidencePresencePct);
  assert.ok(byName.get("Rich").breakdown.evidenceQualityPct > byName.get("Sparse").breakdown.evidenceQualityPct - 1);
  assert.ok(byName.get("Rich").scorePct > byName.get("Sparse").scorePct);
  assert.equal(results[0].dog.name, "Rich");
});

test("structured evidence outweighs bio-explicit and profile inference", () => {
  const answers = { size_preference: ["flexible"], energy_preference: "low" };
  const dogs = [
    { name: "Structured", energy_level: "Low" },
    { name: "Bio explicit", bio_energy_level: "low", ai_traits: { energy_level: aiTrait("low", 1, "bio_explicit") } },
    { name: "Profile", bio_energy_level: "low", ai_traits: { energy_level: aiTrait("low", 1, "profile_inference") } },
  ];
  const byName = new Map(computeRankedMatches(dogs, answers).map((row) => [row.dog.name, row]));
  assert.equal(byName.get("Structured").scorePct, 100);
  assert.ok(byName.get("Structured").scorePct > byName.get("Bio explicit").scorePct);
  assert.ok(byName.get("Bio explicit").scorePct > byName.get("Profile").scorePct);
  assert.equal(byName.get("Structured").breakdown.evidenceQualityPct, 100);
  assert.equal(byName.get("Bio explicit").breakdown.evidenceQualityPct, 65);
  assert.equal(byName.get("Profile").breakdown.evidenceQualityPct, 25);
});

test("weak profile inferences cannot create confirmed-level evidence coverage", () => {
  const answers = { size_preference: ["flexible"], energy_preference: "low", noise_preference: "prefer_quiet" };
  const [profile] = computeRankedMatches([{
    name: "Profile only",
    bio_energy_level: "low",
    bio_barking_level: "quiet",
    ai_traits: {
      energy_level: aiTrait("low", 1, "profile_inference"),
      barking_level: aiTrait("quiet", 1, "profile_inference"),
    },
  }], answers);
  assert.equal(profile.breakdown.evidencePresencePct, 100);
  assert.equal(profile.breakdown.evidenceQualityPct, 25);
  assert.equal(profile.breakdown.evidenceCoveragePct, 63);
  assert.ok(profile.scorePct < profile.breakdown.rawCompatibilityPct);
});

test("flexible answers add neither points nor requested evidence", () => {
  const [result] = computeRankedMatches(
    [{ name: "Flexible", size: "Small", age_years: 4 }],
    { size_preference: ["flexible"], age_preference: ["flexible"], energy_preference: "flexible" }
  );
  assert.equal(result.scorePct, null);
  assert.equal(result.breakdown.evidenceRequestedWeight, 0);
  assert.equal(result.breakdown.evidenceCoveredWeight, 0);
  assert.deepEqual(result.breakdown.contributions, []);
});

test("AI behavioral negatives never create hard warnings or a confirmed cap", () => {
  const answers = { size_preference: ["flexible"], kids_in_home: ["under_3"] };
  for (const evidenceBasis of ["bio_explicit", "profile_inference"]) {
    const [result] = computeRankedMatches([{
      name: evidenceBasis,
      bio_good_with_kids: "no",
      ai_traits: { good_with_kids: aiTrait("false", 1, evidenceBasis) },
    }], answers);
    assert.deepEqual(result.breakdown.compatibilityCautions, []);
    assert.ok(Number.isFinite(result.scorePct));
    assert.notEqual(result.scorePct, 49);
  }
});

test("confirmed kids dogs cats and yard conflicts remain hard cautions", () => {
  const answers = {
    size_preference: ["flexible"],
    kids_in_home: ["under_3"],
    pets_in_home: ["dogs", "cats"],
    yard: "no",
  };
  const [result] = computeRankedMatches([{
    name: "Confirmed conflicts",
    good_with_kids: false,
    good_with_dogs: false,
    good_with_cats: false,
    yard_required: true,
    fence_needs: "3 foot",
  }], answers);
  assert.ok(result.scorePct <= 49);
  assert.equal(result.breakdown.compatibilityCautions.length, 4);
});

test("deeper supported quiz questions change ranking", () => {
  const dogs = [
    {
      name: "Quiet Homebody",
      size: "Small",
      age_years: 4,
      energy_level: "Low",
      exercise_needs: "Low",
      barking_level: "Quiet",
      obedience_training: "Well Trained",
      max_alone_hours: 6,
      ai_traits: { apartment_friendly: aiTrait("true", 1, "bio_explicit") },
    },
    {
      name: "Active Vocal",
      size: "Small",
      age_years: 4,
      energy_level: "High",
      exercise_needs: "High",
      barking_level: "Some",
      obedience_training: "Needs Training",
      max_alone_hours: 2,
      ai_traits: { apartment_friendly: aiTrait("maybe", 0.6, "profile_inference") },
    },
  ];
  const shallow = computeRankedMatches(dogs, { size_preference: ["small"], age_preference: ["adult"] });
  assert.deepEqual(shallow.map((row) => row.scorePct), [100, 100]);

  const deep = computeRankedMatches(dogs, {
    size_preference: ["small"],
    age_preference: ["adult"],
    housing_type: "apartment",
    separation_anxiety_willingness: "no",
    training_commitment_level: "low",
    noise_preference: "prefer_quiet",
    daily_walk_minutes: "15_30",
    weekend_activity_style: "homebody",
    energy_preference: "low",
  });
  assert.equal(deep[0].dog.name, "Quiet Homebody");
  assert.ok(deep[0].scorePct > deep[1].scorePct);
  for (const questionId of ["housing_type", "training_commitment_level", "noise_preference", "daily_walk_minutes", "energy_preference"]) {
    assert.ok(deep[0].breakdown.contributions.some((entry) => entry.questionId === questionId));
  }
  for (const questionId of ["separation_anxiety_willingness", "weekend_activity_style"]) {
    assert.equal(deep[0].breakdown.contributions.some((entry) => entry.questionId === questionId), false);
  }
});

test("weekend activity cannot duplicate daily exercise or energy evidence", () => {
  const [result] = computeRankedMatches([{
    name: "Active",
    exercise_needs: "High",
    energy_level: "High",
  }], {
    daily_walk_minutes: "60_plus",
    weekend_activity_style: "outdoorsy",
    energy_preference: "high",
  });

  assert.deepEqual(
    result.breakdown.contributions.map((entry) => entry.questionId).sort(),
    ["daily_walk_minutes", "energy_preference"]
  );
  assert.equal(result.breakdown.evidenceRequestedWeight, 4);
  assert.equal(result.breakdown.evidenceCoveredWeight, 4);
});

test("generic dog compatibility cannot receive duplicate social-preference credit", () => {
  const answers = {
    pets_in_home: ["dogs"],
    dog_social_preference: "very_dog_friendly",
  };
  const [generic] = computeRankedMatches([{ name: "Compatible", good_with_dogs: true }], answers);
  assert.deepEqual(generic.breakdown.contributions.map((entry) => entry.questionId), ["pets_in_home"]);
  assert.equal(generic.breakdown.evidenceCoveredWeight, MATCH_WEIGHTS.pets_in_home);

  const [specific] = computeRankedMatches([{
    name: "Social",
    good_with_dogs: true,
    description: "A social butterfly who loves other dogs.",
  }], answers);
  assert.deepEqual(
    specific.breakdown.contributions.map((entry) => entry.questionId).sort(),
    ["dog_social_preference", "pets_in_home"]
  );
  assert.equal(
    specific.breakdown.contributions.find((entry) => entry.questionId === "dog_social_preference").source,
    "bio_explicit"
  );
});

test("alone-time capacity cannot duplicate separation-anxiety scoring", () => {
  const answers = {
    alone_time: "4_6",
    separation_anxiety_willingness: "no",
  };
  const [hoursOnly] = computeRankedMatches([{ name: "Hours only", max_alone_hours: 6 }], answers);
  assert.deepEqual(hoursOnly.breakdown.contributions.map((entry) => entry.questionId), ["alone_time"]);
  assert.equal(hoursOnly.breakdown.evidenceCoveredWeight, MATCH_WEIGHTS.alone_time);

  const [explicitConcern] = computeRankedMatches([{
    name: "Explicit concern",
    max_alone_hours: 6,
    description: "Has separation anxiety and needs a gradual plan.",
  }], answers);
  const separation = explicitConcern.breakdown.contributions.find(
    (entry) => entry.questionId === "separation_anxiety_willingness"
  );
  assert.equal(separation.source, "bio_explicit");
  assert.ok(separation.adjustedCompatibility < 0.5);
  assert.equal(separation.positive, false);
});

test("allergy scoring does not duplicate shedding-only evidence", () => {
  const answers = {
    allergy_sensitivity: "have_allergies",
    shedding_preference: "minimal",
  };
  const [sheddingOnly] = computeRankedMatches([{
    name: "Low shedding",
    shedding_level: "Low",
  }], answers);
  assert.deepEqual(sheddingOnly.breakdown.contributions.map((entry) => entry.questionId), ["shedding_preference"]);
  assert.equal(sheddingOnly.breakdown.evidenceCoveredWeight, MATCH_WEIGHTS.shedding_preference);

  const [distinct] = computeRankedMatches([{
    name: "Confirmed hypoallergenic",
    shedding_level: "Low",
    hypoallergenic: true,
  }], answers);
  assert.deepEqual(
    distinct.breakdown.contributions.map((entry) => entry.questionId).sort(),
    ["allergy_sensitivity", "shedding_preference"]
  );
});

test("displayed match explanations come directly from scoring contributions", () => {
  const [result] = computeRankedMatches([richStructuredDog], fullSupportedAnswers);
  const contributionExplanations = new Set(result.breakdown.contributions.map((entry) => entry.explanation));
  for (const explanation of [...result.breakdown.matchReasons, ...result.breakdown.matchTradeoffs]) {
    assert.equal(contributionExplanations.has(explanation), true);
  }
  assert.ok(result.breakdown.matchReasons.length > 0);
});

test("structured source ties remain deterministic", () => {
  const answers = { size_preference: ["small"], energy_preference: "low" };
  const results = computeRankedMatches([
    { name: "Zulu", size: "Small", energy_level: "Low" },
    { name: "Alpha", size: "Small", energy_level: "Low" },
  ], answers);
  assert.deepEqual(results.map((result) => result.dog.name), ["Alpha", "Zulu"]);
  assert.deepEqual(results.map((result) => result.scorePct), [100, 100]);
});
