import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  IncompleteRosterError,
  fetchCompleteRescueGroupsRoster,
  planStaleDogs,
  reconcileCompleteRoster,
} = require("../../scripts/rescuegroups-roster.cjs");

const API_URL = "https://api.rescuegroups.org/v5/public/animals/search/available";
const ORG_ID = "6172";

function animal(id, orgId = ORG_ID, name = `Dog ${id}`) {
  return {
    id: String(id),
    attributes: { name },
    relationships: { orgs: { data: [{ type: "orgs", id: String(orgId) }] } },
  };
}

function pageJson({ ids = [], page = 1, count = ids.length, pages, limit = 100, orgId = ORG_ID }) {
  return {
    data: ids.map((id) => animal(id, orgId)),
    included: [],
    meta: {
      count,
      countReturned: ids.length,
      pageReturned: page,
      limit,
      pages: pages ?? (count === 0 ? 0 : Math.ceil(count / limit)),
    },
  };
}

function response(json, { ok = true, status = 200, jsonError = null } = {}) {
  return {
    ok,
    status,
    json: async () => {
      if (jsonError) throw jsonError;
      return json;
    },
    text: async () => JSON.stringify(json),
  };
}

function fetchRoster(fetchImpl, overrides = {}) {
  return fetchCompleteRescueGroupsRoster({
    apiUrl: API_URL,
    apiKey: "test-key",
    orgId: ORG_ID,
    buildRequestBody: () => ({ data: { filters: [] } }),
    fetchImpl,
    timeoutMs: 1000,
    ...overrides,
  });
}

test("multi-page roster uses URL pagination and reconciles every unique ID", async () => {
  const requestedUrls = [];
  const roster = await fetchRoster(async (url) => {
    requestedUrls.push(url);
    const page = Number(new URL(url).searchParams.get("page"));
    return response(
      page === 1
        ? pageJson({ ids: ["1", "2"], page: 1, count: 3, pages: 2, limit: 2 })
        : pageJson({ ids: ["3"], page: 2, count: 3, pages: 2, limit: 2 })
    );
  }, { pageLimit: 2 });

  assert.deepEqual([...roster.authoritativeIds], ["1", "2", "3"]);
  assert.deepEqual(
    requestedUrls.map((url) => new URL(url).search),
    ["?limit=2&page=1", "?limit=2&page=2"]
  );
});

test("fetch failure and invalid JSON abort completeness", async () => {
  await assert.rejects(fetchRoster(async () => { throw new TypeError("fetch failed"); }), /fetch failed/);
  await assert.rejects(
    fetchRoster(async () => response(null, { jsonError: new SyntaxError("bad json") })),
    IncompleteRosterError
  );
});

test("missing or invalid metadata aborts completeness", async () => {
  await assert.rejects(fetchRoster(async () => response({ data: [animal("1")] })), /metadata/);
  await assert.rejects(
    fetchRoster(async () => response(pageJson({ ids: ["1"], count: 2, pages: 1 }))),
    /pages|unique animals/
  );
});

test("partial pagination, repeated pages, and pageReturned mismatch abort completeness", async () => {
  await assert.rejects(
    fetchRoster(async (url) => {
      const page = Number(new URL(url).searchParams.get("page"));
      if (page === 2) throw new TypeError("page two failed");
      return response(pageJson({ ids: ["1"], page: 1, count: 2, pages: 2, limit: 1 }));
    }, { pageLimit: 1 }),
    /page two failed/
  );

  await assert.rejects(
    fetchRoster(async (url) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return response(pageJson({ ids: ["1"], page, count: 2, pages: 2, limit: 1 }));
    }, { pageLimit: 1 }),
    /repeated animal/
  );

  await assert.rejects(
    fetchRoster(async () => response(pageJson({ ids: ["1"], page: 2 }))),
    /when page 1 was requested/
  );
});

test("organization mismatch, meta.count mismatch, and MAX_PAGES exhaustion abort completeness", async () => {
  await assert.rejects(
    fetchRoster(async () => response(pageJson({ ids: ["1"], orgId: "wrong" }))),
    /did not identify requested organization/
  );
  await assert.rejects(
    fetchRoster(async () => response({
      ...pageJson({ ids: ["1"] }),
      meta: { count: 2, countReturned: 1, pageReturned: 1, limit: 100, pages: 1 },
    })),
    /pages|unique animals/
  );
  await assert.rejects(
    fetchRoster(
      async () => response(pageJson({ ids: ["1"], count: 2, pages: 2, limit: 1 })),
      { pageLimit: 1, maxPages: 1 }
    ),
    /exceeding the configured 1/
  );
});

test("zero roster is complete but quarantined from stale marking by default", async () => {
  const roster = await fetchRoster(async () => response(pageJson({ ids: [], count: 0, pages: 0 })));
  assert.equal(roster.complete, true);
  assert.equal(roster.staleMarkingAllowed, false);
  assert.match(roster.quarantineReason, /Zero-result roster/);
});

test("removed dogs stale, present dogs remain, and cross-org rows are isolated", () => {
  const existing = [
    { id: "db-1", rescuegroups_id: "1", rescuegroups_org_id: ORG_ID, adoptable: true },
    { id: "db-2", rescuegroups_id: "2", rescuegroups_org_id: ORG_ID, adoptable: true },
    { id: "db-3", rescuegroups_id: "3", rescuegroups_org_id: "other", adoptable: true },
  ];
  assert.deepEqual(planStaleDogs(existing, ORG_ID, new Set(["1"])).map((dog) => dog.id), ["db-2"]);
});

test("complete reconciliation marks removed dog unavailable and leaves present dog available", async () => {
  const existing = [
    { id: "present", rescuegroups_id: "1", rescuegroups_org_id: ORG_ID, adoptable: true, availability_status: "available" },
    { id: "removed", rescuegroups_id: "2", rescuegroups_org_id: ORG_ID, adoptable: true, availability_status: "available" },
  ];
  await reconcileCompleteRoster({
    source: { name: "Test Source", rescueGroupsOrgId: ORG_ID },
    fetchRoster: async () => ({
      complete: true,
      staleMarkingAllowed: true,
      authoritativeIds: new Set(["1"]),
    }),
    mapRoster: async () => ({ rows: [{ rescuegroups_id: "1", adoptable: true }] }),
    upsert: async () => ({ updated: 1, failed: 0 }),
    markUnavailable: async (_source, ids) => {
      for (const dog of planStaleDogs(existing, ORG_ID, ids)) {
        dog.adoptable = false;
        dog.availability_status = "unavailable";
      }
    },
  });
  assert.equal(existing[0].adoptable, true);
  assert.equal(existing[0].availability_status, "available");
  assert.equal(existing[1].adoptable, false);
  assert.equal(existing[1].availability_status, "unavailable");
});

test("legacy source=null rows participate only with matching stable organization and animal IDs", () => {
  const existing = [
    { id: "legacy", source: null, rescuegroups_id: "9", rescuegroups_org_id: ORG_ID, adoptable: true },
    { id: "unsafe", source: null, rescuegroups_id: null, rescuegroups_org_id: ORG_ID, adoptable: true },
  ];
  assert.deepEqual(planStaleDogs(existing, ORG_ID, []).map((dog) => dog.id), ["legacy"]);
});

test("upsert failure prevents stale marking", async () => {
  let staleCalls = 0;
  await assert.rejects(
    reconcileCompleteRoster({
      source: { name: "Test Source" },
      fetchRoster: async () => ({
        complete: true,
        staleMarkingAllowed: true,
        authoritativeIds: new Set(["1"]),
      }),
      mapRoster: async () => ({ rows: [{ rescuegroups_id: "1" }] }),
      upsert: async () => ({ failed: 1 }),
      markUnavailable: async () => { staleCalls += 1; },
    }),
    /stale marking aborted/
  );
  assert.equal(staleCalls, 0);
});

test("returned but publication-filtered dog still counts as authoritatively seen", async () => {
  let seenIds = [];
  await reconcileCompleteRoster({
    source: { name: "Test Source" },
    fetchRoster: async () => ({
      complete: true,
      staleMarkingAllowed: true,
      authoritativeIds: new Set(["filtered-dog"]),
    }),
    mapRoster: async () => ({ rows: [], filtered: [{ id: "filtered-dog", reason: "missing photo" }] }),
    upsert: async () => ({ inserted: 0, updated: 0, filtered: 1, failed: 0 }),
    markUnavailable: async (_source, ids) => { seenIds = ids; },
  });
  assert.deepEqual(seenIds, ["filtered-dog"]);
});

test("reappearing unavailable dog is restored by a successful upsert", async () => {
  const dog = { rescuegroups_id: "1", adoptable: false, availability_status: "unavailable" };
  await reconcileCompleteRoster({
    source: { name: "Test Source" },
    fetchRoster: async () => ({
      complete: true,
      staleMarkingAllowed: true,
      authoritativeIds: new Set(["1"]),
    }),
    mapRoster: async () => ({ rows: [{ rescuegroups_id: "1", adoptable: true, availability_status: "available" }] }),
    upsert: async (rows) => {
      Object.assign(dog, rows[0]);
      return { updated: 1, failed: 0 };
    },
    markUnavailable: async () => ({ staleMarked: 0 }),
  });
  assert.equal(dog.adoptable, true);
  assert.equal(dog.availability_status, "available");
});

test("quarantined zero roster never calls stale marking", async () => {
  let staleCalls = 0;
  await reconcileCompleteRoster({
    source: { name: "Empty Source" },
    fetchRoster: async () => ({
      complete: true,
      staleMarkingAllowed: false,
      quarantineReason: "unverified zero",
      authoritativeIds: new Set(),
    }),
    mapRoster: async () => ({ rows: [] }),
    upsert: async () => ({ failed: 0 }),
    markUnavailable: async () => { staleCalls += 1; },
  });
  assert.equal(staleCalls, 0);
});
