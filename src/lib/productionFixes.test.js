import test from "node:test";
import assert from "node:assert/strict";

import {
  MATCH_WEIGHTS,
  computeRankedMatches,
  getConfirmedIncompatibilities,
  questionAffectsMatchRanking,
} from "./matchingLogic.js";
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
    assert.equal(questionAffectsMatchRanking(unsupported), false, `${unsupported} must be disclosed as unscored`);
  }
  assert.equal(questionAffectsMatchRanking("size_preference"), true);
  assert.equal(questionAffectsMatchRanking("daily_walk_minutes"), true);
});

test("confirmed child incompatibility removes the dog from eligible results", () => {
  const dog = { ...richStructuredDog, name: "Toto", good_with_kids: false };
  assert.deepEqual(computeRankedMatches([dog], fullSupportedAnswers), []);
  assert.deepEqual(getConfirmedIncompatibilities(dog, fullSupportedAnswers).map(({ code }) => code), [
    "confirmed_child_incompatibility",
  ]);
});

test("confirmed dog, cat, and small-animal incompatibilities remove dogs while unknown stays eligible", () => {
  const answers = { age_preference: ["adult"], pets_in_home: ["dogs", "cats"] };
  const negative = { name: "Confirmed no", good_with_dogs: false, good_with_cats: false };
  const [unknown] = computeRankedMatches([{ name: "Unknown" }], answers);
  assert.deepEqual(computeRankedMatches([negative], answers), []);
  assert.deepEqual(getConfirmedIncompatibilities(negative, answers).map(({ code }) => code), [
    "confirmed_dog_incompatibility",
    "confirmed_cat_incompatibility",
  ]);
  assert.equal(unknown.scorePct, null);
  assert.equal(unknown.breakdown.emptyReason, "no_dog_evidence");
  assert.deepEqual(unknown.breakdown.compatibilityCautions, []);

  const smallAnimalAnswers = { age_preference: ["adult"], pets_in_home: ["small_pets"] };
  const smallAnimalConflict = { name: "No small animals", good_with_small_animals: false };
  const legacySmallAnimalConflict = { name: "Legacy no small animals", good_with_small_pets: false };
  assert.deepEqual(computeRankedMatches([smallAnimalConflict], smallAnimalAnswers), []);
  assert.deepEqual(getConfirmedIncompatibilities(smallAnimalConflict, smallAnimalAnswers).map(({ code }) => code), [
    "confirmed_small_animal_incompatibility",
  ]);
  assert.deepEqual(computeRankedMatches([legacySmallAnimalConflict], smallAnimalAnswers), []);
  assert.deepEqual(getConfirmedIncompatibilities(legacySmallAnimalConflict, smallAnimalAnswers).map(({ code }) => code), [
    "confirmed_small_animal_incompatibility",
  ]);
});

test("multi-pet evidence coverage is proportional to documented requested species", () => {
  const answers = {
    age_preference: ["adult"],
    pets_in_home: ["dogs", "cats", "small_pets"],
  };
  const dogs = [
    { name: "One known", age_years: 4, good_with_dogs: true },
    { name: "Two known", age_years: 4, good_with_dogs: true, good_with_cats: true },
    {
      name: "All known",
      age_years: 4,
      good_with_dogs: true,
      good_with_cats: true,
      good_with_small_animals: true,
    },
  ];
  const byName = new Map(
    computeRankedMatches(dogs, answers).map((row) => [row.dog.name, row])
  );

  assert.equal(byName.get("One known").breakdown.evidenceRequestedWeight, 6);
  assert.equal(byName.get("One known").breakdown.evidenceCoveredWeight, 4);
  assert.equal(byName.get("One known").breakdown.evidencePresencePct, 67);
  assert.equal(byName.get("Two known").breakdown.evidenceCoveredWeight, 5);
  assert.equal(byName.get("Two known").breakdown.evidencePresencePct, 83);
  assert.equal(byName.get("All known").breakdown.evidenceCoveredWeight, 6);
  assert.equal(byName.get("All known").breakdown.evidencePresencePct, 100);
  assert.deepEqual(
    ["One known", "Two known", "All known"].map(
      (name) => byName.get(name).breakdown.rawCompatibilityPct
    ),
    [100, 100, 100]
  );
  assert.ok(byName.get("One known").scorePct < byName.get("Two known").scorePct);
  assert.ok(byName.get("Two known").scorePct < byName.get("All known").scorePct);
});

test("unknown multi-pet compatibility remains unknown rather than positive or negative", () => {
  const answers = {
    age_preference: ["adult"],
    pets_in_home: ["dogs", "cats", "small_pets"],
  };
  const [row] = computeRankedMatches([{ name: "Unknown pets" }], answers);

  assert.equal(row.scorePct, null);
  assert.equal(row.breakdown.evidenceRequestedWeight, 6);
  assert.equal(row.breakdown.evidenceCoveredWeight, 0);
  assert.equal(row.breakdown.emptyReason, "no_dog_evidence");
  assert.deepEqual(row.breakdown.contributions, []);
  assert.deepEqual(row.breakdown.compatibilityCautions, []);
});

test("AI estimates neither override contradictory confirmed facts nor create exclusions", () => {
  const answers = { size_preference: ["flexible"], pets_in_home: ["cats"] };
  const confirmedNoAiYes = {
    name: "Confirmed no",
    good_with_cats: false,
    bio_good_with_cats: "yes",
    ai_traits: { good_with_cats: aiTrait("true", 1, "bio_explicit") },
  };
  const confirmedYesAiNo = {
    name: "Confirmed yes",
    good_with_cats: true,
    bio_good_with_cats: "no",
    ai_traits: { good_with_cats: aiTrait("false", 1, "bio_explicit") },
  };
  const aiOnlyNo = {
    name: "AI only no",
    bio_good_with_cats: "no",
    ai_traits: { good_with_cats: aiTrait("false", 1, "bio_explicit") },
  };

  assert.deepEqual(computeRankedMatches([confirmedNoAiYes], answers), []);
  assert.deepEqual(computeRankedMatches([confirmedYesAiNo], answers).map((row) => row.dog.name), ["Confirmed yes"]);
  assert.deepEqual(computeRankedMatches([aiOnlyNo], answers).map((row) => row.dog.name), ["AI only no"]);
});

test("confirmed compatible dogs remain eligible", () => {
  const dog = {
    name: "Confirmed compatible",
    good_with_kids: true,
    good_with_dogs: true,
    good_with_cats: true,
    good_with_small_animals: true,
    yard_required: false,
  };
  const answers = {
    size_preference: ["flexible"],
    kids_in_home: ["under_3"],
    pets_in_home: ["dogs", "cats", "small_pets"],
    yard: "no",
  };
  assert.deepEqual(getConfirmedIncompatibilities(dog, answers), []);
  assert.deepEqual(computeRankedMatches([dog], answers).map((row) => row.dog.name), ["Confirmed compatible"]);
});

test("unknown child-age evidence preserves independent pet and potty safety behavior", () => {
  const petCases = [
    ["dogs", "good_with_dogs"],
    ["cats", "good_with_cats"],
    ["small_pets", "good_with_small_animals"],
  ];

  for (const [petAnswer, petField] of petCases) {
    const answers = {
      age_preference: ["adult"],
      kids_in_home: ["under_3", "13_plus"],
      pets_in_home: [petAnswer],
      potty_requirement: "must_be_trained",
    };
    const compatible = {
      name: `${petAnswer} compatible`,
      age_years: 4,
      good_with_kids: true,
      [petField]: true,
      potty_trained: true,
    };
    const [row] = computeRankedMatches([compatible], answers);

    assert.equal(row.dog.name, compatible.name, petAnswer);
    assert.equal(
      row.breakdown.contributions.some(({ questionId }) => questionId === "kids_in_home"),
      false,
      petAnswer
    );
    assert.deepEqual(
      row.breakdown.contributions.map(({ questionId }) => questionId),
      ["age_preference", "pets_in_home", "potty_requirement"],
      petAnswer
    );

    const incompatible = { ...compatible, [petField]: false };
    assert.deepEqual(computeRankedMatches([incompatible], answers), [], petAnswer);
    assert.equal(getConfirmedIncompatibilities(incompatible, answers).length, 1, petAnswer);
  }
});

test("unrelated preference mismatches remain scored instead of excluded", () => {
  const dog = { name: "Large active dog", size: "Large", energy_level: "High" };
  const answers = { size_preference: ["small"], energy_preference: "low" };
  const [result] = computeRankedMatches([dog], answers);
  assert.equal(result.dog.name, "Large active dog");
  assert.equal(getConfirmedIncompatibilities(dog, answers).length, 0);
  assert.equal(result.breakdown.tradeoffContributions.length, 2);
  assert.ok(result.scorePct < 50);
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
  const answers = { size_preference: ["small"], energy_preference: "low" };
  const dogs = [
    { name: "Structured", size: "Small", energy_level: "Low" },
    { name: "Bio explicit", size: "Small", bio_energy_level: "low", ai_traits: { energy_level: aiTrait("low", 1, "bio_explicit") } },
    { name: "Profile", size: "Small", bio_energy_level: "low", ai_traits: { energy_level: aiTrait("low", 1, "profile_inference") } },
  ];
  const byName = new Map(computeRankedMatches(dogs, answers).map((row) => [row.dog.name, row]));
  assert.equal(byName.get("Structured").scorePct, 100);
  assert.ok(byName.get("Structured").scorePct > byName.get("Bio explicit").scorePct);
  assert.ok(byName.get("Bio explicit").scorePct > byName.get("Profile").scorePct);
  const energyStrength = (name) => byName.get(name).breakdown.contributions
    .find(({ questionId }) => questionId === "energy_preference")
    .evidenceStrength;
  assert.deepEqual(
    ["Structured", "Bio explicit", "Profile"].map(energyStrength),
    [1, 0.65, 0.25]
  );
});

test("shedding evidence keeps source, bio, breed-coat, and general inference tiers distinct", () => {
  const answers = { size_preference: ["flexible"], shedding_preference: "minimal" };
  const dogs = [
    { name: "Structured", shedding_level: "low" },
    { name: "Bio", bio_shedding_level: "low", ai_traits: { shedding_level: aiTrait("low", 1, "bio_explicit") } },
    { name: "Breed coat", bio_shedding_level: "low", ai_traits: { shedding_level: aiTrait("low", 1, "breed_coat_inference") } },
    { name: "Profile", bio_shedding_level: "low", ai_traits: { shedding_level: aiTrait("low", 1, "profile_inference") } },
  ];
  const byName = new Map(computeRankedMatches(dogs, answers).map((row) => [row.dog.name, row]));
  assert.deepEqual(
    ["Structured", "Bio", "Breed coat", "Profile"].map((name) => byName.get(name).breakdown.evidenceQualityPct),
    [100, 65, 50, 25]
  );
});

test("allergy matching uses low-shedding estimates without claiming hypoallergenic certainty", () => {
  const answers = { size_preference: ["flexible"], allergy_sensitivity: "have_allergies" };
  const [estimated] = computeRankedMatches([{
    name: "Estimated low shedding",
    bio_shedding_level: "low",
    ai_traits: { shedding_level: aiTrait("low", 0.82, "breed_coat_inference") },
  }], answers);
  const allergy = estimated.breakdown.contributions.find((entry) => entry.questionId === "allergy_sensitivity");
  assert.equal(allergy.source, "breed_coat_inference");
  assert.ok(allergy.adjustedCompatibility > 0.5);
  assert.ok(allergy.adjustedCompatibility < 0.9);
  assert.match(allergy.explanation, /not a medical guarantee/i);
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

test("one active preference plus one flexible answer cannot unlock a fit score", () => {
  const [result] = computeRankedMatches(
    [{ name: "Small adult", size: "Small", age_years: 4 }],
    { size_preference: ["small"], age_preference: ["flexible"] }
  );

  assert.equal(result.scorePct, null);
  assert.equal(result.breakdown.answeredCount, 1);
  assert.deepEqual(result.breakdown.activePreferenceIds, ["size_preference"]);
  assert.deepEqual(result.breakdown.activePreferenceLabels, ["size"]);
  assert.equal(result.breakdown.enoughQuizInfo, false);
  assert.equal(result.breakdown.emptyReason, "too_few_quiz_answers");
});

test("two genuinely active preferences remain eligible for a fit score", () => {
  const [result] = computeRankedMatches(
    [{ name: "Small adult", size: "Small", age_years: 4 }],
    { size_preference: ["small"], age_preference: ["adult"] }
  );

  assert.equal(result.scorePct, 100);
  assert.equal(result.breakdown.answeredCount, 2);
  assert.deepEqual(result.breakdown.activePreferenceIds, ["size_preference", "age_preference"]);
  assert.deepEqual(result.breakdown.activePreferenceLabels, ["size", "age"]);
  assert.equal(result.breakdown.enoughQuizInfo, true);
});

test("no active preferences remain scoreless even when neutral answers are complete", () => {
  const [result] = computeRankedMatches(
    [{ name: "Small adult", size: "Small", age_years: 4 }],
    { size_preference: ["flexible"], age_preference: ["flexible"] }
  );

  assert.equal(result.scorePct, null);
  assert.equal(result.breakdown.answeredCount, 0);
  assert.equal(result.breakdown.enoughQuizInfo, false);
  assert.equal(result.breakdown.emptyReason, "too_few_quiz_answers");
});

test("two active preferences allow a limited score when dog evidence is sparse", () => {
  const [result] = computeRankedMatches(
    [{ name: "Sparse", size: "Small" }],
    { size_preference: ["small"], age_preference: ["adult"] }
  );

  assert.equal(result.scorePct, 80);
  assert.equal(result.breakdown.rawCompatibilityPct, 100);
  assert.equal(result.breakdown.evidencePresencePct, 50);
  assert.equal(result.breakdown.limitedInformation, true);
});

test("AI behavioral negatives never create hard exclusions", () => {
  const answers = { age_preference: ["adult"], kids_in_home: ["under_3"] };
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

test("confirmed kids, dogs, cats, and small animals are centralized exclusions", () => {
  const answers = {
    size_preference: ["flexible"],
    kids_in_home: ["under_3"],
    pets_in_home: ["dogs", "cats", "small_pets"],
    yard: "no",
  };
  const dog = {
    name: "Confirmed conflicts",
    good_with_kids: false,
    good_with_dogs: false,
    good_with_cats: false,
    good_with_small_animals: false,
    yard_required: true,
    fence_needs: "3 foot",
  };
  assert.deepEqual(computeRankedMatches([dog], answers), []);
  assert.deepEqual(getConfirmedIncompatibilities(dog, answers).map(({ code }) => code), [
    "confirmed_child_incompatibility",
    "confirmed_dog_incompatibility",
    "confirmed_cat_incompatibility",
    "confirmed_small_animal_incompatibility",
  ]);
});

test("yard and fence requirements caution and score but never hard-exclude", () => {
  const answers = { size_preference: ["small"], yard: "no" };
  for (const dog of [
    { name: "Yard required", size: "Small", yard_required: true },
    { name: "Fence required", size: "Small", fence_needs: "6 foot" },
  ]) {
    assert.deepEqual(getConfirmedIncompatibilities(dog, answers), []);
    const [result] = computeRankedMatches([dog], answers);
    assert.equal(result.dog.name, dog.name);
    assert.ok(result.scorePct <= 49);
    assert.equal(result.breakdown.compatibilityCautions.length, 1);
    const yardContribution = result.breakdown.contributions.find(({ questionId }) => questionId === "yard");
    assert.equal(yardContribution.rawCompatibility, 0);
    assert.equal(yardContribution.source, "structured");
  }
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
  assert.match(hoursOnly.breakdown.contributions[0].explanation, /fits your weekday routine/);

  const [insufficientHours] = computeRankedMatches([{ name: "Insufficient hours", max_alone_hours: 2 }], answers);
  assert.match(insufficientHours.breakdown.contributions[0].explanation, /may not fit your weekday routine/);

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

test("low-compatibility tradeoffs never use misleading positive wording", () => {
  const cases = [
    {
      questionId: "dog_social_preference",
      answers: { dog_social_preference: "very_dog_friendly" },
      dog: { only_dog: true },
      expected: "Shelter-listed social style may not fit your preference around other dogs",
    },
    {
      questionId: "separation_anxiety_willingness",
      answers: { separation_anxiety_willingness: "no" },
      dog: { separation_anxiety: true },
      expected: "Shelter-listed separation-anxiety information may not fit your stated limit",
    },
    {
      questionId: "training_commitment_level",
      answers: { training_commitment_level: "low" },
      dog: { obedience_training: "needs training" },
      expected: "Shelter-listed training level may not fit your available training commitment",
    },
    {
      questionId: "daily_walk_minutes",
      answers: { daily_walk_minutes: "0_15" },
      dog: { exercise_needs: "High" },
      expected: "Shelter-listed exercise level may not fit your daily walking capacity",
    },
    {
      questionId: "energy_preference",
      answers: { energy_preference: "low" },
      dog: { energy_level: "High" },
      expected: "Shelter-listed energy level may not fit your preference",
    },
    {
      questionId: "shedding_preference",
      answers: { shedding_preference: "minimal" },
      dog: { shedding_level: "High" },
      expected: "Shelter-listed shedding level may not fit your preference",
    },
  ];

  for (const { questionId, answers, dog, expected } of cases) {
    const [result] = computeRankedMatches(
      [{ name: questionId, size: "Small", ...dog }],
      { size_preference: ["small"], ...answers }
    );
    const contribution = result.breakdown.contributions.find(
      (entry) => entry.questionId === questionId
    );
    assert.equal(contribution.positive, false);
    assert.equal(contribution.explanation, expected);
  }
});

test("estimated tradeoffs remain uncertain rather than becoming shelter restrictions", () => {
  const [result] = computeRankedMatches(
    [{
      name: "Estimated training",
      size: "Small",
      bio_training_needs: "high",
      ai_traits: {
        training_needs: aiTrait("high", 1, "profile_inference"),
      },
    }],
    {
      size_preference: ["small"],
      training_commitment_level: "low",
    }
  );
  const contribution = result.breakdown.contributions.find(
    (entry) => entry.questionId === "training_commitment_level"
  );
  assert.equal(contribution.source, "profile_inference");
  assert.equal(contribution.positive, false);
  assert.equal(
    contribution.explanation,
    "Estimated training needs may not fit your available training commitment"
  );
});

test("positive structured compatibility retains supportive wording", () => {
  const cases = [
    {
      questionId: "dog_social_preference",
      answers: { dog_social_preference: "very_dog_friendly" },
      dog: { dog_social_style: "highly social" },
      expected: "Shelter-listed social style fits your preference around other dogs",
    },
    {
      questionId: "separation_anxiety_willingness",
      answers: { separation_anxiety_willingness: "no" },
      dog: { separation_anxiety: false },
      expected: "Shelter-listed separation-anxiety information fits your stated limit",
    },
    {
      questionId: "training_commitment_level",
      answers: { training_commitment_level: "low" },
      dog: { obedience_training: "well trained" },
      expected: "Shelter-listed training level fits your available training commitment",
    },
    {
      questionId: "daily_walk_minutes",
      answers: { daily_walk_minutes: "0_15" },
      dog: { exercise_needs: "Low" },
      expected: "Shelter-listed exercise level fits your daily walking capacity",
    },
    {
      questionId: "energy_preference",
      answers: { energy_preference: "low" },
      dog: { energy_level: "Low" },
      expected: "Shelter-listed energy level fits your preference",
    },
    {
      questionId: "shedding_preference",
      answers: { shedding_preference: "minimal" },
      dog: { shedding_level: "Low" },
      expected: "Shelter-listed shedding level fits your preference",
    },
  ];

  for (const { questionId, answers, dog, expected } of cases) {
    const [result] = computeRankedMatches(
      [{ name: questionId, size: "Small", ...dog }],
      { size_preference: ["small"], ...answers }
    );
    const contribution = result.breakdown.contributions.find(
      (entry) => entry.questionId === questionId
    );
    assert.equal(contribution.positive, true);
    assert.equal(contribution.explanation, expected);
  }
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
