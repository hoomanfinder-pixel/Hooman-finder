const UNAVAILABLE_ORG_LABEL = "Listing organization unavailable";

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function normalizeExternalUrl(raw) {
  const trimmed = clean(raw);
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("http://")) return trimmed.replace("http://", "https://");
  return trimmed;
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
  if (hasDogLevelSource(dog)) return "";
  return clean(dog?.shelters?.logo_url);
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
  const dogLevelUrl =
    normalizeExternalUrl(dog?.adoption_url) ||
    normalizeExternalUrl(dog?.source_url) ||
    normalizeExternalUrl(dog?.shelter_website);

  if (dogLevelUrl) return dogLevelUrl;

  return (
    normalizeExternalUrl(dog?.shelters?.apply_url) ||
    normalizeExternalUrl(dog?.shelters?.website)
  );
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
