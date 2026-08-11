import {
  getDogApplyLabel,
  getDogApplyLink,
  getDogSourceLocation,
  getDogSourceName,
} from "./dogSource.js";
import { normalizeImageUrl } from "./urlSafety.js";
import { decodeHtmlEntities } from "../utils/decodeHtmlEntities.js";

const SITE_URL = "https://hoomanfinder.com";
const DEFAULT_IMAGE = `${SITE_URL}/home-hero-adopter-dog-hd.jpg`;

function cleanText(value) {
  if (value === null || value === undefined) return "";

  return decodeHtmlEntities(String(value))
    .replace(/<[^>]*>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateDogProfileText(value, maxLength) {
  if (!value || value.length <= maxLength) return value;
  const sliced = value.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  const shortened = lastSpace >= maxLength * 0.7 ? sliced.slice(0, lastSpace) : sliced;
  return `${shortened.trim()}…`;
}

function confirmedAge(dog) {
  const ageText = cleanText(dog?.age_text);
  if (ageText) return ageText;

  if (dog?.age_years !== null && dog?.age_years !== undefined && dog?.age_years !== "") {
    return `${dog.age_years} years`;
  }

  return "";
}

export function getConfirmedDogProfile(dog) {
  const name = cleanText(dog?.name);
  const breed = cleanText(dog?.breed);
  const age = confirmedAge(dog);
  const size = cleanText(dog?.size);
  const location = cleanText(getDogSourceLocation(dog, ""));
  const shelterName = cleanText(getDogSourceName(dog, ""));
  const description = cleanText(dog?.description);
  const image = normalizeImageUrl(dog?.photo_url, { allowRelative: false });
  const adoptionUrl = getDogApplyLink(dog);

  return {
    name,
    breed,
    age,
    size,
    location,
    shelterName,
    description,
    image,
    adoptionUrl,
    adoptionLabel: adoptionUrl ? getDogApplyLabel(dog) : "",
  };
}

export function buildDogProfileMetadata(dog, id, { publiclyVisible = true } = {}) {
  const profile = getConfirmedDogProfile(dog);
  const name = profile.name || "Adoptable Dog";
  const breed = profile.breed || "Dog";
  const shelterName = profile.shelterName || "a rescue or shelter";
  const canonicalUrl = `${SITE_URL}/dog/${encodeURIComponent(String(id || ""))}`;
  const title = publiclyVisible
    ? `${name} - Adoptable ${breed} | Hooman Finder`
    : `${name} - Adoption Status Unavailable | Hooman Finder`;
  const description = publiclyVisible
    ? `Meet ${name}, an adoptable ${breed} listed through ${shelterName}. View photos, rescue details, and lifestyle fit information on Hooman Finder.`
    : `${name} may no longer be available. Browse currently adoptable dogs on Hooman Finder.`;

  return {
    ...profile,
    canonicalUrl,
    description: truncateDogProfileText(description, 180),
    image: profile.image || DEFAULT_IMAGE,
    imageAlt: publiclyVisible
      ? `${name}, adoptable ${breed}`
      : `${name}, dog with unavailable adoption status`,
    noindex: !publiclyVisible,
    title,
  };
}
