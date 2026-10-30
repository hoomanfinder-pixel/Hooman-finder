import { getDogSourceFilterId } from "./dogSource.js";
import { CHILD_COMPATIBILITY, resolveChildCompatibility } from "./childCompatibility.js";

function parsedAgeYearsFromText(ageText) {
  const text = String(ageText || "").toLowerCase().trim();
  if (!text) return null;

  const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*year/);
  const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*month/);
  const weekMatch = text.match(/(\d+(?:\.\d+)?)\s*week/);
  const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*day/);

  if (!yearMatch && !monthMatch && !weekMatch && !dayMatch) return null;

  const years = Number(yearMatch?.[1] || 0);
  const months = Number(monthMatch?.[1] || 0);
  const weeks = Number(weekMatch?.[1] || 0);
  const days = Number(dayMatch?.[1] || 0);
  return years + months / 12 + weeks / 52 + days / 365;
}

// age_years has been observed inconsistent with age_text on some historical
// rows. Prefer the unit-aware text when the two values materially disagree.
export function normalizeAgeBucket(ageYears, ageText) {
  const raw = Number(ageYears);
  const parsed = parsedAgeYearsFromText(ageText);

  let n = Number.isFinite(raw) ? raw : null;
  if (parsed !== null && (n === null || Math.abs(n - parsed) > 0.5)) n = parsed;

  if (Number.isFinite(n)) {
    if (n < 2) return "puppy";
    if (n < 7) return "adult";
    return "senior";
  }

  const text = String(ageText || "").toLowerCase();
  if (text.includes("puppy")) return "puppy";
  if (text.includes("senior")) return "senior";
  return null;
}

export function filterDogItems(
  items,
  {
    rescueFilter = "all",
    stateFilter = "all",
    ageFilter = "all",
    sizeFilter = "all",
    energyFilter = "all",
    hypoOnly = false,
    pottyOnly = false,
    kidsOnly = false,
    catsOnly = false,
    dogsOnly = false,
  } = {},
  getDog = (item) => item
) {
  if (!Array.isArray(items)) return [];

  return items.filter((item) => {
    const dog = getDog(item);
    if (!dog || dog.urgency_level === "Adopted") return false;

    if (
      rescueFilter !== "all" &&
      getDogSourceFilterId(dog) !== rescueFilter
    ) return false;

    if (
      stateFilter !== "all" &&
      String(dog.placement_state || "").trim().toUpperCase() !== stateFilter
    ) return false;

    if (
      ageFilter !== "all" &&
      normalizeAgeBucket(dog.age_years, dog.age_text) !== ageFilter
    ) return false;

    if (sizeFilter !== "all" && dog.size !== sizeFilter) return false;
    if (energyFilter !== "all" && dog.energy_level !== energyFilter) return false;
    if (hypoOnly && !dog.hypoallergenic) return false;
    if (pottyOnly && !dog.potty_trained) return false;
    if (kidsOnly) {
      const childCompatibility = resolveChildCompatibility(dog);
      if (
        childCompatibility.source !== "structured" ||
        childCompatibility.value !== CHILD_COMPATIBILITY.YES
      ) return false;
    }
    if (catsOnly && !dog.good_with_cats) return false;
    if (dogsOnly && dog.good_with_dogs !== true) return false;

    return true;
  });
}
