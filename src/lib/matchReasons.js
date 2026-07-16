// src/lib/matchReasons.js

function normStr(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

function normalizeAnswerList(answer) {
  if (Array.isArray(answer)) return answer.map(normStr).filter(Boolean);
  const value = normStr(answer);
  return value ? [value] : [];
}

function normSize(v) {
  const s = normStr(v);
  if (!s) return "";
  if (s === "xl" || s.includes("extra")) return "extra large";
  if (s === "extra_large") return "extra large";
  return s;
}

function parsedAgeYearsFromText(ageText) {
  const text = (ageText ?? "").toString().toLowerCase().trim();
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
// rows (e.g. a raw month count stored as whole years). When the two disagree
// by more than half a year, the unit-aware text parse is preferred.
function ageBucket(ageYears, ageText) {
  const raw = Number(ageYears);
  const parsed = parsedAgeYearsFromText(ageText);

  let n = Number.isFinite(raw) ? raw : null;
  if (parsed !== null && (n === null || Math.abs(n - parsed) > 0.5)) {
    n = parsed;
  }

  if (!Number.isFinite(n)) return null;
  if (n < 2) return "puppy";
  if (n < 7) return "adult";
  return "senior";
}

function pushUnique(arr, msg) {
  if (!msg) return;
  if (!arr.includes(msg)) arr.push(msg);
}

function bioCompatibility(value) {
  const normalized = normStr(value);
  if (["yes", "most_likely", "may_do_well"].includes(normalized)) return "estimated";
  return "";
}

function positiveCompatibility(confirmedValue, bioValue) {
  if (confirmedValue === true) return "listed";
  if (confirmedValue === false) return "";
  const bio = bioCompatibility(bioValue);
  return bio || "";
}

function aloneTimeNeededHours(answer) {
  const a = normStr(answer);
  if (a === "lt4" || a === "1to2" || a === "1-2") return 2;
  if (a === "4_6" || a === "4to6" || a === "3to4" || a === "3-4") return 4;
  if (a === "6_8" || a === "6to8" || a === "5to6" || a === "5-6") return 6;
  if (a === "8_plus" || a === "gt8" || a === "7to8" || a === "7-8") return 8;
  return null;
}

/**
 * Returns up to `limit` short, human reasons for why a dog matches.
 * - Only uses quiz answers + dog fields (no internal scoring keys).
 * - Safe for missing/unknown fields.
 * - Only returns supported positive/partial compatibility reasons.
 */
export function getMatchReasons(dog, answers, limit = 3) {
  if (!dog || !answers) return [];

  const reasons = [];

  // --- Energy (exact match)
  const energyPref = normStr(answers.energy_preference);
  const dogEnergy = normStr(dog.energy_level);
  if (energyPref && dogEnergy && energyPref === dogEnergy) {
    pushUnique(reasons, `Energy level matches what you want (${dog.energy_level})`);
  }

  // --- Size (supports ["small","medium"] etc, case-insensitive)
  const sizePrefs = normalizeAnswerList(answers.size_preference).map(normSize);
  const dogSize = normSize(dog.size);
  if (!sizePrefs.includes("flexible") && sizePrefs.length && dogSize && sizePrefs.includes(dogSize)) {
    pushUnique(reasons, `Fits your preferred size (${dog.size})`);
  } else {
    const bioDogSize = normSize(dog.bio_size);
    if (!sizePrefs.includes("flexible") && sizePrefs.length && bioDogSize && sizePrefs.includes(bioDogSize)) {
      pushUnique(reasons, `Listing bio estimate suggests adult size may fit (likely ${dog.bio_size})`);
    }
  }

  // --- Age
  const agePrefs = normalizeAnswerList(answers.age_preference);
  const dogAgeBucket = ageBucket(dog.age_years, dog.age_text);
  if (!agePrefs.includes("flexible") && agePrefs.length && dogAgeBucket && agePrefs.includes(dogAgeBucket)) {
    const label =
      dogAgeBucket === "puppy" ? "puppy" : dogAgeBucket === "adult" ? "adult" : "senior";
    pushUnique(reasons, `Age matches what you’re looking for (${label})`);
  }

  // --- Pets in home (only claim if dog explicitly good with X)
  const kids = normalizeAnswerList(answers.kids_in_home);
  const hasKidsNeed = kids.some((kid) =>
    ["yes", "kids", "children", "sometimes", "visiting", "children_visit", "under_3", "3_5", "6_9", "10_12", "13_plus"].includes(kid)
  );

  if (hasKidsNeed) {
    const kidsFit = positiveCompatibility(
      dog.good_with_kids ?? dog.kids_ok ?? dog.kid_friendly ?? dog.goodWithKids,
      dog.bio_good_with_kids
    );
    if (kidsFit === "listed") pushUnique(reasons, "Listed as compatible with children");
    if (kidsFit === "estimated") pushUnique(reasons, "Listing bio estimate suggests this dog may do well with children");
  }

  const pets = normalizeAnswerList(answers.pets_in_home);

  if (pets.includes("dogs")) {
    const dogsFit = positiveCompatibility(
      dog.good_with_dogs ?? dog.dogs_ok ?? dog.goodWithDogs,
      dog.bio_good_with_dogs
    );
    if (dogsFit === "listed") pushUnique(reasons, "Listed as compatible with other dogs");
    if (dogsFit === "estimated") pushUnique(reasons, "Listing bio estimate suggests this dog may do well with another dog");
  }
  if (pets.includes("cats")) {
    const catsFit = positiveCompatibility(
      dog.good_with_cats ?? dog.cats_ok ?? dog.goodWithCats,
      dog.bio_good_with_cats
    );
    if (catsFit === "listed") pushUnique(reasons, "Listed as compatible with cats");
    if (catsFit === "estimated") pushUnique(reasons, "Listing bio estimate suggests this dog may do well with cats");
  }
  if ((pets.includes("small_animals") || pets.includes("small_pets")) && dog.good_with_small_animals === true) {
    pushUnique(reasons, "Listed as okay with small animals");
  }

  // --- Noise preference (only if dog has barking_level)
  const noisePref = normStr(answers.noise_preference);
  const bark = normStr(dog.barking_level); // expected: low / medium / high
  if (noisePref && bark) {
    if (noisePref === "prefer_quiet" && bark === "low") {
      pushUnique(reasons, `Lower barking tendency`);
    } else if (noisePref === "alert_ok" && bark === "high") {
      pushUnique(reasons, `More vocal / good alert dog`);
    }
  }

  // --- Alone time (only if dog.max_alone_hours is a number)
  const alone = normStr(answers.alone_time); // lt4, 4to6, 6to8, gt8
  const maxAlone = Number(dog.max_alone_hours);
  const bioMaxAlone = Number(dog.bio_max_alone_hours);
  const neededAlone = aloneTimeNeededHours(alone);
  if (neededAlone && Number.isFinite(maxAlone) && maxAlone > 0) {
    if (maxAlone >= neededAlone) {
      pushUnique(reasons, "Listed alone-time capacity fits your weekday routine");
    }
  } else if (neededAlone && Number.isFinite(bioMaxAlone) && bioMaxAlone > 0 && bioMaxAlone >= neededAlone) {
    pushUnique(reasons, "Listing bio estimate suggests the alone time may fit your weekday routine");
  }

  // --- Allergies
  const allergy = normStr(answers.allergy_sensitivity);
  if ((allergy === "have_allergies" || allergy === "needs_low_shedding") && dog.hypoallergenic === true) {
    pushUnique(reasons, `Better fit for allergy-sensitive homes`);
  }

  return reasons.slice(0, limit);
}
