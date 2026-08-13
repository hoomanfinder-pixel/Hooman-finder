import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  NO_BIO_RETRY_MS,
  RECOVERED_REFRESH_MS,
  isGenericDescription,
  hashAuthoritativeBio,
  buildTraitUpdates,
  buildBioTraitUpdates,
  buildUpdate,
  buildRecoveryAttemptUpdate,
  evaluateDogUpdate,
  fetchRescueGroupsDaccRoster,
  getRecoveryCandidateDecision,
  indexShelterManagerByCode,
  resolveShelterManagerMatch,
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
    rescuegroups_id: "rg-1",
    rescuegroups_org_id: "8883",
    source: "rescuegroups",
    external_id: "rg-1",
    adoptable: true,
    adoption_pending: false,
    availability_status: "available",
    urgency_level: "Standard",
    dacc_bio_recovery_status: null,
    dacc_bio_checked_at: null,
    dacc_bio_source_hash: null,
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

  assert.equal(result.outcome, "fetch_failed");
  assert.equal(result.update, null);
  const attemptUpdate = buildRecoveryAttemptUpdate(dog, result, "2026-08-13T12:00:00.000Z");
  assert.deepEqual(Object.keys(attemptUpdate).sort(), [
    "dacc_bio_checked_at",
    "dacc_bio_recovery_status",
  ]);
  assert.equal(Object.hasOwn(attemptUpdate, "adoptable"), false);
  assert.equal(Object.hasOwn(attemptUpdate, "availability_status"), false);
});

test("evaluateDogUpdate returns a recovered outcome once a bio is actually found via the detail page", async () => {
  const dog = baseDog({ description: null });
  const animal = shelterManagerAnimal();
  const html =
    '<html><body><p class="adoptee-description">Charlie is a very good boy who loves tennis balls.</p></body></html>';

  const result = await evaluateDogUpdate(dog, {
    animal,
    fetchTextImpl: async () => html,
  });

  assert.equal(result.outcome, "recovered");
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

test("DACC recovery uses the shared complete multi-page RescueGroups roster", async () => {
  const requestedPages = [];
  const roster = await fetchRescueGroupsDaccRoster("test-key", {
    pageLimit: 2,
    timeoutMs: 1000,
    fetchImpl: async (url) => {
      const page = Number(new URL(url).searchParams.get("page"));
      requestedPages.push(page);
      const ids = page === 1 ? ["1", "2"] : ["3"];
      return {
        ok: true,
        json: async () => ({
          data: ids.map((id) => ({
            id,
            attributes: { name: `Dog ${id}`, rescueId: `A${id}` },
            relationships: { orgs: { data: [{ type: "orgs", id: "8883" }] } },
          })),
          included: [],
          meta: {
            count: 3,
            countReturned: ids.length,
            pageReturned: page,
            limit: 2,
            pages: 2,
          },
        }),
        text: async () => "",
      };
    },
  });

  assert.deepEqual(requestedPages, [1, 2]);
  assert.deepEqual([...roster.authoritativeIds], ["1", "2", "3"]);
});

test("matching requires exact ShelterManager code and rejects name-only or duplicate-code matches", () => {
  const index = indexShelterManagerByCode([
    shelterManagerAnimal({ ID: 1, SHELTERCODE: "A100", ANIMALNAME: "Charlie" }),
    shelterManagerAnimal({ ID: 2, SHELTERCODE: "A200", ANIMALNAME: "Charlie" }),
    shelterManagerAnimal({ ID: 3, SHELTERCODE: "A200", ANIMALNAME: "Other" }),
  ]);

  assert.equal(resolveShelterManagerMatch({ rescueId: "A100", name: "Different" }, index).outcome, "exact_code");
  assert.equal(resolveShelterManagerMatch({ rescueId: "A999", name: "Charlie" }, index).outcome, "no_match");
  assert.equal(resolveShelterManagerMatch({ rescueId: "A200", name: "Charlie" }, index).outcome, "ambiguous_code");
});

test("new recoverable DACC bio becomes naturally eligible for AI", async () => {
  const dog = baseDog({ ai_enriched_at: null, description: null });
  const result = await evaluateDogUpdate(dog, {
    animal: shelterManagerAnimal(),
    fetchTextImpl: async () =>
      '<p class="adoptee-description">Charlie loves fetch and settles nicely after play.</p>',
  });
  const update = buildRecoveryAttemptUpdate(dog, result, "2026-08-13T12:00:00.000Z");

  assert.equal(result.outcome, "recovered");
  assert.equal(update.dacc_bio_recovery_status, "recovered");
  assert.equal(getEnrichmentEligibilityReason({ ...dog, ...update }), "new");
});

test("a no-match dog is deferred and can recover when its exact code appears later", async () => {
  const dog = baseDog();
  const missing = await evaluateDogUpdate(dog, { animal: null });
  const deferred = buildRecoveryAttemptUpdate(dog, missing, "2026-08-13T12:00:00.000Z");
  assert.equal(deferred.dacc_bio_recovery_status, "no_match");

  const decision = getRecoveryCandidateDecision({ ...dog, ...deferred }, {
    now: new Date("2026-08-14T12:00:00.000Z"),
  });
  assert.deepEqual(decision, { eligible: true, reason: "retry_no_match" });

  const recovered = await evaluateDogUpdate({ ...dog, ...deferred }, {
    animal: shelterManagerAnimal(),
    fetchTextImpl: async () =>
      '<p class="adoptee-description">Charlie now has an authoritative shelter bio.</p>',
  });
  assert.equal(recovered.outcome, "recovered");
});

test("no-bio and parse-failure outcomes remain distinct and safe", async () => {
  const dog = baseDog();
  const animal = shelterManagerAnimal();
  const noBio = await evaluateDogUpdate(dog, {
    animal,
    fetchTextImpl: async () => '<p class="adoptee-description"></p>',
  });
  const parseFailure = await evaluateDogUpdate(dog, {
    animal,
    fetchTextImpl: async () => "<html><body>unexpected template</body></html>",
  });

  assert.equal(noBio.outcome, "no_bio");
  assert.equal(parseFailure.outcome, "parse_failed");
  assert.equal(noBio.update, null);
  assert.equal(parseFailure.update, null);
  assert.equal(
    getEnrichmentEligibilityReason({
      ...dog,
      ...buildRecoveryAttemptUpdate(dog, noBio, "2026-08-13T12:00:00.000Z"),
      ai_enriched_at: null,
    }),
    null
  );
});

test("unavailable dogs are skipped and no-bio cooldown is respected", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");
  assert.equal(
    getRecoveryCandidateDecision(baseDog({ adoptable: false }), { now }).reason,
    "not_public"
  );

  const recentNoBio = baseDog({
    dacc_bio_recovery_status: "no_bio",
    dacc_bio_checked_at: new Date(now.getTime() - NO_BIO_RETRY_MS + 1000).toISOString(),
  });
  assert.deepEqual(getRecoveryCandidateDecision(recentNoBio, { now }), {
    eligible: false,
    reason: "no_bio_cooldown",
  });

  const dueNoBio = {
    ...recentNoBio,
    dacc_bio_checked_at: new Date(now.getTime() - NO_BIO_RETRY_MS).toISOString(),
  };
  assert.deepEqual(getRecoveryCandidateDecision(dueNoBio, { now }), {
    eligible: true,
    reason: "retry_no_bio",
  });
});

test("current recovered dogs skip until source change or periodic refresh", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");
  const dog = baseDog({
    description: "Authoritative DACC bio.",
    dacc_bio_recovery_status: "recovered",
    dacc_bio_source_hash: hashAuthoritativeBio("Authoritative DACC bio."),
    dacc_bio_checked_at: new Date(now.getTime() - RECOVERED_REFRESH_MS + 1000).toISOString(),
    source_updated_at: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(getRecoveryCandidateDecision(dog, { now }).reason, "current");

  const sourceChanged = { ...dog, source_updated_at: "2026-08-13T11:00:00.000Z" };
  assert.equal(
    getRecoveryCandidateDecision(sourceChanged, { now }).reason,
    "rescuegroups_source_changed"
  );

  const periodic = {
    ...dog,
    dacc_bio_checked_at: new Date(now.getTime() - RECOVERED_REFRESH_MS).toISOString(),
  };
  assert.equal(getRecoveryCandidateDecision(periodic, { now }).reason, "periodic_refresh");
});

test("unchanged recovered bio is idempotent and does not create AI eligibility", async () => {
  const bio = "Charlie has a stable authoritative bio.";
  const dog = baseDog({
    description: bio,
    dacc_bio_recovery_status: "recovered",
    dacc_bio_source_hash: hashAuthoritativeBio(bio),
    ai_enriched_at: "2026-08-10T00:00:00.000Z",
    ai_enrichment_version: AI_ENRICHMENT_VERSION,
  });
  dog.source_content_hash = computeSourceContentHash(dog);
  dog.ai_enriched_source_hash = dog.source_content_hash;

  const result = await evaluateDogUpdate(dog, {
    animal: shelterManagerAnimal(),
    fetchTextImpl: async () => `<p class="adoptee-description">${bio}</p>`,
  });
  const update = buildRecoveryAttemptUpdate(dog, result, "2026-08-13T12:00:00.000Z");

  assert.equal(result.outcome, "recovered");
  assert.deepEqual(result.update, {});
  assert.equal(Object.hasOwn(update, "source_content_hash"), false);
  assert.equal(getEnrichmentEligibilityReason({ ...dog, ...update }), null);
});

test("changed authoritative bio safely updates tracked content and triggers content_changed", async () => {
  const oldBio = "Charlie used to prefer quiet walks.";
  const newBio = "Charlie now loves fetch, training games, and active walks.";
  const dog = baseDog({
    description: oldBio,
    dacc_bio_recovery_status: "recovered",
    dacc_bio_source_hash: hashAuthoritativeBio(oldBio),
    ai_enriched_at: "2026-08-10T00:00:00.000Z",
    ai_enrichment_version: AI_ENRICHMENT_VERSION,
  });
  dog.source_content_hash = computeSourceContentHash(dog);
  dog.ai_enriched_source_hash = dog.source_content_hash;

  const result = await evaluateDogUpdate(dog, {
    animal: shelterManagerAnimal(),
    fetchTextImpl: async () => `<p class="adoptee-description">${newBio}</p>`,
  });
  const update = buildRecoveryAttemptUpdate(dog, result, "2026-08-13T12:00:00.000Z");

  assert.equal(update.description, newBio);
  assert.notEqual(update.source_content_hash, dog.ai_enriched_source_hash);
  assert.equal(getEnrichmentEligibilityReason({ ...dog, ...update }), "content_changed");
});

test("founder-edited description is preserved as a manual conflict", async () => {
  const importedBio = "The originally imported ShelterManager bio.";
  const dog = baseDog({
    description: "Founder-edited profile copy that must remain untouched.",
    dacc_bio_recovery_status: "recovered",
    dacc_bio_source_hash: hashAuthoritativeBio(importedBio),
  });
  const result = await evaluateDogUpdate(dog, {
    animal: shelterManagerAnimal(),
    fetchTextImpl: async () =>
      '<p class="adoptee-description">A newly changed ShelterManager bio.</p>',
  });
  const update = buildRecoveryAttemptUpdate(dog, result, "2026-08-13T12:00:00.000Z");

  assert.equal(result.outcome, "manual_conflict");
  assert.equal(Object.hasOwn(update, "description"), false);
  assert.equal(update.dacc_bio_recovery_status, "manual_conflict");
});
