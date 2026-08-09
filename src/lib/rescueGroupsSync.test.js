import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  fetchOnePageForRescue,
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
