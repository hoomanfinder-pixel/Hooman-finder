export const SITE_URL = "https://hoomanfinder.com";

export const INDEXABLE_ROUTE_SEO = {
  "/": {
    title: "Free Dog Adoption Matching Tool | Hooman Finder",
    description:
      "Find adoptable rescue dogs matched to your lifestyle, home, family, and preferences with Hooman Finder’s free dog adoption matching tool.",
  },
  "/dogs": {
    title: "Adoptable Rescue Dogs | Hooman Finder",
    description:
      "Browse current dogs from shelters and rescues represented on Hooman Finder, then view confirmed profile details and official adoption links.",
  },
  "/quiz": {
    title: "Dog Adoption Matching Quiz | Hooman Finder",
    description:
      "Take Hooman Finder's dog adoption matching quiz to find current shelter and rescue dogs that may fit your home, routine, and lifestyle.",
  },
  "/about": {
    title: "About Hooman Finder | Dog Adoption Matching",
    description:
      "Learn how Hooman Finder helps adopters discover rescue dogs that may fit their lifestyle, home, and adoption preferences.",
  },
  "/contact": {
    title: "Contact Hooman Finder",
    description:
      "Contact Hooman Finder with questions, comments, or suggestions about dog adoption matching.",
  },
  "/privacy": {
    title: "Privacy Policy | Hooman Finder",
    description:
      "Read how Hooman Finder handles quiz answers, saved dogs, analytics, and contact information.",
  },
  "/terms": {
    title: "Terms and Disclaimer | Hooman Finder",
    description:
      "Read Hooman Finder terms and adoption information disclaimers for dog adoption discovery and matching.",
  },
  "/shelters/join": {
    title: "For Animal Shelters and Rescues | Hooman Finder",
    description:
      "Learn how shelters and rescues can list adoptable dogs on Hooman Finder while keeping control of applications and adoption decisions.",
  },
};

export const PRERENDERED_ROUTES = Object.keys(INDEXABLE_ROUTE_SEO);

export function absoluteSiteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export function routeSeo(path) {
  return INDEXABLE_ROUTE_SEO[path] || null;
}

export function readPrerenderData(key) {
  if (typeof window === "undefined") {
    return globalThis.__HOOMAN_PRERENDER_DATA__?.[key] || null;
  }

  const element = document.getElementById("hooman-prerender-data");
  if (!element?.textContent) return null;

  try {
    return JSON.parse(element.textContent)?.[key] || null;
  } catch {
    return null;
  }
}
