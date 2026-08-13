import assert from "node:assert/strict";
import test from "node:test";

import platformStats from "../generated/platform-stats.json" with { type: "json" };

test("versioned platform stats are valid positive counts", () => {
  assert.equal(platformStats.version, 1);
  assert.ok(!Number.isNaN(Date.parse(platformStats.generated_at)));
  assert.ok(Number.isInteger(platformStats.public_dog_count));
  assert.ok(platformStats.public_dog_count > 0);
  assert.ok(Number.isInteger(platformStats.public_shelter_count));
  assert.ok(platformStats.public_shelter_count > 0);
});
