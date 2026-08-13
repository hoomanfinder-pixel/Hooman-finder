const VERIFIED_ORG_ADOPTION_DESTINATIONS = Object.freeze({
  "2033": "https://www.macombgov.org/departments/animal-control/adoptions",
  "4470": "https://alliesforgreyhounds.org/hounds/",
  "6172": "https://www.ccrcdogs.com/available-dogs.html",
  "6454": "https://www.projecthoperescue.org/adoptable-dogs",
  "6843": "https://www.savingtailsanimalrescue.org/copy-of-dogs",
  "8099": "https://angelsrescue.org/available-pets/",
  "8883": "https://www.friendsofdacc.org/adopt/",
  "9242": "https://fosteringfurbabies.com/available-animals",
  "10584": "https://www.noahprojectmuskegon.org/adopt",
});

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function isValidHttpsUrl(value) {
  const text = clean(value);
  if (!text) return false;

  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function isBrokenRescueGroupsFallback(value) {
  const text = clean(value);
  if (!text) return false;

  try {
    const parsed = new URL(text);
    return (
      parsed.hostname.toLowerCase() === "www.rescuegroups.org" &&
      parsed.pathname === "/animals/detail" &&
      parsed.searchParams.has("AnimalID")
    );
  } catch {
    return false;
  }
}

function firstSafeAuthoritativeUrl(...candidates) {
  return (
    candidates.find(
      (candidate) => isValidHttpsUrl(candidate) && !isBrokenRescueGroupsFallback(candidate)
    ) || null
  );
}

function getVerifiedOrgAdoptionDestination(orgId) {
  return VERIFIED_ORG_ADOPTION_DESTINATIONS[String(orgId || "")] || null;
}

function resolveRescueGroupsAdoptionUrl({ orgId, candidates = [] }) {
  return (
    firstSafeAuthoritativeUrl(...candidates) ||
    getVerifiedOrgAdoptionDestination(orgId)
  );
}

module.exports = {
  VERIFIED_ORG_ADOPTION_DESTINATIONS,
  firstSafeAuthoritativeUrl,
  getVerifiedOrgAdoptionDestination,
  isBrokenRescueGroupsFallback,
  isValidHttpsUrl,
  resolveRescueGroupsAdoptionUrl,
};
