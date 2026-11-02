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

const VERIFIED_ORG_HOME_PAGES = Object.freeze({
  "6454": "https://projecthoperescue.org",
});

const VERIFIED_STALE_ORG_ADOPTION_URL_REPLACEMENTS = Object.freeze({
  "8755": Object.freeze({
    stale: "https://backthebluepetrescue.org/adoption-application/",
    current: "https://backthebluepetrescue.org/dog-adoption-application/",
  }),
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

function getVerifiedOrgHomePage(orgId) {
  return VERIFIED_ORG_HOME_PAGES[String(orgId || "")] || null;
}

function replaceVerifiedStaleOrgAdoptionUrl(orgId, value) {
  const replacement = VERIFIED_STALE_ORG_ADOPTION_URL_REPLACEMENTS[String(orgId || "")];
  const candidate = clean(value);

  return replacement && candidate === replacement.stale
    ? replacement.current
    : value;
}

function resolveRescueGroupsAdoptionUrl({ orgId, candidates = [] }) {
  const correctedCandidates = Array.isArray(candidates)
    ? candidates.map((candidate) => replaceVerifiedStaleOrgAdoptionUrl(orgId, candidate))
    : [];

  return (
    firstSafeAuthoritativeUrl(...correctedCandidates) ||
    getVerifiedOrgAdoptionDestination(orgId)
  );
}

function resolveRescueGroupsOrganizationUrl({ orgId, candidates = [] }) {
  return firstSafeAuthoritativeUrl(...candidates) || getVerifiedOrgHomePage(orgId);
}

module.exports = {
  VERIFIED_ORG_ADOPTION_DESTINATIONS,
  VERIFIED_ORG_HOME_PAGES,
  firstSafeAuthoritativeUrl,
  getVerifiedOrgAdoptionDestination,
  getVerifiedOrgHomePage,
  isBrokenRescueGroupsFallback,
  isValidHttpsUrl,
  resolveRescueGroupsAdoptionUrl,
  resolveRescueGroupsOrganizationUrl,
};
