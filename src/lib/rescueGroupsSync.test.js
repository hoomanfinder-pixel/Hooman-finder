import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  buildExistingDogUpdate,
  fetchOnePageForRescue,
  mapAnimalToDogRow,
  syncConfiguredRescues,
} = require("../../sync-rescuegroups-dogs.cjs");

const silentLogger = {
  log() {},
  warn() {},
  error() {},
};

function rescue(name, orgId) {
  return { name, rescueGroupsOrgId: orgId };
}

function existingDog(overrides = {}) {
  return {
    description: "Existing description",
    breed: "Labrador Retriever",
    age_text: "4 Years",
    age_years: 4,
    gender: "Male",
    size: "Large",
    ...overrides,
  };
}

test("a sparse re-sync cannot erase a populated breed", () => {
  const update = buildExistingDogUpdate(
    { rescuegroups_id: "dog-1", breed: null },
    existingDog()
  );

  assert.equal(Object.hasOwn(update, "breed"), false);
});

test("a sparse re-sync preserves age, gender, size, shelter website, city, and source timestamp", () => {
  const update = buildExistingDogUpdate(
    {
      rescuegroups_id: "dog-1",
      age_text: " ",
      age_years: null,
      gender: null,
      size: "",
      shelter_website: null,
      placement_city: undefined,
      source_updated_at: null,
    },
    existingDog()
  );

  for (const field of [
    "age_text",
    "age_years",
    "gender",
    "size",
    "shelter_website",
    "placement_city",
    "source_updated_at",
  ]) {
    assert.equal(Object.hasOwn(update, field), false, `${field} must be omitted`);
  }
});

test("real changed source values still update normally", () => {
  const changedValues = {
    breed: "German Shepherd Dog",
    age_text: "5 Years",
    age_years: 5,
    gender: "Female",
    size: "Medium",
    shelter_website: "https://rescue.example.org",
    placement_city: "Lansing",
    source_updated_at: "2026-08-09T12:00:00.000Z",
  };

  const update = buildExistingDogUpdate(
    { rescuegroups_id: "dog-1", ...changedValues },
    existingDog()
  );

  for (const [field, value] of Object.entries(changedValues)) {
    assert.deepEqual(update[field], value);
  }
});

test("explicit false compatibility values survive mapping and existing-row updates", () => {
  const mapped = mapAnimalToDogRow(
    {
      id: "dog-1",
      attributes: {
        name: "Scout",
        isDogsOk: false,
        isCatsOk: false,
        isKidsOk: false,
      },
    },
    [],
    rescue("Source A", "1")
  );
  const update = buildExistingDogUpdate(mapped, existingDog());

  assert.equal(update.good_with_dogs, false);
  assert.equal(update.good_with_cats, false);
  assert.equal(update.good_with_kids, false);
});

test("normal existing-row updates remain intact and populated descriptions stay frozen", () => {
  const update = buildExistingDogUpdate(
    {
      rescuegroups_id: "dog-1",
      name: "Scout Updated",
      description: "Incoming changed description",
      adoptable: true,
      adoption_pending: false,
      energy_level: "High",
      shelter_id: "shelter-1",
    },
    existingDog()
  );

  assert.equal(update.name, "Scout Updated");
  assert.equal(update.adoptable, true);
  assert.equal(update.adoption_pending, false);
  assert.equal(update.energy_level, "High");
  assert.equal(update.shelter_id, "shelter-1");
  assert.equal(Object.hasOwn(update, "description"), false);
});

test("all configured RescueGroups source failures reject the sync", async () => {
  const rescues = [rescue("Source A", "1"), rescue("Source B", "2")];
  let unavailableCalls = 0;
  let requestAttempts = 0;

  await assert.rejects(
    syncConfiguredRescues({
      rescues,
      fetchDogs: async (currentRescue) => {
        const { animals } = await fetchOnePageForRescue(currentRescue, 1, {
          fetchImpl: async () => {
            requestAttempts += 1;
            throw new TypeError("fetch failed");
          },
          sleep: async () => {},
          logger: silentLogger,
          maxAttempts: 3,
          retryDelayMs: 0,
        });
        return animals;
      },
      attachShelters: async () => {},
      upsert: async () => ({ inserted: 0, updated: 0 }),
      markUnavailable: async () => {
        unavailableCalls += 1;
      },
      logger: silentLogger,
    }),
    /failed for 2\/2 configured source\(s\): Source A, Source B/
  );

  assert.equal(requestAttempts, 6);
  assert.equal(unavailableCalls, 0);
});

test("a transient RescueGroups fetch failure is retried and can succeed", async () => {
  let attempts = 0;
  const waits = [];

  const result = await fetchOnePageForRescue(rescue("Source A", "1"), 1, {
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("fetch failed");

      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: "dog-1" }], included: [] }),
      };
    },
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
    logger: silentLogger,
    maxAttempts: 3,
    retryDelayMs: 10,
  });

  assert.equal(attempts, 2);
  assert.deepEqual(waits, [10]);
  assert.deepEqual(result.animals, [{ id: "dog-1" }]);
});

test("an incomplete source refresh never marks that source's dogs unavailable", async () => {
  const rescues = [rescue("Complete Source", "1"), rescue("Failed Source", "2")];
  const unavailableSources = [];

  await assert.rejects(
    syncConfiguredRescues({
      rescues,
      fetchDogs: async (currentRescue) => {
        if (currentRescue.name === "Failed Source") {
          throw new TypeError("fetch failed after an earlier page");
        }
        return [{ rescuegroups_id: "dog-1" }];
      },
      attachShelters: async () => {},
      upsert: async () => ({ inserted: 0, updated: 1 }),
      markUnavailable: async (currentRescue) => {
        unavailableSources.push(currentRescue.name);
      },
      logger: silentLogger,
    }),
    /Failed Source/
  );

  assert.deepEqual(unavailableSources, ["Complete Source"]);
});

test("successful source refreshes still upsert and run availability checks", async () => {
  const rescues = [rescue("Source A", "1"), rescue("Source B", "2")];
  const attachedIds = [];
  const unavailableChecks = [];

  const result = await syncConfiguredRescues({
    rescues,
    fetchDogs: async (currentRescue) => [
      { rescuegroups_id: `dog-${currentRescue.rescueGroupsOrgId}` },
    ],
    attachShelters: async (dogs) => {
      attachedIds.push(dogs[0].rescuegroups_id);
    },
    upsert: async () => ({ inserted: 0, updated: 1 }),
    markUnavailable: async (currentRescue, seenIds) => {
      unavailableChecks.push([currentRescue.name, seenIds]);
    },
    logger: silentLogger,
  });

  assert.equal(result.totalUpserted, 2);
  assert.deepEqual(attachedIds, ["dog-1", "dog-2"]);
  assert.deepEqual(unavailableChecks, [
    ["Source A", ["dog-1"]],
    ["Source B", ["dog-2"]],
  ]);
});
