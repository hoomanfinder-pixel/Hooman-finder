import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import {
  getRescueGroupsPublicationIneligibilityReason,
  isPubliclyVisibleDog,
} from "./dogVisibility.js";
import {
  buildRescueGroupsTrackerHtml,
  getRescueGroupsTrackerUrl,
} from "./rescueGroupsTracker.js";
import { buildDogMetadata, injectDogDocument } from "../../middleware.js";

const require = createRequire(import.meta.url);
const { collectPaginatedDogs } = require("../../scripts/enrich-dogs-ai.cjs");

const ROOT = new URL("../../", import.meta.url);
const migration = readFileSync(new URL("supabase/migrations/20260916000000_add_phase1_ingestion_foundation.sql", ROOT), "utf8");
const syncWorkflow = readFileSync(new URL(".github/workflows/sync-rescuegroups-dogs.yml", ROOT), "utf8");
const aiWorkflow = readFileSync(new URL(".github/workflows/enrich-dogs-ai.yml", ROOT), "utf8");

function eligibleDog(overrides = {}) {
  return {
    id: "dog-1",
    name: "Scout",
    source: "rescuegroups",
    rescuegroups_id: "123",
    external_id: "123",
    rescuegroups_org_id: "6172",
    ingestion_source_id: "source-6172",
    ingestion_sources: {
      source_type: "rescuegroups",
      external_org_id: "6172",
      enabled: true,
      publication_eligible: true,
    },
    placement_state: "MI",
    photo_url: "https://images.example.org/scout.jpg",
    adoption_url: "https://adopt.example.org/scout",
    last_checked_at: "2026-09-16T12:00:00.000Z",
    adoptable: true,
    adoption_pending: false,
    availability_status: "available",
    urgency_level: "Standard",
    imported_status: "visible",
    ...overrides,
  };
}

const policyNow = Date.parse("2026-09-16T13:00:00.000Z");

test("RescueGroups publication policy requires every Phase 1 gate", () => {
  const dog = eligibleDog();
  assert.equal(getRescueGroupsPublicationIneligibilityReason(dog, { now: policyNow }), null);
  assert.equal(isPubliclyVisibleDog(dog, { now: policyNow }), true);

  const failures = [
    [{ source: null }, "source is not rescuegroups"],
    [{ external_id: null }, "missing authoritative"],
    [{ external_id: "different" }, "identity mismatch"],
    [{ placement_state: "T" }, "invalid US state"],
    [{ photo_url: "http://images.example.org/scout.jpg" }, "HTTPS photo"],
    [{ adoption_url: "javascript:alert(1)" }, "HTTPS adoption"],
    [{ last_checked_at: "2026-09-10T00:00:00.000Z" }, "missing or stale"],
    [{ adoption_pending: true }, "adoption pending"],
    [{ imported_status: "quarantined" }, "blocked import status"],
  ];
  for (const [override, reason] of failures) {
    assert.match(getRescueGroupsPublicationIneligibilityReason(eligibleDog(override), { now: policyNow }), new RegExp(reason, "i"));
  }
});

test("disabled source kill switch hides all linked dogs without deleting them", () => {
  const dog = eligibleDog({
    ingestion_sources: { source_type: "rescuegroups", external_org_id: "6172", enabled: false, publication_eligible: false },
  });
  assert.equal(isPubliclyVisibleDog(dog, { now: policyNow }), false);
  assert.match(getRescueGroupsPublicationIneligibilityReason(dog, { now: policyNow }), /source disabled/);
});

test("animal-specific RescueGroups tracker renders in server detail only for valid RG rows", () => {
  const dog = eligibleDog({
    tracker_image_url: "https://tracker.rescuegroups.org/pet/123.gif",
    last_checked_at: new Date().toISOString(),
  });
  assert.equal(getRescueGroupsTrackerUrl(dog), "https://tracker.rescuegroups.org/pet/123.gif");
  assert.match(buildRescueGroupsTrackerHtml(dog), /data-rescuegroups-tracker="true"/);

  const shell = "<html><head><title>x</title></head><body><div id=\"root\"></div></body></html>";
  const html = injectDogDocument(shell, dog, buildDogMetadata(dog, dog.id));
  assert.match(html, /tracker\.rescuegroups\.org\/pet\/123\.gif/);
  assert.equal(getRescueGroupsTrackerUrl({ ...dog, source: "manual" }), null);
  assert.equal(buildRescueGroupsTrackerHtml({ ...dog, tracker_image_url: "javascript:bad" }), "");
});

test("AI eligibility scan paginates beyond 2,000 rows", async () => {
  const seen = [];
  const rows = await collectPaginatedDogs(async (from, to) => {
    seen.push([from, to]);
    const count = from < 2000 ? 1000 : 5;
    return Array.from({ length: count }, (_, index) => ({ id: from + index }));
  });
  assert.equal(rows.length, 2005);
  assert.deepEqual(seen, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("AI workflow is separate and both jobs have explicit controls", () => {
  assert.doesNotMatch(syncWorkflow, /enrich-dogs-ai\.cjs/);
  assert.match(aiWorkflow, /AI_ENRICHMENT_ENABLED/);
  assert.match(aiWorkflow, /max_dogs/);
  assert.doesNotMatch(aiWorkflow, /--drain/);
});

test("migration enforces source identity uniqueness and quarantines legacy org 3182", () => {
  assert.match(migration, /dogs_rescuegroups_id_unique/);
  assert.match(migration, /dogs_source_external_id_unique/);
  assert.match(migration, /group by rescuegroups_id having count\(\*\) > 1/i);
  assert.match(migration, /'3182'.*false, false, 'disabled'/s);
  for (const id of ["10978556", "19792942", "19688759"]) assert.match(migration, new RegExp(id));
});
