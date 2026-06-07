const ACTIVE_STATUSES = new Set(["active", "available"]);
const VERIFIED_CONFIDENCE = new Set(["current", "trusted", "verified"]);

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function hasReliableUrl(value) {
  const url = clean(value);
  return url.startsWith("https://") || url.startsWith("http://");
}

function hasRescueGroupsIdentity(dog) {
  return Boolean(clean(dog?.external_id) || clean(dog?.rescuegroups_id));
}

function hasTrustedSyncedSource(dog) {
  return lower(dog?.source) === "rescuegroups" && hasRescueGroupsIdentity(dog);
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

  return hasTrustedSyncedSource(dog) || hasVerifiedListingSource(dog);
}

export function filterPublicDogs(dogs) {
  return Array.isArray(dogs) ? dogs.filter(isPubliclyVisibleDog) : [];
}
