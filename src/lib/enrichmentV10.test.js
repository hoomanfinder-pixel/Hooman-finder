import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  AI_ENRICHMENT_VERSION,
  ENRICHMENT_DOG_SELECT,
  asDogInput,
  buildBioColumns,
  getEnrichmentEligibilityReason,
  hasMeaningfulChange,
  isPubliclyVisibleDog,
  mergeExistingBioColumns,
  normalizeAiTraits,
  parseBoundedPositiveInteger,
} = require("../../scripts/enrich-dogs-ai.cjs");
const {
  HASHED_FIELDS,
  computeSourceContentHash,
} = require("../../scripts/dog-enrichment-hash.cjs");

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

test("each newly covered structured enrichment input changes the source-content hash", () => {
  const baseline = {
    name: "Test Dog",
    description: "Friendly companion looking for a home.",
  };
  const baselineHash = computeSourceContentHash(baseline);
  const structuredInputs = {
    yard_required: false,
    fence_needs: "Six-foot fence required",
    exercise_needs: "High",
    obedience_training: "Needs Training",
    owner_experience: "Experienced owner required",
  };

  for (const [field, value] of Object.entries(structuredInputs)) {
    assert.ok(HASHED_FIELDS.includes(field), `${field} must be part of the hash contract`);
    assert.notEqual(
      computeSourceContentHash({ ...baseline, [field]: value }),
      baselineHash,
      `${field} must change the source-content hash`
    );
  }
});

test("fields outside model evidence do not change the source-content hash", () => {
  const baseline = {
    name: "Test Dog",
    description: "Friendly companion looking for a home.",
    breed: "Mixed Breed",
  };
  const irrelevantChanges = {
    photo_url: "https://example.com/dog.jpg",
    photo_urls: ["https://example.com/dog.jpg"],
    source_updated_at: "2026-08-09T00:00:00.000Z",
    last_checked_at: "2026-08-09T01:00:00.000Z",
    shelter_website: "https://example.com/shelter",
    adoption_url: "https://example.com/adopt",
    placement_city: "Detroit",
  };

  assert.equal(
    computeSourceContentHash({ ...baseline, ...irrelevantChanges }),
    computeSourceContentHash(baseline)
  );
});

test("a current-version enriched dog becomes eligible when a structured source input changes", () => {
  const sourceDog = {
    name: "Test Dog",
    description: "Friendly companion looking for a home.",
    owner_experience: "First-time owner friendly",
  };
  const enrichedHash = computeSourceContentHash(sourceDog);
  const changedHash = computeSourceContentHash({
    ...sourceDog,
    owner_experience: "Experienced owner required",
  });

  assert.notEqual(changedHash, enrichedHash);
  assert.equal(
    getEnrichmentEligibilityReason({
      ai_enriched_at: "2026-08-09T00:00:00.000Z",
      ai_enrichment_version: AI_ENRICHMENT_VERSION,
      source_content_hash: changedHash,
      ai_enriched_source_hash: enrichedHash,
    }),
    "content_changed"
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

test("unsupported legacy cat compatibility is cleared when fresh v10 is unknown", () => {
  const freshTraits = normalizeAiTraits(
    baseParsedTraits(),
    dogInput({ description: "Friendly companion looking for a home." })
  );
  const freshColumns = buildBioColumns(freshTraits, null);
  const { merged, carriedForwardFields } = mergeExistingBioColumns(freshColumns, {
    bio_good_with_cats: "no",
  });

  assert.equal(freshTraits.good_with_cats.value, "unknown");
  assert.equal(merged.bio_good_with_cats, "unknown");
  assert.doesNotMatch(carriedForwardFields.join(","), /bio_good_with_cats/);
});

test("unsupported legacy kid and dog compatibility is cleared with no small-animal bio alias carry-forward", () => {
  const freshTraits = normalizeAiTraits(
    baseParsedTraits(),
    dogInput({ description: "Friendly companion looking for a home." })
  );
  const freshColumns = buildBioColumns(freshTraits, null);
  const { merged, carriedForwardFields } = mergeExistingBioColumns(freshColumns, {
    bio_good_with_kids: "no",
    bio_good_with_dogs: "yes",
    bio_good_with_small_animals: "no",
    good_with_small_pets: false,
  });

  assert.equal(merged.bio_good_with_kids, "unknown");
  assert.equal(merged.bio_good_with_dogs, "unknown");
  assert.equal(Object.hasOwn(merged, "bio_good_with_small_animals"), false);
  assert.equal(Object.hasOwn(merged, "good_with_small_pets"), false);
  assert.deepEqual(carriedForwardFields, []);
});

test("confirmed structured compatibility remains matching-facing", () => {
  const input = dogInput({
    description: "Friendly companion looking for a home.",
    good_with_kids: true,
    good_with_dogs: false,
    good_with_cats: true,
  });
  const freshTraits = normalizeAiTraits(baseParsedTraits(), input);
  const freshColumns = buildBioColumns(freshTraits, null);
  const { merged } = mergeExistingBioColumns(freshColumns, {
    bio_good_with_kids: "no",
    bio_good_with_dogs: "yes",
    bio_good_with_cats: "no",
  });

  assert.equal(merged.bio_good_with_kids, "yes");
  assert.equal(merged.bio_good_with_dogs, "no");
  assert.equal(merged.bio_good_with_cats, "yes");
});

test("fresh bio-explicit compatibility remains matching-facing", () => {
  const input = dogInput({
    description: "This dog is good with kids, good with dogs, and good with cats.",
  });
  const freshTraits = normalizeAiTraits(baseParsedTraits(), input);
  const freshColumns = buildBioColumns(freshTraits, null);
  const { merged } = mergeExistingBioColumns(freshColumns, {
    bio_good_with_kids: "no",
    bio_good_with_dogs: "no",
    bio_good_with_cats: "no",
  });

  for (const key of ["good_with_kids", "good_with_dogs", "good_with_cats"]) {
    assert.equal(freshTraits[key].evidence_basis, "bio_explicit");
    assert.equal(freshTraits[key].value, "true");
  }
  assert.equal(merged.bio_good_with_kids, "yes");
  assert.equal(merged.bio_good_with_dogs, "yes");
  assert.equal(merged.bio_good_with_cats, "yes");
});

test("ordinary lifestyle traits retain normal carry-forward behavior", () => {
  const freshTraits = normalizeAiTraits(
    baseParsedTraits(),
    dogInput({ breed: null, size: null, age_years: null, age_text: null, description: "" })
  );
  const freshColumns = buildBioColumns(freshTraits, null);
  const { merged, carriedForwardFields } = mergeExistingBioColumns(freshColumns, {
    bio_energy_level: "high",
    bio_shedding_level: "low",
    bio_grooming_level: "moderate",
    bio_training_needs: "medium_high",
  });

  assert.equal(merged.bio_energy_level, "high");
  assert.equal(merged.bio_shedding_level, "low");
  assert.equal(merged.bio_grooming_level, "moderate");
  assert.equal(merged.bio_training_needs, "medium_high");
  assert.deepEqual(
    carriedForwardFields.sort(),
    ["bio_energy_level", "bio_grooming_level", "bio_shedding_level", "bio_training_needs"].sort()
  );
});

test("daily enrichment eligibility covers new, outdated, and source-changed dogs only", () => {
  const current = {
    ai_enriched_at: "2026-08-09T00:00:00.000Z",
    ai_enrichment_version: AI_ENRICHMENT_VERSION,
    source_content_hash: "same-hash",
    ai_enriched_source_hash: "same-hash",
  };

  assert.equal(getEnrichmentEligibilityReason({ ...current, ai_enriched_at: null }), "new");
  assert.equal(
    getEnrichmentEligibilityReason({ ...current, ai_enrichment_version: "dog-ai-traits-v9" }),
    "version_outdated"
  );
  assert.equal(
    getEnrichmentEligibilityReason({ ...current, source_content_hash: "changed-hash" }),
    "content_changed"
  );
  assert.equal(getEnrichmentEligibilityReason(current), null);
});

test("daily enrichment visibility excludes unavailable and untrusted dogs", () => {
  const visible = {
    id: "visible-dog",
    name: "Visible Dog",
    description: "Available for adoption.",
    adoptable: true,
    adoption_pending: false,
    availability_status: "available",
    urgency_level: "Standard",
    rescuegroups_id: "123",
  };

  assert.equal(isPubliclyVisibleDog(visible), true);
  assert.equal(isPubliclyVisibleDog({ ...visible, adoptable: false }), false);
  assert.equal(isPubliclyVisibleDog({ ...visible, adoption_pending: true }), false);
  assert.equal(isPubliclyVisibleDog({ ...visible, availability_status: "unavailable" }), false);
  assert.equal(isPubliclyVisibleDog({ ...visible, urgency_level: "Adopted" }), false);
  assert.equal(isPubliclyVisibleDog({ ...visible, rescuegroups_id: null }), false);
});

test("daily drain bounds reject unbounded or invalid values", () => {
  assert.equal(
    parseBoundedPositiveInteger("25", 10, { name: "--limit", max: 100 }),
    25
  );
  assert.throws(
    () => parseBoundedPositiveInteger("0", 10, { name: "--limit", max: 100 }),
    /between 1 and 100/
  );
  assert.throws(
    () => parseBoundedPositiveInteger("101", 10, { name: "--limit", max: 100 }),
    /between 1 and 100/
  );
  assert.throws(
    () => parseBoundedPositiveInteger("forever", 10, { name: "--limit", max: 100 }),
    /between 1 and 100/
  );
});
