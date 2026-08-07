// scripts/dog-enrichment-hash.cjs
//
// Shared content-hash helper used to detect when a dog's enrichment-relevant
// data (bio text, or the structured fields AI enrichment reads as evidence)
// has actually changed, so scripts/enrich-dogs-ai.cjs can automatically
// re-enrich a dog without re-calling OpenAI for every dog on every run.
//
// Required by every script that writes fields in HASHED_FIELDS:
// - sync-rescuegroups-dogs.cjs
// - scripts/enrich-dacc-bios.cjs
// - scripts/enrich-dogs-ai.cjs (reads the stored hash columns; does not need
//   to recompute one for its own bio_* writes, since those are outputs, not
//   enrichment input evidence)
// - scripts/backfill-source-content-hash.cjs

const crypto = require("crypto");

// Keep this in sync with the fields scripts/enrich-dogs-ai.cjs's asDogInput()
// reads as enrichment evidence (description, breed, age, size, structured
// compatibility/behavior fields, etc). Fields outside this list — photos,
// availability/status, shelter contact info, adoption URLs, timestamps —
// never affect AI output, so changes to them must never trigger a
// re-enrichment call.
const HASHED_FIELDS = [
  // name is fed into the OpenAI prompt as context AND drives
  // containsDifferentDogName() mismatch detection (used to flag a bio that
  // mentions a different dog's name) — a rename genuinely changes AI output,
  // not just bookkeeping.
  "name",
  "description",
  "placement_note",
  "breed",
  "gender",
  "age_years",
  "age_text",
  "size",
  "energy_level",
  "activity_level",
  "qualities",
  "play_styles",
  "good_with_kids",
  "good_with_dogs",
  "good_with_cats",
  "good_with_small_animals",
  "potty_trained",
  "first_time_friendly",
  "hypoallergenic",
  "shedding_level",
  "grooming_level",
  "barking_level",
  "max_alone_hours",
  // Also passed into the prompt as context (asDogInput()'s shelter_name).
  // Note: asDogInput() falls back to the joined dog.shelters?.name when this
  // column is null — a rename of the *linked shelter itself* (rather than
  // this column) is not covered by a row-level hash and is an accepted,
  // very-low-probability gap rather than something worth a cross-table hash.
  "shelter_name",
];

function normalizeHashValue(value) {
  if (value === undefined) return null;
  return value;
}

// Computes a stable hash from only the HASHED_FIELDS subset of a dog-like
// object. Field order is fixed (HASHED_FIELDS order), so the same logical
// content always hashes the same way regardless of the source object's own
// key order.
function computeSourceContentHash(dogLike) {
  const snapshot = {};
  for (const field of HASHED_FIELDS) {
    snapshot[field] = normalizeHashValue(dogLike?.[field]);
  }

  const json = JSON.stringify(snapshot);
  return crypto.createHash("sha256").update(json).digest("hex");
}

// Builds the true "final row state" snapshot for hashing when a script only
// partially updates a dog (e.g. an UPDATE payload that omits or deletes some
// keys). For each hashed field, prefers the value actually present in
// updateRow; otherwise falls back to the existing stored value. This avoids
// computing a hash from an incomplete in-memory object, which would silently
// diverge from what scripts/enrich-dogs-ai.cjs later reads from the DB.
function mergeHashedSnapshot(existingDog, updateRow) {
  const snapshot = {};
  for (const field of HASHED_FIELDS) {
    snapshot[field] = Object.prototype.hasOwnProperty.call(updateRow || {}, field)
      ? updateRow[field]
      : existingDog?.[field];
  }
  return snapshot;
}

module.exports = {
  HASHED_FIELDS,
  computeSourceContentHash,
  mergeHashedSnapshot,
};
