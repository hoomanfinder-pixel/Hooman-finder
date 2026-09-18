import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildXml, dogEntries, selectPublicDogs } = require("../../scripts/generate-dog-sitemap.cjs");

const NOW = Date.parse("2026-09-17T18:00:00.000Z");

function visibleDog(overrides = {}) {
  return {
    id: "eligible-dog",
    adoptable: true,
    adoption_pending: false,
    urgency_level: "Normal",
    availability_status: "available",
    imported_status: "visible",
    source: "rescuegroups",
    rescuegroups_id: "123",
    external_id: "123",
    rescuegroups_org_id: "456",
    ingestion_source_id: "source-456",
    placement_state: "MI",
    photo_url: "https://images.example.org/dog.jpg",
    adoption_url: "https://example.rescuegroups.org/animals/detail?AnimalID=123",
    last_checked_at: "2026-09-17T17:00:00.000Z",
    ingestion_sources: {
      id: "source-456",
      source_type: "rescuegroups",
      external_org_id: "456",
      enabled: true,
      publication_eligible: true,
    },
    ...overrides,
  };
}

test("sitemap selection uses the authoritative publication policy", async () => {
  const rows = [
    visibleDog(),
    visibleDog({ id: "disabled", rescuegroups_id: "2", external_id: "2", ingestion_sources: { ...visibleDog().ingestion_sources, enabled: false } }),
    visibleDog({ id: "pending", rescuegroups_id: "3", external_id: "3", adoption_pending: true }),
    visibleDog({ id: "quarantined", rescuegroups_id: "4", external_id: "4", imported_status: "quarantined" }),
    visibleDog({ id: "missing-identity", rescuegroups_id: null, external_id: null }),
    visibleDog({ id: "invalid-state", rescuegroups_id: "6", external_id: "6", placement_state: "Ontario" }),
    visibleDog({ id: "missing-destination", rescuegroups_id: "7", external_id: "7", adoption_url: null, source_url: null }),
    visibleDog({ id: "stale", rescuegroups_id: "8", external_id: "8", last_checked_at: "2026-09-10T00:00:00.000Z" }),
  ];

  const selected = await selectPublicDogs(rows, { now: NOW });
  assert.deepEqual(selected.map((dog) => dog.id), ["eligible-dog"]);

  const xml = buildXml(dogEntries(selected));
  assert.equal((xml.match(/<url>/g) || []).length, 1);
  assert.match(xml, /\/dog\/eligible-dog/);
  for (const excluded of rows.slice(1)) assert.doesNotMatch(xml, new RegExp(`/dog/${excluded.id}`));
  assert.doesNotThrow(() => new URL(xml.match(/<loc>([^<]+)<\/loc>/)[1]));
});
