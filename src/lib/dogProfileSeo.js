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

export function normalizeDogLocation(value) {
  const location = cleanText(value);
  if (!location) return "";

  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return location;
  const state = parts.at(-1);
  if (/^[a-z]{2}$/i.test(state)) parts[parts.length - 1] = state.toUpperCase();
  return parts.join(", ");
}

export function conciseDogBreed(value) {
  const breed = cleanText(value).replace(/\s*\([^)]*coat\)\s*/gi, " ").trim();
  if (!breed) return "";

  const parts = breed.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const withoutMixed = parts.filter((part) => part.toLowerCase() !== "mixed");
  const primary = withoutMixed.slice(0, 2).join(" / ");
  return parts.some((part) => part.toLowerCase() === "mixed")
    ? `${primary || "Mixed breed"} mix`
    : primary;
}

function confirmedGender(dog) {
  const gender = cleanText(dog?.gender);
  if (!gender) return "";
  return gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
}

function concisePublicDescription(profile, name) {
  const details = [
    profile.gender ? profile.gender.toLowerCase() : "",
    profile.age,
    conciseDogBreed(profile.breed),
  ].filter(Boolean).join(", ");
  const where = profile.location ? ` in ${profile.location}` : "";
  const source = profile.shelterName ? ` through ${profile.shelterName}` : "";
  const candidates = [
    `Meet ${name}${details ? ` — ${details} —` : ","} available for adoption${where}${source}. View confirmed profile details and the official adoption link.`,
    `Meet ${name}${details ? ` — ${details} —` : ","} available for adoption${where}. View confirmed details and the official adoption link.`,
    `Meet ${name}, available for adoption${where}${source}. View confirmed profile details and the official adoption link.`,
  ];
  return candidates.find((candidate) => candidate.length <= 160) || candidates.at(-1);
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
  const location = normalizeDogLocation(getDogSourceLocation(dog, ""));
  const shelterName = cleanText(getDogSourceName(dog, ""));
  const shelterId = cleanText(dog?.shelters?.id || dog?.shelter_id);
  const gender = confirmedGender(dog);
  const description = cleanText(dog?.description);
  const image = normalizeImageUrl(dog?.photo_url, { allowRelative: false });
  const adoptionUrl = getDogApplyLink(dog);

  return {
    name,
    breed,
    age,
    size,
    gender,
    location,
    shelterName,
    shelterId,
    description,
    image,
    adoptionUrl,
    adoptionLabel: adoptionUrl ? getDogApplyLabel(dog) : "",
  };
}

export function buildDogProfileMetadata(dog, id, { publiclyVisible = true } = {}) {
  const profile = getConfirmedDogProfile(dog);
  const name = profile.name || "Adoptable Dog";
  const breed = conciseDogBreed(profile.breed) || "dog";
  const canonicalUrl = `${SITE_URL}/dog/${encodeURIComponent(String(id || ""))}`;
  const title = publiclyVisible
    ? `${name} for Adoption${profile.location ? ` in ${profile.location}` : ""} | Hooman Finder`
    : `${name} - Adoption Status Unavailable | Hooman Finder`;
  const description = publiclyVisible
    ? concisePublicDescription(profile, name)
    : `${name} may no longer be available. Browse currently adoptable dogs on Hooman Finder.`;

  return {
    ...profile,
    canonicalUrl,
    description,
    image: profile.image || DEFAULT_IMAGE,
    imageAlt: publiclyVisible
      ? `${name}, adoptable ${breed}`
      : `${name}, dog with unavailable adoption status`,
    noindex: !publiclyVisible,
    title,
  };
}
