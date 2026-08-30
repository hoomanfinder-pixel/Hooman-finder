import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  RESCUEGROUPS_SOURCES,
} = require("../../scripts/rescuegroups-sources.cjs");

test("registry normalization preserves an explicitly disabled source", () => {
  const disabledSource = RESCUEGROUPS_SOURCES.find(
    (source) => source.rescueGroupsOrgId === "9242"
  );
  const otherSources = RESCUEGROUPS_SOURCES.filter(
    (source) => source.rescueGroupsOrgId !== "9242"
  );

  assert.equal(
    disabledSource?.name,
    "The Life of Fostering Furbabies Animal Rescue"
  );
  assert.equal(disabledSource.enabled, false);
  assert.equal(otherSources.length, 12);
  assert.equal(otherSources.every((source) => source.enabled === true), true);
});
