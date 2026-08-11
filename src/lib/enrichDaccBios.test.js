import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  isGenericDescription,
  buildTraitUpdates,
  buildBioTraitUpdates,
  buildUpdate,
  evaluateDogUpdate,
} = require("../../scripts/enrich-dacc-bios.cjs");
const {
  AI_ENRICHMENT_VERSION,
  getEnrichmentEligibilityReason,
} = require("../../scripts/enrich-dogs-ai.cjs");
const { computeSourceContentHash } = require("../../scripts/dog-enrichment-hash.cjs");

function baseDog(overrides = {}) {
  return {
    id: "dog-1",
    name: "Charlie",
    description: null,
    placement_note: null,
    breed: "Husky (medium coat)",
    gender: "Male",
    age_years: 3.5,
    age_text: "3 Years 6 Months",
    size: "Large",
    energy_level: null,
    activity_level: null,
    qualities: [],
    play_styles: [],
    good_with_kids: null,
    good_with_dogs: null,
    good_with_cats: null,
    good_with_small_animals: null,
    potty_trained: null,
    first_time_friendly: null,
    hypoallergenic: null,
    shedding_level: null,
    grooming_level: null,
    barking_level: null,
    max_alone_hours: null,
    yard_required: null,
    fence_needs: null,
    exercise_needs: null,
    obedience_training: null,
    owner_experience: null,
    shelter_name: "Detroit Animal Care and Control",
    bio_good_with_dogs: null,
    bio_good_with_cats: null,
    bio_good_with_kids: null,
    bio_potty_trained: null,
    bio_first_time_friendly: null,
    ...overrides,
  };
}

function shelterManagerAnimal(overrides = {}) {
  return {
    ID: 957,
    SHELTERCODE: "A171985",
    ISGOODWITHDOGSNAME: "",
    ISGOODWITHCATSNAME: "",
    ISGOODWITHCHILDRENNAME: "",
    ISHOUSETRAINEDNAME: "",
    ALTERNATEBIO: "",
    WEBSITEMEDIANOTES: "",
    ANIMALCOMMENTS: "",
    ...overrides,
  };
}

test("an existing meaningful description is never overwritten", () => {
  const dog = baseDog({
    description: "Charlie is a real shelter-authored bio already on file.",
  });
  const animal = shelterManagerAnimal();
  const bio = "A freshly scraped ShelterManager biography with different text.";

  const { update } = buildUpdate(dog, animal, bio, "");

  assert.equal(Object.hasOwn(update, "description"), false);
});

test("a blank description can be populated from the ShelterManager bio", () => {
  const dog = baseDog({ description: null });
  const animal = shelterManagerAnimal();
  const bio = "Charlie A171985 62 lb. neutered male, approx 3 years old.";

  const { update } = buildUpdate(dog, animal, bio, "");

  assert.equal(update.description, bio);
});

test("a stored 'no description provided yet' placeholder is treated as generic and can be populated", () => {
  const dog = baseDog({ description: "No description provided yet." });
  const animal = shelterManagerAnimal();
  const bio = "Real shelter-provided bio text.";

  const { update } = buildUpdate(dog, animal, bio, "");

  assert.equal(update.description, bio);
});

test("a dog with no ShelterManager match is skipped safely and never produces an update", async () => {
  const dog = baseDog();

  const result = await evaluateDogUpdate(dog, { animal: null });

  assert.equal(result.outcome, "no_match");
  assert.equal(result.update, null);
});

test("a failed ShelterManager detail fetch never reaches buildUpdate or touches the dog's existing data", async () => {
  const dog = baseDog({ description: null });
  const animal = shelterManagerAnimal();

  const result = await evaluateDogUpdate(dog, {
    animal,
    fetchTextImpl: async () => {
      throw new Error("ECONNRESET");
    },
  });

  assert.equal(result.outcome, "detail_fetch_failed");
  assert.equal(result.update, null);
});

test("evaluateDogUpdate returns an 'updated' outcome once a bio is actually found via the detail page", async () => {
  const dog = baseDog({ description: null });
  const animal = shelterManagerAnimal();
  const html =
    '<html><body><p class="adoptee-description">Charlie is a very good boy who loves tennis balls.</p></body></html>';

  const result = await evaluateDogUpdate(dog, {
    animal,
    fetchTextImpl: async () => html,
  });

  assert.equal(result.outcome, "updated");
  assert.equal(result.update.description, "Charlie is a very good boy who loves tennis balls.");
});

test("populating the bio changes source_content_hash and makes the dog eligible for content_changed re-enrichment", () => {
  const dog = baseDog({ description: null });
  const animal = shelterManagerAnimal();
  const bio = "Charlie loves toys and fetches a tennis ball.";

  // Snapshot of the hash as it would have been stamped while the bio was
  // still blank (mirrors what sync-rescuegroups-dogs.cjs stamps on import).
  const blankBioHash = computeSourceContentHash(dog);

  const alreadyEnrichedDog = {
    ...dog,
    ai_enriched_at: "2026-08-10T21:59:38.846Z",
    ai_enrichment_version: AI_ENRICHMENT_VERSION,
    source_content_hash: blankBioHash,
    ai_enriched_source_hash: blankBioHash,
  };

  // Sanity check: before the bio backfill, this dog is correctly NOT
  // eligible for re-enrichment (nothing has changed yet).
  assert.equal(getEnrichmentEligibilityReason(alreadyEnrichedDog), null);

  const { update } = buildUpdate(alreadyEnrichedDog, animal, bio, "");
  const updatedDog = { ...alreadyEnrichedDog, ...update };

  assert.notEqual(updatedDog.source_content_hash, updatedDog.ai_enriched_source_hash);
  assert.equal(getEnrichmentEligibilityReason(updatedDog), "content_changed");
});

test("'Unknown behavior with dogs/cats/kids' does not get converted into a confirmed compatibility trait", () => {
  const dog = baseDog();
  const bio = "Charlie is a good boy. Unknown behavior with dogs/cats/kids.";

  const { updates } = buildBioTraitUpdates(dog, bio);

  assert.equal(Object.hasOwn(updates, "bio_good_with_dogs"), false);
  assert.equal(Object.hasOwn(updates, "bio_good_with_cats"), false);
  assert.equal(Object.hasOwn(updates, "bio_good_with_kids"), false);
});

test("an explicit ShelterManager 'Unknown' compatibility field is never written as a confirmed true", () => {
  const dog = baseDog();
  const animal = shelterManagerAnimal({
    ISGOODWITHDOGSNAME: "Unknown",
    ISGOODWITHCATSNAME: "Unknown",
    ISGOODWITHCHILDRENNAME: "Unknown",
  });

  const updates = buildTraitUpdates(dog, animal);

  assert.equal(Object.hasOwn(updates, "good_with_dogs"), false);
  assert.equal(Object.hasOwn(updates, "good_with_cats"), false);
  assert.equal(Object.hasOwn(updates, "good_with_kids"), false);
});

test("a genuine positive dog-compatibility clue is still captured as 'may_do_well', even alongside an explicit unknown line", () => {
  const dog = baseDog();
  const bio =
    "Charlie may do well with a fur sibling with slow and proper intros. Unknown behavior with dogs/cats/kids.";

  const { updates } = buildBioTraitUpdates(dog, bio);

  assert.equal(updates.bio_good_with_dogs, "may_do_well");
});

test("buildUpdate only ever writes the known, narrow set of allowed fields", () => {
  const dog = baseDog();
  const animal = shelterManagerAnimal({
    ISGOODWITHDOGSNAME: "Yes",
    ISGOODWITHCATSNAME: "Yes",
    ISGOODWITHCHILDRENNAME: "Yes",
    ISHOUSETRAINEDNAME: "Yes",
  });
  const bio =
    "Charlie loves toys, may do well with a fur sibling with slow and proper intros, and needs encouragement.";

  const { update } = buildUpdate(dog, animal, bio, "some cautious note");

  const allowedKeys = new Set([
    "description",
    "good_with_dogs",
    "good_with_cats",
    "good_with_kids",
    "potty_trained",
    "bio_good_with_dogs",
    "bio_first_time_friendly",
    "bio_traits_source",
    "bio_traits_updated_at",
    "placement_note",
    "source_content_hash",
  ]);

  for (const key of Object.keys(update)) {
    assert.ok(allowedKeys.has(key), `unexpected field written: ${key}`);
  }
});

test("isGenericDescription treats blank, null, and known placeholder text as generic", () => {
  assert.equal(isGenericDescription(null), true);
  assert.equal(isGenericDescription(""), true);
  assert.equal(isGenericDescription("No description provided yet."), true);
  assert.equal(isGenericDescription("Charlie is available through Detroit Animal Care and Control."), true);
  assert.equal(isGenericDescription("Charlie is a real, dog-specific shelter bio."), false);
});
