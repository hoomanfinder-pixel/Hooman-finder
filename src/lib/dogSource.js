import { normalizeExternalUrl as normalizeSafeExternalUrl, normalizeImageUrl } from "./urlSafety";

const UNAVAILABLE_ORG_LABEL = "Listing organization unavailable";
const DACC_RESCUEGROUPS_ORG_ID = "8883";
export const DACC_ADOPT_URL = "https://www.friendsofdacc.org/adopt/";

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function normalizeExternalUrl(raw) {
  return normalizeSafeExternalUrl(raw);
}

function isDaccDog(dog) {
  return clean(dog?.rescuegroups_org_id) === DACC_RESCUEGROUPS_ORG_ID;
}

function isKnownBrokenUrlForDog(url, dog) {
  if (!url) return false;
  if (!isDaccDog(dog)) return false;

  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "www.rescuegroups.org" &&
      parsed.pathname === "/animals/detail" &&
      parsed.searchParams.has("AnimalID")
    );
  } catch {
    return false;
  }
}

export function hasDogLevelSource(dog) {
  return Boolean(
    clean(dog?.shelter_name) ||
      clean(dog?.shelter_website) ||
      clean(dog?.placement_city) ||
      clean(dog?.placement_state) ||
      clean(dog?.placement_location) ||
      clean(dog?.adoption_url) ||
      clean(dog?.source_url) ||
      clean(dog?.rescuegroups_org_id)
  );
}

export function getDogSourceName(dog, fallback = UNAVAILABLE_ORG_LABEL) {
  return clean(dog?.shelter_name) || clean(dog?.shelters?.name) || fallback;
}

export function getDogSourceLogo(dog) {
  return [dog?.shelter_logo_url, dog?.rescue_logo_url, dog?.organization_logo_url, dog?.logo_url, dog?.shelters?.logo_url]
    .map((url) => normalizeImageUrl(url, { allowRelative: false }))
    .find(Boolean) || "";
}

export function getDogSourceLocation(dog, fallback = "Location unknown") {
  if (clean(dog?.placement_location)) return clean(dog.placement_location);

  if (clean(dog?.placement_city) && clean(dog?.placement_state)) {
    return `${clean(dog.placement_city)}, ${clean(dog.placement_state)}`;
  }

  if (clean(dog?.placement_city)) return clean(dog.placement_city);
  if (clean(dog?.placement_state)) return clean(dog.placement_state);

  if (clean(dog?.shelters?.city) && clean(dog?.shelters?.state)) {
    return `${clean(dog.shelters.city)}, ${clean(dog.shelters.state)}`;
  }

  if (clean(dog?.shelters?.city)) return clean(dog.shelters.city);
  if (clean(dog?.shelters?.state)) return clean(dog.shelters.state);

  return fallback;
}

export function getDogApplyLink(dog) {
  if (isDaccDog(dog)) return DACC_ADOPT_URL;

  const dogLevelUrl =
    [dog?.adoption_url, dog?.source_url]
      .map(normalizeExternalUrl)
      .find((url) => url && !isKnownBrokenUrlForDog(url, dog)) ||
    normalizeExternalUrl(dog?.shelter_website);

  if (dogLevelUrl) return dogLevelUrl;

  return (
    normalizeExternalUrl(dog?.shelters?.apply_url) ||
    normalizeExternalUrl(dog?.shelters?.website)
  );
}

export function getDogApplyLabel(dog) {
  if (!getDogApplyLink(dog)) return "Application link unavailable";
  if (isDaccDog(dog)) return "View DACC adoptable dogs";
  return "View official listing";
}

export function getDogSourceFilterId(dog) {
  if (clean(dog?.rescuegroups_org_id)) {
    return `rescuegroups:${clean(dog.rescuegroups_org_id)}`;
  }

  if (clean(dog?.shelter_name)) {
    return `source:${clean(dog.shelter_name).toLowerCase()}`;
  }

  return clean(dog?.shelters?.id) || clean(dog?.shelter_id);
}
