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
// Returns a cleaned array of strings (original casing preserved unless caller lowercases)
function toArrayFlexible(v) {
  if (Array.isArray(v)) return v.filter((x) => x != null && String(x).trim() !== "").map(String);

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    // If it looks like "a,b,c" split; if it's a single token, keep as one.
    const parts = s.includes(",") ? s.split(",") : [s];
    return parts.map((p) => p.trim()).filter(Boolean);
  }

  if (v == null) return [];
  // fallback: treat as single value
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
  const ageSelected = toArrayFlexible(a.age_preference).map((x) => normalizeLower(x)); // keep bucket strings
  const pottyReq = normalizeLower(a.potty_requirement);
  const kidsHome = normalizeLower(a.kids_in_home);
  const catsHome = normalizeLower(a.cats_in_home);
  const firstTime = normalizeLower(a.first_time_owner);
  const allergy = normalizeLower(a.allergy_sensitivity);
  const sheddingSelected = toLowerArray(a.shedding_levels);

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

    // 3) SIZE (15) multi
    if (hasAnyPreferenceSelected(sizeSelected, ["any"])) {
      breakdown.size = WEIGHTS.size;
    } else if (sizeSelected.length === 0) {
      breakdown.size = 0;
    } else {
      breakdown.size = sizeSelected.includes(dogSize) ? WEIGHTS.size : 0;
    }

    // 4) AGE (10) multi
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

    // 7) CATS (10)
    if (catsHome === "no") breakdown.cats = WEIGHTS.cats;
    else if (catsHome === "yes") breakdown.cats = dogCats ? WEIGHTS.cats : 0;
    else breakdown.cats = 0;

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

    // 10) SHEDDING (10) multi
    if (hasAnyPreferenceSelected(sheddingSelected, ["no_preference", "any"])) {
      breakdown.shedding = WEIGHTS.shedding;
    } else if (sheddingSelected.length === 0) {
      breakdown.shedding = 0;
    } else {
      // If dog shedding missing, partial credit (don’t hard-fail on incomplete data)
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
      breakdown.shedding;

    const scorePct = TOTAL > 0 ? (rawScore / TOTAL) * 100 : 0;

    return {
      dog,
      rawScore: Number.isFinite(rawScore) ? rawScore : 0,
      scorePct: roundTo(scorePct, 1),
      breakdown,
    };
  });

  // Stable/deterministic sort:
  // 1) rawScore desc
  // 2) scorePct desc
  // 3) name asc
  // 4) id asc
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
