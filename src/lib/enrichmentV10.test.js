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
  mergeExistingBioColumns,
  normalizeAiTraits,
  normalizeUnknownMetadata,
  parseBoundedPositiveInteger,
} = require("../../scripts/enrich-dogs-ai.cjs");
import { isPubliclyVisibleDog } from "./dogVisibility.js";
const {
  HASHED_FIELDS,
  computeSourceContentHash,
} = require("../../scripts/dog-enrichment-hash.cjs");
const { DACC_RESCUEGROUPS_ORG_ID } = require("../../scripts/rescuegroups-shelter-utils.cjs");

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

test("unknown answers keep review evidence but never retain answer confidence", () => {
  const metadata = normalizeUnknownMetadata({
    value: "unknown",
    confidence: 0.8,
    evidence: "The bio says this dog is playful, but the supplied value is unsupported.",
    evidence_basis: "bio_explicit",
  });
  assert.deepEqual(metadata, {
    value: "unknown",
    confidence: 0,
    evidence: "The bio says this dog is playful, but the supplied value is unsupported.",
    evidence_basis: "bio_explicit",
  });

  const numeric = normalizeUnknownMetadata({
    value: null,
    confidence: 0.9,
    evidence: "No supported hour estimate.",
    evidence_basis: "profile_inference",
  }, { unknown: null });
  assert.equal(numeric.confidence, 0);
  assert.equal(numeric.evidence, "No supported hour estimate.");
});

test("unknown confidence normalization applies to parsed trait fields", () => {
  const normalized = normalizeAiTraits(
    baseParsedTraits({
      playfulness: trait("unknown", 0.8, "Described as playful.", "bio_explicit"),
      barking_level: trait("unknown", 0.75, "Some unclear noise wording.", "bio_explicit"),
      max_alone_hours_estimate: trait(null, 0.9, "No supported duration.", "profile_inference"),
    }),
    dogInput()
  );

  for (const field of ["playfulness", "barking_level", "max_alone_hours_estimate"]) {
    assert.equal(normalized[field].confidence, 0, field);
    assert.ok(normalized[field].evidence.length > 0, field);
  }
  assert.equal(normalized.playfulness.evidence_basis, "bio_explicit");
});

test("general profile context cannot become a usable shedding answer", () => {
  const normalized = normalizeAiTraits(
    baseParsedTraits({
      shedding_level: trait(
        "low",
        0.9,
        "current_grooming_level is low",
        "profile_inference"
      ),
    }),
    dogInput({ breed: null, grooming_level: "low", description: "Friendly companion with an easy care routine." })
  );

  assert.equal(normalized.shedding_level.value, "unknown");
  assert.equal(normalized.shedding_level.confidence, 0);
  assert.equal(normalized.shedding_level.evidence_basis, "profile_inference");
  assert.match(normalized.shedding_level.evidence, /grooming/i);
  assert.equal(normalized.grooming_level.value, "low");
  assert.equal(normalized.grooming_level.evidence_basis, "structured_source");

  const breedSupported = normalizeAiTraits(
    baseParsedTraits({
      shedding_level: trait("low", 0.9, "current_grooming_level is low", "profile_inference"),
    }),
    dogInput({
      breed: "American Pit Bull Terrier / Mixed (short coat)",
      grooming_level: "low",
      description: "Friendly companion with an easy care routine.",
    })
  );
  assert.equal(breedSupported.shedding_level.value, "low");
  assert.equal(breedSupported.shedding_level.confidence, 0.58);
  assert.equal(breedSupported.shedding_level.evidence_basis, "breed_coat_inference");
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

test("alone time stays unknown without direct alone-time evidence", () => {
  for (const description of [
    "A calm senior who is house trained and loves naps.",
    "A crate-trained independent dog with low energy.",
    "An easygoing young dog who settles well in the home.",
  ]) {
    const normalized = normalizeAiTraits(
      baseParsedTraits({
        can_be_left_alone: trait("true", 0.9, "General profile inference."),
        max_alone_hours_estimate: trait(6, 0.9, "General profile inference."),
      }),
      dogInput({ breed: "Shiba Inu", age_years: 9, energy_level: "Low", description })
    );
    assert.equal(normalized.can_be_left_alone.value, "unknown", description);
    assert.equal(normalized.max_alone_hours_estimate.value, null, description);
  }
});

test("direct alone-time statements remain usable", () => {
  const hours = normalizeAiTraits(baseParsedTraits(), dogInput({
    description: "Her foster says she can be left alone for 4 to 6 hours and settles comfortably.",
  }));
  assert.equal(hours.max_alone_hours_estimate.value, 6);
  assert.equal(hours.max_alone_hours_estimate.evidence_basis, "bio_explicit");

  const distress = normalizeAiTraits(baseParsedTraits(), dogInput({
    description: "He panics when left alone and cannot be left alone for long.",
  }));
  assert.equal(distress.can_be_left_alone.value, "false");
  assert.equal(distress.max_alone_hours_estimate.value, 2);
  assert.equal(distress.max_alone_hours_estimate.evidence_basis, "bio_explicit");
});

test("apartment suitability requires direct housing evidence", () => {
  for (const description of [
    "A fenced yard is preferred.",
    "A high-energy large dog who needs room to run.",
    "A proud homebody who does not enjoy walks.",
  ]) {
    const normalized = normalizeAiTraits(
      baseParsedTraits({ apartment_friendly: trait("false", 0.9, "Profile inference.") }),
      dogInput({ breed: "Great Dane", size: "Large", yard_required: true, description })
    );
    assert.equal(normalized.apartment_friendly.value, "unknown", description);
  }

  assert.equal(
    normalizeAiTraits(baseParsedTraits(), dogInput({ description: "She is apartment friendly." })).apartment_friendly.value,
    "true"
  );
  assert.equal(
    normalizeAiTraits(baseParsedTraits(), dogInput({ description: "She requires a house; no apartments." })).apartment_friendly.value,
    "false"
  );
});

test("child compatibility requires child-specific evidence and preserves age restrictions", () => {
  for (const description of [
    "Gentle with everyone.",
    "A sweet, friendly and loving family dog.",
  ]) {
    const normalized = normalizeAiTraits(
      baseParsedTraits({ good_with_kids: trait("likely", 0.9, "Generic temperament.") }),
      dogInput({ description })
    );
    assert.equal(normalized.good_with_kids.value, "unknown", description);
  }

  for (const description of [
    "Older children only.",
    "Older children or no children.",
    "No young children.",
    "Teenagers only.",
  ]) {
    const normalized = normalizeAiTraits(
      baseParsedTraits({ good_with_kids: trait("false", 0.9, "Collapsed age restriction.", "bio_explicit") }),
      dogInput({ description })
    );
    assert.equal(normalized.good_with_kids.value, "older_children_only", description);
    assert.equal(normalized.good_with_kids.evidence_basis, "bio_explicit", description);
    assert.equal(buildBioColumns(normalized, null).bio_good_with_kids, "older_children_only", description);
  }

  const untested = normalizeAiTraits(
    baseParsedTraits({ good_with_kids: trait("likely", 0.8, "Children were mentioned.") }),
    dogInput({ description: "She has not been tested with children." })
  );
  assert.equal(untested.good_with_kids.value, "unknown");
});

test("conditional household compatibility survives AI normalization as nuanced soft states", () => {
  const cases = [
    ["good_with_dogs", "bio_good_with_dogs", "She is dog selective.", "selective"],
    ["good_with_dogs", "bio_good_with_dogs", "Slow introductions are required with other dogs.", "selective"],
    ["good_with_dogs", "bio_good_with_dogs", "She could live with a compatible low-energy dog.", "selective"],
    ["good_with_dogs", "bio_good_with_dogs", "Best as the only dog, but she has lived with dogs.", "only_dog"],
    ["good_with_dogs", "bio_good_with_dogs", "She may do well with another dog.", "may_do_well"],
    ["good_with_cats", "bio_good_with_cats", "Unknown with cats, but may do well after slow introductions.", "may_do_well"],
    ["good_with_cats", "bio_good_with_cats", "She may live with dog-savvy cats after proper introductions.", "may_do_well"],
    ["good_with_kids", "bio_good_with_kids", "Older children only.", "older_children_only"],
    ["good_with_kids", "bio_good_with_kids", "Older children or no children.", "older_children_only"],
    ["good_with_kids", "bio_good_with_kids", "She may do well with respectful children.", "may_do_well"],
  ];

  for (const [traitKey, columnKey, description, expected] of cases) {
    const normalized = normalizeAiTraits(
      baseParsedTraits({ [traitKey]: trait(expected === "only_dog" ? "false" : "true", 0.95, "Collapsed model result.", "bio_explicit") }),
      dogInput({ description })
    );
    assert.equal(normalized[traitKey].value, expected, description);
    assert.equal(normalized[traitKey].evidence_basis, "bio_explicit", description);
    assert.equal(buildBioColumns(normalized, null)[columnKey], expected, description);
  }
});

test("explicit household restrictions are preserved as bio-explicit compatibility", () => {
  const cases = [
    ["good_with_cats", "bio_good_with_cats", "This dog needs a cat-free home.", "false", "no"],
    ["good_with_cats", "bio_good_with_cats", "Cats are not recommended for this dog.", "false", "no"],
    ["good_with_dogs", "bio_good_with_dogs", "He must be the only dog in the home.", "only_dog", "only_dog"],
    ["good_with_dogs", "bio_good_with_dogs", "She is dog selective and needs slow introductions.", "selective", "selective"],
    ["good_with_kids", "bio_good_with_kids", "No children in the home.", "false", "no"],
    ["good_with_kids", "bio_good_with_kids", "Kids 12+ only.", "older_children_only", "older_children_only"],
  ];

  for (const [traitKey, columnKey, description, expectedTrait, expectedColumn] of cases) {
    const normalized = normalizeAiTraits(baseParsedTraits(), dogInput({ description }));
    assert.equal(normalized[traitKey].value, expectedTrait, description);
    assert.equal(normalized[traitKey].evidence_basis, "bio_explicit", description);
    assert.equal(buildBioColumns(normalized, null)[columnKey], expectedColumn, description);
  }

  for (const description of [
    "Cats walked past the kennel once.",
    "This hound may have prey drive typical of the breed.",
    "Friendly dog looking for a home.",
  ]) {
    assert.equal(
      normalizeAiTraits(baseParsedTraits(), dogInput({ description })).good_with_cats.value,
      "unknown",
      description
    );
  }
});

test("playfulness requires direct play language and remains unknown for generic energy or friendliness", () => {
  for (const description of [
    "She is playful with people and dogs.",
    "He loves toys and loves to play.",
    "She enjoys fetch and tug.",
    "His playful personality comes out once comfortable.",
  ]) {
    const normalized = normalizeAiTraits(baseParsedTraits(), dogInput({ description }));
    assert.equal(normalized.playfulness.value, "true", description);
    assert.equal(normalized.playfulness.evidence_basis, "bio_explicit", description);
    assert.ok(normalized.playfulness.confidence > 0, description);
  }

  for (const description of [
    "A sweet and friendly companion.",
    "A high-energy young dog who needs long walks.",
    "A six-month-old puppy looking for a home.",
  ]) {
    const normalized = normalizeAiTraits(baseParsedTraits(), dogInput({ description }));
    assert.equal(normalized.playfulness.value, "unknown", description);
    assert.equal(normalized.playfulness.confidence, 0, description);
  }
});

test("potty training requires potty, house-training, or accident-specific evidence", () => {
  const cases = [
    ["Crate trained and sleeps quietly in her crate.", "unknown", "true"],
    ["Fully house trained with no accidents.", "true", "unknown"],
    ["House trained and crate trained.", "true", "true"],
    ["Working on training and learning basic commands.", "unknown", "unknown"],
    ["A young puppy who will need training.", "unknown", "unknown"],
    ["Working on potty training and making progress.", "maybe", "unknown"],
    ["Mostly house trained with occasional accidents.", "likely", "unknown"],
  ];

  for (const [description, expectedPotty, expectedCrate] of cases) {
    const normalized = normalizeAiTraits(
      baseParsedTraits({
        potty_trained: trait("maybe", 0.7, "Model inferred training progress.", "bio_explicit"),
      }),
      dogInput({ description })
    );
    assert.equal(normalized.potty_trained.value, expectedPotty, description);
    assert.equal(normalized.crate_trained.value, expectedCrate, description);
  }
});

test("Abby's selective compatible-dog wording is not collapsed to false", () => {
  const description = "While she is dog selective and takes time to warm up to new canine friends (she prefers low-energy dogs), she can do well in a home with a patient introduction process—or as the only dog.";
  const normalized = normalizeAiTraits(
    baseParsedTraits({ good_with_dogs: trait("false", 0.9, "Bio clearly indicates the dog should not live with other dogs.", "bio_explicit") }),
    dogInput({ description })
  );
  assert.equal(normalized.good_with_dogs.value, "selective");
  assert.equal(buildBioColumns(normalized, null).bio_good_with_dogs, "selective");
});

test("real conditional dog biographies preserve only-dog versus compatible alternatives", () => {
  const cases = [
    ["He would be best as the only dog, at least until training is complete.", "only_dog"],
    ["She should be the only dog in the house.", "only_dog"],
    ["He loves to play with other dogs, but prefers to be the only dog to live with you.", "only_dog"],
    ["He can be the only dog, or share with another small mature respectful dog.", "selective"],
    ["She would ideally prefer to be an only dog, but could share with the right canine companion.", "selective"],
    ["She would do best as the only pet, though with slow introductions she can live with another dog.", "selective"],
  ];

  for (const [description, expected] of cases) {
    const normalized = normalizeAiTraits(
      baseParsedTraits({ good_with_dogs: trait("false", 0.9, "Collapsed model result.", "bio_explicit") }),
      dogInput({ description })
    );
    assert.equal(normalized.good_with_dogs.value, expected, description);
    assert.equal(buildBioColumns(normalized, null).bio_good_with_dogs, expected, description);
  }
});

test("contradictory positive cat behavior and cat-housing exclusion remains unknown", () => {
  const description = "Cats: Good with cats, but he is allergic to them. Cats are a hard pass to keep him healthy.";
  const normalized = normalizeAiTraits(
    baseParsedTraits({ good_with_cats: trait("true", 0.95, "Good with cats.", "bio_explicit") }),
    dogInput({ description })
  );
  assert.equal(normalized.good_with_cats.value, "unknown");
  assert.equal(normalized.needs_human_review, true);
  assert.equal(buildBioColumns(normalized, null).bio_good_with_cats, "unknown");
});

test("structured compatibility still outranks conditional biography wording", () => {
  const normalized = normalizeAiTraits(
    baseParsedTraits({ good_with_dogs: trait("selective", 0.86, "Dog selective.", "bio_explicit") }),
    dogInput({ good_with_dogs: true, description: "Dog selective; slow introductions are required." })
  );
  assert.equal(normalized.good_with_dogs.value, "true");
  assert.equal(normalized.good_with_dogs.evidence_basis, "structured_source");
  assert.equal(buildBioColumns(normalized, null).bio_good_with_dogs, "yes");
});

test("first-time-owner suitability requires explicit wording", () => {
  for (const description of [
    "A friendly, trained and calm dog.",
    "An easygoing low-maintenance senior.",
    "A sweet young family dog.",
  ]) {
    const normalized = normalizeAiTraits(
      baseParsedTraits({ first_time_friendly: trait("likely", 0.9, "Broad profile synthesis.") }),
      dogInput({ description })
    );
    assert.equal(normalized.first_time_friendly.value, "unknown", description);
  }

  assert.equal(
    normalizeAiTraits(baseParsedTraits(), dogInput({ description: "A great first dog for a first-time owner." })).first_time_friendly.value,
    "true"
  );
  assert.equal(
    normalizeAiTraits(baseParsedTraits(), dogInput({ description: "Needs an experienced owner; not for a first-time owner." })).first_time_friendly.value,
    "false"
  );
});

test("breed cannot support protected lifestyle or compatibility traits", () => {
  const normalized = normalizeAiTraits(
    baseParsedTraits({
      max_alone_hours_estimate: trait(6, 0.8, "Independent breed."),
      apartment_friendly: trait("false", 0.8, "Large breed."),
      good_with_kids: trait("true", 0.8, "Family breed."),
      good_with_dogs: trait("true", 0.8, "Social breed."),
      good_with_cats: trait("false", 0.8, "Prey-drive breed."),
      good_with_small_animals: trait("false", 0.8, "Prey-drive breed."),
      first_time_friendly: trait("true", 0.8, "Beginner breed."),
    }),
    dogInput({ breed: "Shiba Inu", description: "A beautiful dog looking for a home." })
  );

  assert.equal(normalized.max_alone_hours_estimate.value, null);
  assert.equal(normalized.apartment_friendly.value, "unknown");
  assert.equal(normalized.good_with_kids.value, "unknown");
  assert.equal(normalized.good_with_dogs.value, "unknown");
  assert.equal(normalized.good_with_cats.value, "unknown");
  assert.equal(normalized.good_with_small_animals.value, "unknown");
  assert.equal(normalized.first_time_friendly.value, "unknown");
});

test("mirrored structured facts retain structured-source provenance", () => {
  const normalized = normalizeAiTraits(baseParsedTraits(), dogInput({
    energy_level: "Moderate",
    exercise_needs: "High",
    obedience_training: "Needs Training",
    barking_level: "Quiet",
    grooming_level: "Low",
    yard_required: true,
    owner_experience: "Experienced owner required",
    good_with_kids: true,
    potty_trained: false,
    max_alone_hours: 4,
  }));

  for (const key of [
    "energy_level",
    "exercise_needs",
    "training_needs",
    "barking_level",
    "grooming_level",
    "needs_yard",
    "first_time_friendly",
    "good_with_kids",
    "potty_trained",
    "max_alone_hours_estimate",
  ]) {
    assert.equal(normalized[key].evidence_basis, "structured_source", key);
  }
});

test("unsupported prior alone-time values are not carried forward", () => {
  const fresh = buildBioColumns(normalizeAiTraits(baseParsedTraits(), dogInput({
    description: "A calm house-trained senior.",
  })), null);
  const { merged, carriedForwardFields } = mergeExistingBioColumns(fresh, {
    bio_max_alone_hours: 6,
    bio_max_alone_hours_label: "5-6",
  });
  assert.equal(merged.bio_max_alone_hours, null);
  assert.equal(merged.bio_max_alone_hours_label, "unknown");
  assert.equal(carriedForwardFields.includes("bio_max_alone_hours"), false);
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

test("ordinary lifestyle traits retain carry-forward while unsupported shedding is cleared", () => {
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
  assert.equal(merged.bio_shedding_level, "unknown");
  assert.equal(merged.bio_grooming_level, "moderate");
  assert.equal(merged.bio_training_needs, "medium_high");
  assert.deepEqual(
    carriedForwardFields.sort(),
    ["bio_energy_level", "bio_grooming_level", "bio_training_needs"].sort()
  );
});

test("shedding evidence hierarchy preserves source facts and explicit bio statements", () => {
  const sourceHigh = normalizeAiTraits(
    baseParsedTraits({ shedding_level: trait("low", 0.99, "Model guess.") }),
    dogInput({ breed: "Poodle (Standard)", shedding_level: "heavy" })
  );
  assert.deepEqual(
    { value: sourceHigh.shedding_level.value, confidence: sourceHigh.shedding_level.confidence, basis: sourceHigh.shedding_level.evidence_basis },
    { value: "high", confidence: 1, basis: "structured_source" }
  );

  const sourceLow = normalizeAiTraits(baseParsedTraits(), dogInput({ shedding_level: "minimal" }));
  assert.equal(sourceLow.shedding_level.value, "low");
  assert.equal(sourceLow.shedding_level.confidence, 1);

  const bioLow = normalizeAiTraits(
    baseParsedTraits({ shedding_level: trait("medium", 0.8, "General profile estimate.") }),
    dogInput({ description: "The rescue reports that this dog is low-shedding." })
  );
  assert.equal(bioLow.shedding_level.value, "low");
  assert.equal(bioLow.shedding_level.evidence_basis, "bio_explicit");
  assert.ok(bioLow.shedding_level.confidence < sourceLow.shedding_level.confidence);
});

test("Poodles and Poodle mixes use cautious breed and coat evidence", () => {
  const poodle = normalizeAiTraits(
    baseParsedTraits({ shedding_level: trait("medium", 0.8, "General model estimate.") }),
    dogInput({ breed: "Poodle (Standard) / Mixed", description: "The source identifies this dog as a Standard Poodle." })
  );
  assert.deepEqual(
    { value: poodle.shedding_level.value, confidence: poodle.shedding_level.confidence, basis: poodle.shedding_level.evidence_basis },
    { value: "low", confidence: 0.82, basis: "breed_coat_inference" }
  );

  const doodleUnknown = normalizeAiTraits(
    baseParsedTraits({ shedding_level: trait("medium", 0.8, "Breed average.") }),
    dogInput({ breed: "Labrador Retriever / Poodle / Mixed", description: "Friendly Labradoodle." })
  );
  assert.equal(doodleUnknown.shedding_level.value, "unknown");
  assert.equal(doodleUnknown.shedding_level.confidence, 0);
  assert.equal(doodleUnknown.shedding_level.evidence_basis, "breed_coat_inference");

  const doodleCoat = normalizeAiTraits(
    baseParsedTraits(),
    dogInput({ breed: "Goldendoodle / Mixed", description: "The source describes a curly coat and regular grooming." })
  );
  assert.equal(doodleCoat.shedding_level.value, "low");
  assert.equal(doodleCoat.shedding_level.confidence, 0.72);
  assert.equal(doodleCoat.shedding_level.evidence_basis, "breed_coat_inference");
});

test("mixed-breed shedding combines breed components and respects conflicting coat evidence", () => {
  const pomChi = normalizeAiTraits(
    baseParsedTraits({ shedding_level: trait("low", 0.9, "Chihuahua estimate.", "breed_coat_inference") }),
    dogInput({ breed: "Pomeranian / Chihuahua / Mixed (long coat)", description: "Senior companion." })
  );
  assert.equal(pomChi.shedding_level.value, "medium");
  assert.ok(pomChi.shedding_level.confidence <= 0.35);
  assert.equal(pomChi.shedding_level.evidence_basis, "breed_coat_inference");
  assert.match(pomChi.shedding_level.evidence, /conflict/i);

  const longCoatChi = normalizeAiTraits(
    baseParsedTraits({ shedding_level: trait("low", 0.9, "Chihuahua estimate.", "breed_coat_inference") }),
    dogInput({ breed: "Chihuahua / Mixed (long coat)", description: "Long-coated mixed-breed dog." })
  );
  assert.equal(longCoatChi.shedding_level.value, "unknown");
  assert.equal(longCoatChi.shedding_level.confidence, 0);

  const labPoodle = normalizeAiTraits(
    baseParsedTraits({ shedding_level: trait("low", 0.9, "Poodle mix.", "breed_coat_inference") }),
    dogInput({ breed: "Labrador Retriever / Poodle / Mixed", description: "Coat type is not documented." })
  );
  assert.equal(labPoodle.shedding_level.value, "unknown");
  assert.equal(labPoodle.shedding_level.confidence, 0);

  const unknownMix = normalizeAiTraits(
    baseParsedTraits({ shedding_level: trait("medium", 0.8, "Generic mixed-breed estimate.", "breed_coat_inference") }),
    dogInput({ breed: "Mixed Breed", description: "Friendly companion." })
  );
  assert.equal(unknownMix.shedding_level.value, "unknown");
  assert.equal(unknownMix.shedding_level.confidence, 0);
});

test("missing shedding evidence remains unknown", () => {
  const normalized = normalizeAiTraits(
    baseParsedTraits({ shedding_level: trait("medium", 0, "") }),
    dogInput({ breed: null, description: "Friendly companion." })
  );
  assert.deepEqual(normalized.shedding_level, {
    value: "unknown",
    confidence: 0,
    evidence: "",
    evidence_basis: "profile_inference",
  });
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
  assert.equal(
    getEnrichmentEligibilityReason({
      ...current,
      breed: "Mixed Breed",
      shedding_level: null,
      ai_enrichment_version: "dog-ai-traits-v10-provenance",
    }),
    "version_outdated"
  );
  assert.equal(
    getEnrichmentEligibilityReason({
      ...current,
      breed: "Mixed Breed",
      shedding_level: null,
      source_content_hash: "changed-hash",
      ai_enrichment_version: "dog-ai-traits-v10-provenance",
    }),
    "version_outdated"
  );
  assert.equal(
    getEnrichmentEligibilityReason({
      ...current,
      breed: "Labrador Retriever / Poodle / Mixed",
      shedding_level: null,
      ai_enrichment_version: "dog-ai-traits-v10-provenance",
    }),
    "version_outdated"
  );
});

test("a DACC dog with a blank/generic description is not eligible via 'new' or 'version_outdated'", () => {
  const neverEnriched = {
    rescuegroups_org_id: DACC_RESCUEGROUPS_ORG_ID,
    description: null,
    ai_enriched_at: null,
    ai_enrichment_version: AI_ENRICHMENT_VERSION,
    source_content_hash: "blank-bio-hash",
    ai_enriched_source_hash: null,
  };

  // Would normally be "new", but a ShelterManager/DACC bio recovery failure
  // (or a dog the recovery step simply hasn't matched yet) must not let it
  // through with only breed/age profile-inference evidence.
  assert.equal(getEnrichmentEligibilityReason(neverEnriched), null);

  const enrichedUnderOldVersionStillBlank = {
    ...neverEnriched,
    ai_enriched_at: "2026-08-10T21:59:38.846Z",
    ai_enrichment_version: "dog-ai-traits-v9",
    ai_enriched_source_hash: "blank-bio-hash",
  };

  // Same guard applies to "version_outdated" — re-running a newer prompt
  // version over the same incomplete evidence isn't a real improvement.
  assert.equal(getEnrichmentEligibilityReason(enrichedUnderOldVersionStillBlank), null);
});

test("a DACC dog becomes eligible again once its bio actually lands, via the normal content_changed path", () => {
  const alreadyEnrichedWhileBlank = {
    rescuegroups_org_id: DACC_RESCUEGROUPS_ORG_ID,
    description: null,
    ai_enriched_at: "2026-08-10T21:59:38.846Z",
    ai_enrichment_version: AI_ENRICHMENT_VERSION,
    source_content_hash: "blank-bio-hash",
    ai_enriched_source_hash: "blank-bio-hash",
  };

  assert.equal(getEnrichmentEligibilityReason(alreadyEnrichedWhileBlank), null);

  const afterBioBackfill = {
    ...alreadyEnrichedWhileBlank,
    description: "Charlie loves toys and fetches a tennis ball.",
    source_content_hash: "real-bio-hash",
  };

  assert.equal(getEnrichmentEligibilityReason(afterBioBackfill), "content_changed");
});

test("a DACC dog with an existing meaningful description is never blocked by the blank-bio safeguard", () => {
  const meaningfulDaccDog = {
    rescuegroups_org_id: DACC_RESCUEGROUPS_ORG_ID,
    description: "Charlie is a real shelter-authored bio already on file.",
    ai_enriched_at: null,
    ai_enrichment_version: AI_ENRICHMENT_VERSION,
    source_content_hash: "hash-a",
    ai_enriched_source_hash: null,
  };

  assert.equal(getEnrichmentEligibilityReason(meaningfulDaccDog), "new");
});

test("a non-DACC dog with a blank description is unaffected by the DACC-only bio-recovery safeguard", () => {
  const blankBioOtherShelter = {
    rescuegroups_org_id: "7921", // Happy Days Dog and Cat Rescue, not DACC
    description: null,
    ai_enriched_at: null,
    ai_enrichment_version: AI_ENRICHMENT_VERSION,
    source_content_hash: "hash-a",
    ai_enriched_source_hash: null,
  };

  assert.equal(getEnrichmentEligibilityReason(blankBioOtherShelter), "new");
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
    rescuegroups_org_id: "6172",
    external_id: "123",
    source: "rescuegroups",
    placement_state: "MI",
    photo_url: "https://images.example.org/dog.jpg",
    adoption_url: "https://adopt.example.org/dog",
    ingestion_source_id: "source-6172",
    ingestion_sources: { source_type: "rescuegroups", external_org_id: "6172", enabled: true, publication_eligible: true },
    last_checked_at: new Date().toISOString(),
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
