// src/lib/matchingLogic.js

const WEIGHTS = Object.freeze({
  play: 25,
  energy: 10,
  size: 15,
  age: 10,
  potty: 15,
  kids: 10,
  cats: 10,
  firstTime: 5,
  allergy: 10,
  shedding: 10,

  // ✅ NEW
  pets: 10,   // dog/cat/small-animal compatibility
  noise: 5,   // barking preference
  alone: 5,   // time alone fit
});

const TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

// ---------- Normalization helpers ----------

function normalizeString(v) {
  if (v == null) return "";
  return String(v).trim();
}

function normalizeLower(v) {
  return normalizeString(v).toLowerCase();
}

// Accept arrays, comma-separated strings, single string, null.
// Returns a cleaned array of strings
function toArrayFlexible(v) {
  if (Array.isArray(v)) return v.filter((x) => x != null && String(x).trim() !== "").map(String);

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    const parts = s.includes(",") ? s.split(",") : [s];
    return parts.map((p) => p.trim()).filter(Boolean);
  }

  if (v == null) return [];
  const single = String(v).trim();
  return single ? [single] : [];
}

function toLowerArray(v) {
  return toArrayFlexible(v).map((x) => String(x).toLowerCase());
}

function hasAnyPreferenceSelected(arr, anyValues) {
  const set = new Set(toLowerArray(arr));
  return anyValues.some((v) => set.has(String(v).toLowerCase()));
}

function normalizeAgeBucket(ageYears) {
  const n = Number(ageYears);
  if (!Number.isFinite(n)) return null;
  if (n < 2) return "puppy";
  if (n < 7) return "adult";
  return "senior";
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function fullPointsIfOpen(value, openValues, weight) {
  const v = normalizeLower(value);
  return openValues.map((x) => String(x).toLowerCase()).includes(v) ? weight : null;
}

function roundTo(n, digits = 1) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const m = 10 ** digits;
  return Math.round(x * m) / m;
}

// ---------- NEW helpers ----------

function petsRequiresNoFiltering(petsSelected) {
  // If user picked "none" or "not_sure" we treat as open
  return hasAnyPreferenceSelected(petsSelected, ["none", "not_sure"]);
}

function mapAloneTimeToHours(aloneTime) {
  const v = normalizeLower(aloneTime);
  if (v === "lt4") return 3;
  if (v === "4to6") return 5;
  if (v === "6to8") return 7;
  if (v === "gt8") return 9;
  return null; // not_sure or missing
}

function normalizeBarkingLevel(raw) {
  const v = normalizeLower(raw);
  if (!v) return "";
  // allow flexible dog values
  if (v.includes("quiet") || v.includes("rare")) return "quiet";
  if (v.includes("mod") || v.includes("some")) return "moderate";
  if (v.includes("vocal") || v.includes("high") || v.includes("often")) return "vocal";
  return v; // fallback
}

// ---------- Public API ----------

export function getMatchLabel(scorePct) {
  const n = Number(scorePct);
  if (!Number.isFinite(n)) return "";
  if (n >= 85) return "Great match";
  if (n >= 70) return "Strong match";
  if (n >= 55) return "Good match";
  return "Possible match";
}

/**
 * rankDogs(dogs, answers)
 * Returns: [{ dog, scorePct, breakdown, rawScore }]
 */
export function rankDogs(dogs, answers) {
  const safeDogs = Array.isArray(dogs) ? dogs : [];
  const a = answers && typeof answers === "object" ? answers : {};

  // ANSWERS (normalized)
  const playSelected = toLowerArray(a.play_styles);
  const energyPref = normalizeLower(a.energy_preference);
  const sizeSelected = toLowerArray(a.size_preference);
  const ageSelected = toArrayFlexible(a.age_preference).map((x) => normalizeLower(x));
  const pottyReq = normalizeLower(a.potty_requirement);
  const kidsHome = normalizeLower(a.kids_in_home);

  // ✅ NEW: combined pets multi-select
  const petsSelected = toLowerArray(a.pets_in_home);

  // keep backward compat if older answers still pass cats_in_home
  const catsHomeLegacy = normalizeLower(a.cats_in_home);

  const firstTime = normalizeLower(a.first_time_owner);
  const allergy = normalizeLower(a.allergy_sensitivity);
  const sheddingSelected = toLowerArray(a.shedding_levels);

  // ✅ NEW
  const noisePref = normalizeLower(a.noise_preference);
  const aloneTime = normalizeLower(a.alone_time);

  // Derive "cats needed" from new petsSelected if present, else fallback
  const catsNeeded = petsSelected.length
    ? petsSelected.includes("cats")
    : catsHomeLegacy === "yes";

  const dogsNeeded = petsSelected.includes("dogs");
  const smallAnimalsNeeded = petsSelected.includes("small_animals");

  const ranked = safeDogs.map((dog) => {
    const breakdown = {
      play: 0,
      energy: 0,
      size: 0,
      age: 0,
      potty: 0,
      kids: 0,
      cats: 0,
      firstTime: 0,
      allergy: 0,
      shedding: 0,

      // ✅ NEW
      pets: 0,
      noise: 0,
      alone: 0,
    };

    // DOG FIELDS (defensive)
    const dogPlay = toLowerArray(dog?.play_styles);
    const dogEnergy = normalizeLower(dog?.energy_level);
    const dogSize = normalizeLower(dog?.size);
    const dogAgeBucket = normalizeAgeBucket(dog?.age_years);
    const dogPotty = !!dog?.potty_trained;
    const dogKids = !!dog?.good_with_kids;
    const dogCats = !!dog?.good_with_cats;
    const dogFirstTime = !!dog?.first_time_friendly;
    const dogHypo = !!dog?.hypoallergenic;
    const dogSheddingRaw = normalizeLower(dog?.shedding_level);

    // ✅ NEW dog fields (may be null)
    const dogGoodWithDogs = dog?.good_with_dogs; // boolean | null
    const dogGoodWithSmall = dog?.good_with_small_animals; // boolean | null
    const dogBarking = normalizeBarkingLevel(dog?.barking_level); // "quiet"|"moderate"|"vocal"|...
    const dogMaxAlone = Number.isFinite(Number(dog?.max_alone_hours)) ? Number(dog?.max_alone_hours) : null;

    // 1) PLAY (25)
    if (hasAnyPreferenceSelected(playSelected, ["no_preference", "any"])) {
      breakdown.play = WEIGHTS.play;
    } else if (playSelected.length === 0) {
      breakdown.play = 0;
    } else {
      const matches = playSelected.filter((p) => dogPlay.includes(p)).length;
      const ratio = matches / playSelected.length;
      breakdown.play = Math.round(WEIGHTS.play * clamp01(ratio));
    }

    // 2) ENERGY (10)
    {
      const open = fullPointsIfOpen(energyPref, ["any", "flexible", "no_preference"], WEIGHTS.energy);
      if (open != null) breakdown.energy = open;
      else if (!energyPref) breakdown.energy = 0;
      else breakdown.energy = dogEnergy === energyPref ? WEIGHTS.energy : 0;
    }

    // 3) SIZE (15)
    if (hasAnyPreferenceSelected(sizeSelected, ["any"])) {
      breakdown.size = WEIGHTS.size;
    } else if (sizeSelected.length === 0) {
      breakdown.size = 0;
    } else {
      breakdown.size = sizeSelected.includes(dogSize) ? WEIGHTS.size : 0;
    }

    // 4) AGE (10)
    if (hasAnyPreferenceSelected(ageSelected, ["any"])) {
      breakdown.age = WEIGHTS.age;
    } else if (ageSelected.length === 0 || !dogAgeBucket) {
      breakdown.age = 0;
    } else {
      breakdown.age = ageSelected.includes(dogAgeBucket) ? WEIGHTS.age : 0;
    }

    // 5) POTTY (15)
    if (pottyReq === "no_matter") {
      breakdown.potty = WEIGHTS.potty;
    } else if (pottyReq === "preferred") {
      breakdown.potty = dogPotty ? WEIGHTS.potty : Math.round(WEIGHTS.potty * 0.35);
    } else if (pottyReq === "must") {
      breakdown.potty = dogPotty ? WEIGHTS.potty : 0;
    } else {
      breakdown.potty = 0;
    }

    // 6) KIDS (10)
    if (kidsHome === "no") breakdown.kids = WEIGHTS.kids;
    else if (kidsHome === "yes") breakdown.kids = dogKids ? WEIGHTS.kids : 0;
    else breakdown.kids = 0;

    // 7) CATS (10) (kept for compatibility + still useful as standalone)
    if (!catsNeeded) breakdown.cats = WEIGHTS.cats;
    else breakdown.cats = dogCats ? WEIGHTS.cats : 0;

    // 8) FIRST TIME OWNER (5)
    if (firstTime === "no") breakdown.firstTime = WEIGHTS.firstTime;
    else if (firstTime === "yes") {
      breakdown.firstTime = dogFirstTime ? WEIGHTS.firstTime : Math.round(WEIGHTS.firstTime * 0.35);
    } else {
      breakdown.firstTime = 0;
    }

    // 9) ALLERGY (10)
    if (allergy === "no_allergies") breakdown.allergy = WEIGHTS.allergy;
    else if (allergy === "mild_allergies") {
      breakdown.allergy = dogHypo ? WEIGHTS.allergy : Math.round(WEIGHTS.allergy * 0.4);
    } else if (allergy === "have_allergies") {
      breakdown.allergy = dogHypo ? WEIGHTS.allergy : 0;
    } else {
      breakdown.allergy = 0;
    }

    // 10) SHEDDING (10)
    if (hasAnyPreferenceSelected(sheddingSelected, ["no_preference", "any"])) {
      breakdown.shedding = WEIGHTS.shedding;
    } else if (sheddingSelected.length === 0) {
      breakdown.shedding = 0;
    } else {
      if (!dogSheddingRaw) {
        breakdown.shedding = Math.round(WEIGHTS.shedding * 0.5);
      } else {
        const normalized =
          dogSheddingRaw.includes("min") ? "minimal" :
          dogSheddingRaw.includes("mod") ? "moderate" :
          dogSheddingRaw.includes("heavy") ? "heavy_ok" :
          dogSheddingRaw;

        breakdown.shedding = sheddingSelected.includes(normalized) ? WEIGHTS.shedding : 0;
      }
    }

    // =========================
    // ✅ NEW 11) PETS (10)
    // =========================
    // Goal: use when we have data; be neutral if unknown.
    if (petsSelected.length === 0 || petsRequiresNoFiltering(petsSelected)) {
      breakdown.pets = WEIGHTS.pets; // open
    } else {
      // Start at full and subtract for mismatches (more forgiving when dog data missing)
      let score = WEIGHTS.pets;

      // If user needs dog-friendly
      if (dogsNeeded) {
        if (dogGoodWithDogs === false) score -= Math.round(WEIGHTS.pets * 0.6);
        else if (dogGoodWithDogs == null) score -= Math.round(WEIGHTS.pets * 0.15); // slight penalty for unknown
      }

      // If user needs cat-friendly
      if (catsNeeded) {
        if (dogCats === false) score -= Math.round(WEIGHTS.pets * 0.6);
        // dogCats is boolean from existing field; unknown = false only if missing in DB.
        // If you want unknown to be softer, you can change good_with_cats column to allow nulls later.
      }

      // If user needs small-animal safe
      if (smallAnimalsNeeded) {
        if (dogGoodWithSmall === false) score -= Math.round(WEIGHTS.pets * 0.6);
        else if (dogGoodWithSmall == null) score -= Math.round(WEIGHTS.pets * 0.15);
      }

      breakdown.pets = Math.max(0, Math.min(WEIGHTS.pets, score));
    }

    // =========================
    // ✅ NEW 12) NOISE (5)
    // =========================
    // If dog barking_level missing OR user has no pref -> neutral/full
    if (!noisePref || noisePref === "no_pref" || !dogBarking) {
      breakdown.noise = WEIGHTS.noise;
    } else {
      // preference match matrix
      let pts = WEIGHTS.noise;

      if (noisePref === "need_very_quiet") {
        pts = dogBarking === "quiet" ? WEIGHTS.noise : 0;
      } else if (noisePref === "prefer_quiet") {
        pts = dogBarking === "quiet" ? WEIGHTS.noise : (dogBarking === "moderate" ? Math.round(WEIGHTS.noise * 0.6) : 0);
      } else if (noisePref === "some_ok") {
        pts = dogBarking === "vocal" ? Math.round(WEIGHTS.noise * 0.6) : WEIGHTS.noise;
      } else if (noisePref === "alert_ok") {
        pts = dogBarking === "vocal" ? WEIGHTS.noise : Math.round(WEIGHTS.noise * 0.7);
      }

      breakdown.noise = Math.max(0, Math.min(WEIGHTS.noise, pts));
    }

    // =========================
    // ✅ NEW 13) ALONE (5)
    // =========================
    const userHours = mapAloneTimeToHours(aloneTime);
    if (userHours == null || dogMaxAlone == null) {
      // no info -> neutral/full so we don't punish missing shelter data
      breakdown.alone = WEIGHTS.alone;
    } else {
      breakdown.alone = userHours <= dogMaxAlone ? WEIGHTS.alone : 0;
    }

    const rawScore =
      breakdown.play +
      breakdown.energy +
      breakdown.size +
      breakdown.age +
      breakdown.potty +
      breakdown.kids +
      breakdown.cats +
      breakdown.firstTime +
      breakdown.allergy +
      breakdown.shedding +
      breakdown.pets +
      breakdown.noise +
      breakdown.alone;

    const scorePct = TOTAL > 0 ? (rawScore / TOTAL) * 100 : 0;

    return {
      dog,
      rawScore: Number.isFinite(rawScore) ? rawScore : 0,
      scorePct: roundTo(scorePct, 1),
      breakdown,
    };
  });

  ranked.sort((a, b) => {
    const d1 = b.rawScore - a.rawScore;
    if (d1 !== 0) return d1;

    const d2 = (b.scorePct ?? 0) - (a.scorePct ?? 0);
    if (d2 !== 0) return d2;

    const an = normalizeLower(a?.dog?.name);
    const bn = normalizeLower(b?.dog?.name);
    if (an < bn) return -1;
    if (an > bn) return 1;

    const aid = normalizeString(a?.dog?.id);
    const bid = normalizeString(b?.dog?.id);
    if (aid < bid) return -1;
    if (aid > bid) return 1;

    return 0;
  });

  return ranked;
}
