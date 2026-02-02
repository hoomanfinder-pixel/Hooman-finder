// src/lib/matchReasons.js

function normStr(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

function normSize(v) {
  const s = normStr(v);
  if (!s) return "";
  if (s === "xl" || s.includes("extra")) return "extra large";
  return s;
}

function ageBucket(ageYears) {
  const n = Number(ageYears);
  if (!Number.isFinite(n)) return null;
  if (n < 2) return "puppy";
  if (n < 7) return "adult";
  return "senior";
}

function pushUnique(arr, msg) {
  if (!msg) return;
  if (!arr.includes(msg)) arr.push(msg);
}

/**
 * Returns up to `limit` short, human reasons for why a dog matches.
 * - Only uses quiz answers + dog fields (no internal scoring keys).
 * - Safe for missing/unknown fields.
 * - Prefers "positive match" reasons, but falls back to "good to know" reasons.
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
  const sizePrefsRaw = answers.size_preference;
  const sizePrefs = Array.isArray(sizePrefsRaw)
    ? sizePrefsRaw.map(normSize).filter(Boolean)
    : [];
  const dogSize = normSize(dog.size);
  if (sizePrefs.length && dogSize && sizePrefs.includes(dogSize)) {
    pushUnique(reasons, `Fits your preferred size (${dog.size})`);
  }

  // --- Age
  const agePrefsRaw = answers.age_preference;
  const agePrefs = Array.isArray(agePrefsRaw)
    ? agePrefsRaw.map(normStr).filter(Boolean)
    : [];
  const dogAgeBucket = ageBucket(dog.age_years);
  if (agePrefs.length && dogAgeBucket && agePrefs.includes(dogAgeBucket)) {
    const label =
      dogAgeBucket === "puppy" ? "puppy" : dogAgeBucket === "adult" ? "adult" : "senior";
    pushUnique(reasons, `Age matches what you’re looking for (${label})`);
  }

  // --- Pets in home (only claim if dog explicitly good with X)
  const pets = Array.isArray(answers.pets_in_home)
    ? answers.pets_in_home.map(normStr).filter(Boolean)
    : [];

  if (pets.includes("dogs") && dog.good_with_dogs === true) {
    pushUnique(reasons, `Good with other dogs`);
  }
  if (pets.includes("cats") && dog.good_with_cats === true) {
    pushUnique(reasons, `Cat-friendly`);
  }
  if (pets.includes("small_animals") && dog.good_with_small_animals === true) {
    pushUnique(reasons, `Okay with small animals`);
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
  if (alone && Number.isFinite(maxAlone)) {
    const ok =
      (alone === "lt4" && maxAlone <= 4) ||
      (alone === "4to6" && maxAlone <= 6) ||
      (alone === "6to8" && maxAlone <= 8) ||
      alone === "gt8";

    if (ok) {
      pushUnique(reasons, `Can handle your daily alone-time schedule`);
    }
  }

  // --- Allergies
  const allergy = normStr(answers.allergy_sensitivity);
  if (allergy === "have_allergies" && dog.hypoallergenic === true) {
    pushUnique(reasons, `Better fit for allergy-sensitive homes`);
  }

  // ✅ If we already have enough "positive match" reasons, return them
  if (reasons.length >= limit) return reasons.slice(0, limit);

  // ---------- Fallback reasons (helpful info, not claiming "match") ----------
  // These only show if we *don't* have many real matches yet.
  const fallback = [];

  if (dog.size) pushUnique(fallback, `Size: ${dog.size}`);
  if (dog.energy_level) pushUnique(fallback, `Energy: ${dog.energy_level}`);
  if (dog.age_years !== null && dog.age_years !== undefined) {
    const b = ageBucket(dog.age_years);
    pushUnique(fallback, b ? `Age: ${b}` : `Age: unknown`);
  }
  if (dog.hypoallergenic === true) pushUnique(fallback, `Hypoallergenic`);
  if (dog.potty_trained === true) pushUnique(fallback, `Potty trained`);
  if (dog.good_with_kids === true) pushUnique(fallback, `Good with kids`);
  if (dog.good_with_cats === true) pushUnique(fallback, `Good with cats`);
  if (dog.good_with_dogs === true) pushUnique(fallback, `Good with other dogs`);

  // Add fallbacks until we hit limit
  for (const f of fallback) {
    if (reasons.length >= limit) break;
    pushUnique(reasons, f);
  }

  // Absolute last resort
  if (!reasons.length) return ["Based on what we know so far"];

  return reasons.slice(0, limit);
}
