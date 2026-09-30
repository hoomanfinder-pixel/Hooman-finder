import test from "node:test";
import assert from "node:assert/strict";

import { computeRankedMatches } from "./matchingLogic.js";
import {
  PUBLIC_DOG_QUERY_PAGE_SIZE,
  fetchAllPublicDogs,
} from "./publicDogsQuery.js";

function publicDog(index) {
  return {
    id: `dog-${String(index).padStart(4, "0")}`,
    name: `Dog ${index}`,
    created_at: new Date(2026, 0, 1, 0, 0, index).toISOString(),
    adoptable: true,
    adoption_pending: false,
    availability_status: "available",
    source: "manual",
    verified: true,
    source_url: `https://www.petfinder.com/dog/${index}`,
    size: "Small",
    age_years: 4,
  };
}

function mockSupabase(rows) {
  const ranges = [];
  return {
    ranges,
    from(table) {
      assert.equal(table, "dogs");
      const query = {
        select() { return query; },
        eq() { return query; },
        or() { return query; },
        in() { return query; },
        order() { return query; },
        range(from, to) {
          ranges.push([from, to]);
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return query;
    },
  };
}

test("public dog retrieval paginates beyond the 1,000-row threshold", async () => {
  const sourceRows = Array.from({ length: 1251 }, (_, index) => publicDog(index));
  const client = mockSupabase(sourceRows);
  const dogs = await fetchAllPublicDogs(client, { select: "*" });

  assert.equal(dogs.length, 1251);
  assert.equal(new Set(dogs.map((dog) => dog.id)).size, 1251);
  assert.deepEqual(client.ranges, [
    [0, PUBLIC_DOG_QUERY_PAGE_SIZE - 1],
    [PUBLIC_DOG_QUERY_PAGE_SIZE, PUBLIC_DOG_QUERY_PAGE_SIZE * 2 - 1],
    [PUBLIC_DOG_QUERY_PAGE_SIZE * 2, PUBLIC_DOG_QUERY_PAGE_SIZE * 3 - 1],
  ]);
});

test("dogs beyond the first 1,000 rows are included in matching", async () => {
  const sourceRows = Array.from({ length: 1205 }, (_, index) => publicDog(index));
  const dogs = await fetchAllPublicDogs(mockSupabase(sourceRows), { select: "*" });
  const ranked = computeRankedMatches(dogs, {
    size_preference: ["small"],
    age_preference: ["adult"],
  });

  assert.equal(ranked.length, 1205);
  assert.ok(ranked.some((row) => row.dog.id === "dog-1204"));
});
