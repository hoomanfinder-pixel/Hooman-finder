import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  getVerifiedOrgAdoptionDestination,
  getVerifiedOrgHomePage,
  isBrokenRescueGroupsFallback,
  resolveRescueGroupsAdoptionUrl,
  resolveRescueGroupsOrganizationUrl,
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

test("Back The Blue's exact stale organization URL is replaced", () => {
  assert.equal(
    resolveRescueGroupsAdoptionUrl({
      orgId: "8755",
      candidates: ["https://backthebluepetrescue.org/adoption-application/"],
    }),
    "https://backthebluepetrescue.org/dog-adoption-application/"
  );
});

test("the Back The Blue replacement is scoped to the exact organization", () => {
  const staleUrl = "https://backthebluepetrescue.org/adoption-application/";

  assert.equal(
    resolveRescueGroupsAdoptionUrl({ orgId: "different-org", candidates: [staleUrl] }),
    staleUrl
  );
});

test("Back The Blue keeps a different valid URL unchanged", () => {
  const otherValidUrl = "https://backthebluepetrescue.org/our-dogs/";

  assert.equal(
    resolveRescueGroupsAdoptionUrl({ orgId: "8755", candidates: [otherValidUrl] }),
    otherValidUrl
  );
});

test("missing and malformed Back The Blue candidates do not trigger the replacement", () => {
  assert.equal(resolveRescueGroupsAdoptionUrl({ orgId: "8755" }), null);
  assert.equal(
    resolveRescueGroupsAdoptionUrl({
      orgId: "8755",
      candidates: [null, "not a URL", "http://backthebluepetrescue.org/adoption-application/"],
    }),
    null
  );
});

test("a valid dog-specific URL remains preferred over Back The Blue's stale organization URL", () => {
  const dogUrl = "https://backthebluepetrescue.org/dogs/scout/";

  assert.equal(
    resolveRescueGroupsAdoptionUrl({
      orgId: "8755",
      candidates: [dogUrl, "https://backthebluepetrescue.org/adoption-application/"],
    }),
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

test("bare schemes are rejected as organization URLs", () => {
  for (const value of ["http://", "https://"]) {
    assert.equal(
      resolveRescueGroupsOrganizationUrl({ orgId: "unconfigured", candidates: [value] }),
      null
    );
  }
});

test("a valid organization URL remains unchanged", () => {
  const organizationUrl = "https://example.org/about";
  assert.equal(
    resolveRescueGroupsOrganizationUrl({ orgId: "unconfigured", candidates: [organizationUrl] }),
    organizationUrl
  );
});

test("Project Hope alone receives its verified organization homepage fallback", () => {
  assert.equal(getVerifiedOrgHomePage("6454"), "https://projecthoperescue.org");
  assert.equal(
    resolveRescueGroupsOrganizationUrl({ orgId: "6454", candidates: ["http://"] }),
    "https://projecthoperescue.org"
  );
  assert.equal(
    resolveRescueGroupsOrganizationUrl({ orgId: "6172", candidates: ["http://"] }),
    null
  );
});
