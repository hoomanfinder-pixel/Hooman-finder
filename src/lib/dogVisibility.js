import { getDogAvailabilitySignal } from "./dogAvailability.js";

export const RESCUEGROUPS_SOURCE = "rescuegroups";
export const PUBLICATION_CHECK_MAX_AGE_MS = 72 * 60 * 60 * 1000;

const ACTIVE_STATUSES = new Set(["active", "available", "unknown"]);
const VERIFIED_CONFIDENCE = new Set(["current", "trusted", "verified"]);
const BLOCKED_IMPORT_STATUSES = new Set(["disabled", "hidden", "quarantined", "unavailable"]);
const US_JURISDICTIONS = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);
const TRUSTED_LISTING_HOSTS = [
  "rescuegroups.org",
  "petfinder.com",
  "adoptapet.com",
  "shelterluv.com",
  "petango.com",
];

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function hasReliableUrl(value, { trustedHostOnly = false } = {}) {
  const url = clean(value);
  if (!url.startsWith("https://")) return false;
  try {
    const { hostname } = new URL(url);
    if (!hostname || !hostname.includes(".")) return false;
    return !trustedHostOnly || TRUSTED_LISTING_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

function sourceState(dog) {
  const value = dog?.ingestion_sources;
  return Array.isArray(value) ? value[0] || null : value || null;
}

function commonAvailabilityReason(dog) {
  if (dog?.adoptable !== true) return "not adoptable";
  if (dog?.adoption_pending === true) return "adoption pending";
  if (lower(dog?.urgency_level) === "adopted") return "marked adopted";
  if (!ACTIVE_STATUSES.has(lower(dog?.availability_status))) return "inactive availability status";
  if (BLOCKED_IMPORT_STATUSES.has(lower(dog?.imported_status))) return "blocked import status";
  if (getDogAvailabilitySignal(dog)) return "listing text indicates unavailable";
  return null;
}

function hasVerifiedListingSource(dog) {
  const confidence = lower(dog?.source_confidence);
  const verified =
    dog?.verified === true ||
    dog?.availability_verified === true ||
    VERIFIED_CONFIDENCE.has(confidence);

  return verified && (
    hasReliableUrl(dog?.source_url, { trustedHostOnly: true }) ||
    hasReliableUrl(dog?.adoption_url, { trustedHostOnly: true })
  );
}

export function getRescueGroupsPublicationIneligibilityReason(
  dog,
  { now = Date.now(), maxCheckAgeMs = PUBLICATION_CHECK_MAX_AGE_MS } = {}
) {
  if (!dog) return "missing dog";
  if (lower(dog.source) !== RESCUEGROUPS_SOURCE) return "source is not rescuegroups";

  const animalId = clean(dog.rescuegroups_id);
  const externalId = clean(dog.external_id);
  if (!animalId || !externalId) return "missing authoritative RescueGroups animal ID";
  if (animalId !== externalId) return "RescueGroups identity mismatch";

  const orgId = clean(dog.rescuegroups_org_id);
  if (!orgId || !clean(dog.ingestion_source_id)) return "missing managed source identity";
  const registry = sourceState(dog);
  if (!registry) return "missing ingestion source registry state";
  if (lower(registry.source_type) !== RESCUEGROUPS_SOURCE) return "source registry type mismatch";
  if (clean(registry.external_org_id) !== orgId) return "source registry organization mismatch";
  if (registry.enabled !== true) return "source disabled";
  if (registry.publication_eligible !== true) return "source not publication eligible";

  if (!US_JURISDICTIONS.has(clean(dog.placement_state).toUpperCase())) return "missing or invalid US state";
  if (!hasReliableUrl(dog.photo_url)) return "missing usable HTTPS photo";
  if (!hasReliableUrl(dog.adoption_url || dog.source_url)) return "missing usable HTTPS adoption destination";

  const checkedAt = Date.parse(clean(dog.last_checked_at));
  const nowMs = Number(now);
  if (!Number.isFinite(checkedAt) || checkedAt > nowMs || nowMs - checkedAt > maxCheckAgeMs) {
    return "authoritative check is missing or stale";
  }

  return commonAvailabilityReason(dog);
}

export function isPubliclyVisibleDog(dog, options) {
  if (!dog) return false;
  if (lower(dog.source) === RESCUEGROUPS_SOURCE || dog.rescuegroups_id || dog.rescuegroups_org_id) {
    return getRescueGroupsPublicationIneligibilityReason(dog, options) === null;
  }

  return commonAvailabilityReason(dog) === null && hasVerifiedListingSource(dog);
}

export function filterPublicDogs(dogs, options) {
  return Array.isArray(dogs) ? dogs.filter((dog) => isPubliclyVisibleDog(dog, options)) : [];
}

export function isValidUsState(value) {
  return US_JURISDICTIONS.has(clean(value).toUpperCase());
}
