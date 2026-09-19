import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  ensureShelterForSource,
  findShelterByName,
} = require("../../scripts/rescuegroups-shelter-utils.cjs");

function clientWithShelters(shelters) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async limit() { return { data: shelters, error: null }; },
      };
    },
  };
}

test("normalized shelter-name matching cannot cross state boundaries", async () => {
  const client = clientWithShelters([
    { id: "ca", name: "Happy Tails Rescue", city: "Oakland", state: "CA" },
    { id: "tx", name: "Happy Tails Rescue", city: "Austin", state: "TX" },
  ]);

  assert.equal(await findShelterByName(client, "Happy Tails Rescue", "FL", "Miami"), null);
  assert.equal((await findShelterByName(client, "Happy Tails Rescue", "TX", "Austin")).id, "tx");
});

test("same-name shelters in the same geography fail closed when ambiguous", async () => {
  const client = clientWithShelters([
    { id: "one", name: "Safe Paws", city: "Austin", state: "TX" },
    { id: "two", name: "Safe Paws", city: "Austin", state: "TX" },
  ]);

  await assert.rejects(
    findShelterByName(client, "Safe Paws", "TX", "Austin"),
    /Ambiguous shelter match/
  );
});

test("name matching cannot reuse a shelter linked to a different RescueGroups organization", async () => {
  const shelter = {
    id: "existing",
    name: "Safe Paws",
    city: "Austin",
    state: "TX",
    rescuegroups_org_id: "old-org",
  };
  const client = {
    from() {
      return {
        select() { return this; },
        eq(column, value) {
          this.column = column;
          this.value = value;
          return this;
        },
        async limit() {
          if (this.column === "id") return { data: [], error: null };
          if (this.column === "rescuegroups_org_id") return { data: [], error: null };
          return { data: [shelter], error: null };
        },
      };
    },
  };

  await assert.rejects(
    ensureShelterForSource(client, {
      name: "Safe Paws",
      city: "Austin",
      state: "TX",
      rescuegroups_org_id: "new-org",
    }),
    /already linked.*old-org.*new-org/
  );
});
