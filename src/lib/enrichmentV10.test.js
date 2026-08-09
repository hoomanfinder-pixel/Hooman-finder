import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  AI_ENRICHMENT_VERSION,
  ENRICHMENT_DOG_SELECT,
  asDogInput,
  buildBioColumns,
  hasMeaningfulChange,
  normalizeAiTraits,
} = require("../../scripts/enrich-dogs-ai.cjs");

function trait(value = "unknown", confidence = 0, evidence = "", evidenceBasis = "profile_inference") {
  return { value, confidence, evidence, evidence_basis: evidenceBasis };
}

function baseParsedTraits(overrides = {}) {
  return {
    energy_level: trait(),
    shedding_level: trait(),
    barking_level: trait(),
    grooming_level: trait(),
    good_with_kids: trait(),
    good_with_dogs: trait(),
    good_with_cats: trait(),
    good_with_small_animals: trait(),
    potty_trained: trait(),
    crate_trained: trait(),
    leash_trained: trait(),
    first_time_friendly: trait(),
    apartment_friendly: trait(),
    needs_yard: trait(),
    can_be_left_alone: trait(),
    max_alone_hours_estimate: trait(null),
    exercise_needs: trait(),
    training_needs: trait(),
    home_environment: trait(),
    affection_level: trait(),
    playfulness: trait(),
    shyness: trait(),
    anxiety_or_fear: trait(),
    ideal_home_summary: "",
    match_tags: [],
    caution_notes: [],
    overall_confidence: 0.7,
    needs_human_review: false,
    ...overrides,
  };
}

function dogInput(overrides = {}) {
  return asDogInput({
    id: "test-dog",
    name: "Test Dog",
    breed: "Mixed Breed",
    age_years: 4,
    age_text: "4 Years",
    size: "Medium",
    description: "A dog-specific adoption biography with enough detail for testing.",
    ...overrides,
  });
}

test("version-only and provenance-only enrichment changes are meaningful", () => {
  const aiTraits = normalizeAiTraits(baseParsedTraits(), dogInput());
  const bioColumns = buildBioColumns(aiTraits, null);
  const next = {
    bioColumns,
    aiTraits,
    enrichmentVersion: AI_ENRICHMENT_VERSION,
    aiConfidenceScore: aiTraits.overall_confidence,
    needsHumanReview: aiTraits.needs_human_review,
    enrichedSourceHash: "same-hash",
  };
  const currentDog = {
    ...bioColumns,
    ai_traits: JSON.parse(JSON.stringify(aiTraits)),
    ai_enrichment_version: AI_ENRICHMENT_VERSION,
    ai_confidence_score: aiTraits.overall_confidence,
    needs_human_review: aiTraits.needs_human_review,
    source_content_hash: "same-hash",
    ai_enriched_source_hash: "same-hash",
  };

  // Run timestamps do not make an otherwise identical result rewrite.
  currentDog.ai_traits.source.enriched_at = "2020-01-01T00:00:00.000Z";
  currentDog.bio_traits_updated_at = "2020-01-01T00:00:00.000Z";
  assert.equal(hasMeaningfulChange(next, currentDog), false);

  assert.equal(
    hasMeaningfulChange(next, { ...currentDog, ai_enrichment_version: "dog-ai-traits-v9" }),
    true
  );

  const changedProvenance = JSON.parse(JSON.stringify(currentDog));
  changedProvenance.ai_traits.energy_level.evidence_basis = "bio_explicit";
  assert.equal(hasMeaningfulChange(next, changedProvenance), true);
});

test("confirmed source fields are passed through and override conflicting AI interpretations", () => {
  for (const field of [
    "yard_required",
    "fence_needs",
    "exercise_needs",
    "obedience_training",
    "owner_experience",
    "ai_confidence_score",
    "bio_traits_source",
  ]) {
    assert.match(ENRICHMENT_DOG_SELECT, new RegExp(`\\b${field}\\b`));
  }

  const input = dogInput({
    good_with_cats: false,
    yard_required: true,
    fence_needs: "3 foot",
    exercise_needs: "High",
    obedience_training: "Needs Training",
    owner_experience: "Experienced owner required",
    barking_level: "Quiet",
    grooming_level: "low",
  });

  assert.equal(input.current_yard_required, true);
  assert.equal(input.current_fence_needs, "3 foot");
  assert.equal(input.current_exercise_needs, "High");
  assert.equal(input.current_obedience_training, "Needs Training");
  assert.equal(input.current_owner_experience, "Experienced owner required");
  assert.equal(input.current_good_with_cats, false);

  const normalized = normalizeAiTraits(
    baseParsedTraits({
      barking_level: trait("some", 0.9, "Bio says vocal.", "bio_explicit"),
      grooming_level: trait("high", 0.9, "Bio says high grooming.", "bio_explicit"),
      exercise_needs: trait("low", 0.9, "Model guess.", "profile_inference"),
      training_needs: trait("low", 0.9, "Model guess.", "profile_inference"),
      first_time_friendly: trait("true", 0.9, "Model guess.", "profile_inference"),
      needs_yard: trait("false", 0.9, "Model guess.", "profile_inference"),
    }),
    input
  );

  assert.deepEqual(
    {
      exercise: normalized.exercise_needs.value,
      training: normalized.training_needs.value,
      barking: normalized.barking_level.value,
      grooming: normalized.grooming_level.value,
      yard: normalized.needs_yard.value,
      firstTime: normalized.first_time_friendly.value,
      cats: normalized.good_with_cats.value,
    },
    {
      exercise: "high",
      training: "medium_high",
      barking: "quiet",
      grooming: "low",
      yard: "true",
      firstTime: "false",
      cats: "false",
    }
  );
});

test("direct training barking grooming and small-animal bio evidence stays bio_explicit", () => {
  const input = dogInput({
    description:
      "Needs training, is very vocal, requires professional grooming, and has lived safely with rabbits.",
  });
  const normalized = normalizeAiTraits(
    baseParsedTraits({
      good_with_small_animals: trait(
        "true",
        0.88,
        "Bio says this dog lived safely with rabbits.",
        "bio_explicit"
      ),
    }),
    input
  );

  assert.equal(normalized.training_needs.evidence_basis, "bio_explicit");
  assert.equal(normalized.barking_level.evidence_basis, "bio_explicit");
  assert.equal(normalized.grooming_level.evidence_basis, "bio_explicit");
  assert.equal(normalized.good_with_small_animals.evidence_basis, "bio_explicit");
  assert.equal(normalized.good_with_small_animals.value, "true");
});

test("profile-derived lifestyle estimates remain profile_inference", () => {
  const normalized = normalizeAiTraits(
    baseParsedTraits(),
    dogInput({
      breed: "Siberian Husky",
      description: "Friendly companion looking for a home.",
    })
  );

  assert.equal(normalized.energy_level.evidence_basis, "profile_inference");
  assert.equal(normalized.exercise_needs.evidence_basis, "profile_inference");
  assert.equal(normalized.training_needs.evidence_basis, "profile_inference");
  assert.equal(normalized.grooming_level.evidence_basis, "profile_inference");
});

test("unsupported safety-sensitive compatibility claims remain unknown", () => {
  const unsupported = trait(
    "true",
    0.9,
    "A generic profile guess without dog-specific evidence.",
    "bio_explicit"
  );
  const normalized = normalizeAiTraits(
    baseParsedTraits({
      good_with_kids: unsupported,
      good_with_dogs: unsupported,
      good_with_cats: unsupported,
      good_with_small_animals: unsupported,
    }),
    dogInput({ description: "Friendly young mixed-breed dog." })
  );

  assert.equal(normalized.good_with_kids.value, "unknown");
  assert.equal(normalized.good_with_dogs.value, "unknown");
  assert.equal(normalized.good_with_cats.value, "unknown");
  assert.equal(normalized.good_with_small_animals.value, "unknown");

  const unsupportedNegative = normalizeAiTraits(
    baseParsedTraits({
      good_with_cats: trait("false", 0.9, "AI claims no cats.", "bio_explicit"),
    }),
    dogInput({ description: "Friendly young mixed-breed dog." })
  );
  assert.equal(unsupportedNegative.good_with_cats.value, "unknown");
});
