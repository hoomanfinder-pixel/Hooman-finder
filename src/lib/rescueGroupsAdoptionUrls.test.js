import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  getVerifiedOrgAdoptionDestination,
  isBrokenRescueGroupsFallback,
  resolveRescueGroupsAdoptionUrl,
} = require("../../scripts/rescuegroups-adoption-urls.cjs");

test("the broken www RescueGroups detail fallback is rejected", () => {
  const broken = "https://www.rescuegroups.org/animals/detail?AnimalID=22684083";

  assert.equal(isBrokenRescueGroupsFallback(broken), true);
  assert.equal(
    resolveRescueGroupsAdoptionUrl({ orgId: "2033", candidates: [broken] }),
    "https://www.macombgov.org/departments/animal-control/adoptions"
  );
});

test("a valid authoritative dog URL remains preferred", () => {
  const dogUrl = "https://hddcr.rescuegroups.org/animals/detail?AnimalID=19183006";

  assert.equal(
    resolveRescueGroupsAdoptionUrl({ orgId: "7921", candidates: [dogUrl] }),
    dogUrl
  );
});

test("configured destinations use exact stable organization IDs", () => {
  assert.equal(
    getVerifiedOrgAdoptionDestination("6172"),
    "https://www.ccrcdogs.com/available-dogs.html"
  );
  assert.equal(getVerifiedOrgAdoptionDestination("unconfigured"), null);
  assert.equal(
    resolveRescueGroupsAdoptionUrl({ orgId: "unconfigured", candidates: [] }),
    null
  );
});

test("malformed and insecure values are not accepted as authoritative URLs", () => {
  assert.equal(
    resolveRescueGroupsAdoptionUrl({
      orgId: "8099",
      candidates: ["not a URL", "http://example.com/dog"],
    }),
    "https://angelsrescue.org/available-pets/"
  );
});
