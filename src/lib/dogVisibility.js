import { getDogAvailabilitySignal } from "./dogAvailability.js";

const ACTIVE_STATUSES = new Set(["active", "available", "unknown"]);
const VERIFIED_CONFIDENCE = new Set(["current", "trusted", "verified"]);
const TRUSTED_EXTERNAL_ID_SOURCES = new Set(["rescuegroups"]);
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

function hasReliableUrl(value) {
  const url = clean(value);

  if (!url.startsWith("https://")) return false;

  try {
    const { hostname } = new URL(url);
    return TRUSTED_LISTING_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

function hasRescueGroupsIdentity(dog) {
  return Boolean(clean(dog?.rescuegroups_id) || clean(dog?.rescuegroups_org_id));
}

function hasTrustedSyncedSource(dog) {
  return (
    hasRescueGroupsIdentity(dog) ||
    (TRUSTED_EXTERNAL_ID_SOURCES.has(lower(dog?.source)) && Boolean(clean(dog?.external_id)))
  );
}

function hasVerifiedListingSource(dog) {
  const confidence = lower(dog?.source_confidence);
  const verified =
    dog?.verified === true ||
    dog?.availability_verified === true ||
    VERIFIED_CONFIDENCE.has(confidence);

  return verified && (hasReliableUrl(dog?.source_url) || hasReliableUrl(dog?.adoption_url));
}

export function isPubliclyVisibleDog(dog) {
  if (!dog) return false;
  if (dog.adoptable !== true) return false;
  if (dog.adoption_pending === true) return false;
  if (lower(dog.urgency_level) === "adopted") return false;
  if (!ACTIVE_STATUSES.has(lower(dog.availability_status))) return false;
  if (getDogAvailabilitySignal(dog)) return false;

  return hasTrustedSyncedSource(dog) || hasVerifiedListingSource(dog);
}

export function filterPublicDogs(dogs) {
  return Array.isArray(dogs) ? dogs.filter(isPubliclyVisibleDog) : [];
}
