import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  RESCUEGROUPS_SOURCES,
} = require("../../scripts/rescuegroups-sources.cjs");

test("registry normalization preserves explicitly disabled sources", () => {
  const disabledSources = RESCUEGROUPS_SOURCES.filter(
    (source) => source.enabled === false
  );
  const enabledSources = RESCUEGROUPS_SOURCES.filter(
    (source) => source.enabled === true
  );

  assert.deepEqual(
    disabledSources.map((source) => source.rescueGroupsOrgId).sort(),
    ["3182", "9242"]
  );
  assert.equal(enabledSources.length, 12);
});
