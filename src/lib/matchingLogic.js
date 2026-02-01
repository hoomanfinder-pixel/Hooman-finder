// src/lib/matchingLogic.js
// Option A scoring:
// - If user selects "no preference / flexible" for a question,
//   the dog gets FULL points for that question.
// - Unanswered questions do NOT count against a dog (they do not add to max points).
//
// Exports:
// - computeRankedMatches(dogs, answersById) -> [{ dog, score, scorePct, breakdown }]
// - matchTierFromActivePct(scorePct) -> { label, pillClass }
// Also exports rankDogs for backward compatibility (older Results pages).

const WEIGHTS = {
  // Dealbreakers (heavier)
  size_preference: 3,
  age_preference: 3,
  kids_in_home: 3,
  kids_age_band: 2,
  pets_in_home: 3,
  potty_requirement: 3,
  separation_anxiety_willingness: 2,

  // Refine (lighter)
  dog_social_preference: 2,
  first_time_owner: 1,
  crate_ok: 1,
  daily_walk_minutes: 1,
  weekend_activity_style: 1,
  energy_preference: 2,
  play_styles: 1,
  training_commitment_level: 1,
  reactivity_comfort: 1,
  behavior_tolerance: 1,
  noise_preference: 1,
  yard: 1,
  stairs: 1,
  allergy_sensitivity: 2,
  shedding_preference: 1,
  monthly_pet_budget_range: 1,
  medical_needs_ok: 1,
  medication_comfort: 1,
  housing_type: 1,
  landlord_restrictions: 1,
  alone_time: 2,
};

function w(id) {
  return WEIGHTS[id] ?? 1;
}

function isEmptyAnswer(v) {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "string") return v.trim().length === 0;
  return false;
}

/**
 * "No preference" should award full points (Option A).
 * We treat these values as "auto-match" tokens.
 */
function isNoPreferenceValue(v) {
  if (v === undefined || v === null) return false;

  const tokens = new Set([
    "flexible",
    "no_preference",
    "none", // used in some multi questions like "No other animals / not important"
    "not_sure",
    "unknown",
  ]);

  if (Array.isArray(v)) return v.some((x) => tokens.has(String(x).toLowerCase()));
  return tokens.has(String(v).toLowerCase());
}

function normalizeSize(s) {
  const v = (s ?? "").toString().toLowerCase().trim();
  if (!v) return "";
  if (v.includes("extra")) return "extra_large";
  if (v === "xl") return "extra_large";
  if (v.includes("medium")) return "medium";
  if (v.includes("large")) return "large";
  if (v.includes("small")) return "small";
  return v;
}

function ageBucket(ageYears) {
  const n = Number(ageYears);
  if (!Number.isFinite(n)) return "unknown";
  if (n <= 1) return "puppy";
  if (n >= 7) return "senior";
  return "adult";
}

function normalizeEnergy(s) {
  const v = (s ?? "").toString().toLowerCase().trim();
  if (!v) return "";
  if (v.includes("low")) return "low";
  if (v.includes("high")) return "high";
  if (v.includes("moderate")) return "moderate";
  return v;
}

/**
 * Basic question scoring
 * Returns { earned, possible, reasonLabel, matchedBool }
 */
function scoreQuestion(qid, answer, dog) {
  const weight = w(qid);

  // If unanswered: don't count it at all
  if (isEmptyAnswer(answer)) {
    return { earned: 0, possible: 0, reasonLabel: null, matched: null };
  }

  // Option A: "no preference" => full points
  if (isNoPreferenceValue(answer)) {
    return { earned: weight, possible: weight, reasonLabel: labelFor(qid), matched: true };
  }

  // Otherwise: score based on known rules per question id
  let matched = false;

  switch (qid) {
    case "size_preference": {
      // answer is multi: ["small","medium"...] (no flexible here if handled above)
      const dogSize = normalizeSize(dog?.size);
      if (!dogSize) matched = false;
      else {
        const picks = Array.isArray(answer) ? answer.map(String) : [String(answer)];
        matched = picks.map((x) => x.toLowerCase()).includes(dogSize);
      }
      break;
    }

    case "age_preference": {
      const dogAge = ageBucket(dog?.age_years);
      const picks = Array.isArray(answer) ? answer.map(String) : [String(answer)];
      matched = picks.map((x) => x.toLowerCase()).includes(dogAge);
      break;
    }

    case "energy_preference": {
      const dogEnergy = normalizeEnergy(dog?.energy);
      matched = dogEnergy ? String(answer).toLowerCase() === dogEnergy : false;
      break;
    }

    case "kids_in_home": {
      // user answers about THEIR home; dog has "good_with_kids" bool-ish or "kids_ok" or text.
      // We'll treat "yes" as requiring dog good with kids.
      const a = String(answer).toLowerCase();
      const dogKids =
        dog?.good_with_kids ??
        dog?.kids_ok ??
        dog?.kid_friendly ??
        dog?.goodWithKids ??
        null;

      if (a === "yes") matched = truthy(dogKids);
      else if (a === "no") matched = true; // if no kids, any dog is fine
      else matched = true; // "sometimes/visiting" treated as ok
      break;
    }

    case "pets_in_home": {
      // multi: dogs/cats/small_pets
      // Require dog compatibility flags if present.
      const picks = Array.isArray(answer) ? answer.map((x) => String(x).toLowerCase()) : [];
      let ok = true;

      if (picks.includes("dogs")) ok = ok && truthy(dog?.good_with_dogs ?? dog?.dogs_ok ?? dog?.goodWithDogs);
      if (picks.includes("cats")) ok = ok && truthy(dog?.good_with_cats ?? dog?.cats_ok ?? dog?.goodWithCats);
      if (picks.includes("small_pets")) ok = ok && truthy(dog?.good_with_small_pets ?? dog?.small_pets_ok);

      matched = ok;
      break;
    }

    case "potty_requirement": {
      // If user requires trained, dog must be trained.
      const a = String(answer).toLowerCase();
      const dogPotty = dog?.potty_trained ?? dog?.house_trained ?? dog?.houseTrained ?? null;

      if (a === "must_be_trained") matched = truthy(dogPotty);
      else matched = true; // preferred => not a blocker
      break;
    }

    case "allergy_sensitivity": {
      // If user needs hypoallergenic/low shedding, dog must be low shedding/hypo if present
      const a = String(answer).toLowerCase();
      const hypo = dog?.hypoallergenic ?? dog?.hypoallergenic_only ?? dog?.is_hypoallergenic ?? null;
      const shedding = (dog?.shedding ?? dog?.shedding_level ?? "").toString().toLowerCase();

      if (a === "needs_low_shedding") matched = truthy(hypo) || shedding === "minimal" || shedding === "low";
      else matched = true;
      break;
    }

    case "shedding_preference": {
      const a = String(answer).toLowerCase();
      const shedding = (dog?.shedding ?? dog?.shedding_level ?? "").toString().toLowerCase();
      if (!shedding) matched = false;
      else {
        // minimal/moderate/heavy_ok
        if (a === "heavy_ok") matched = true;
        else matched = shedding === a;
      }
      break;
    }

    default: {
      // For any question we don't have a rule for yet:
      // treat answered-but-not-understood as "neutral-positive" (don’t punish hard)
      // but still not auto-full points.
      matched = true;
      break;
    }
  }

  return {
    earned: matched ? weight : 0,
    possible: weight,
    reasonLabel: labelFor(qid),
    matched,
  };
}

function labelFor(qid) {
  // Keep labels short for the hover box.
  const map = {
    size_preference: "Size",
    age_preference: "Age",
    energy_preference: "Energy",
    kids_in_home: "Kids",
    pets_in_home: "Other pets",
    potty_requirement: "Potty training",
    allergy_sensitivity: "Allergies",
    shedding_preference: "Shedding",
    alone_time: "Alone time",
  };
  return map[qid] ?? prettifyId(qid);
}

function prettifyId(id) {
  return String(id)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function truthy(v) {
  if (v === true) return true;
  const s = String(v ?? "").toLowerCase().trim();
  if (!s) return false;
  return s === "true" || s === "yes" || s === "y" || s === "1";
}

export function matchTierFromActivePct(scorePct) {
  const p = Number(scorePct);
  if (!Number.isFinite(p)) return { label: "Potential match", pillClass: "bg-gray-800 text-white" };

  if (p >= 80) return { label: "Strong match", pillClass: "bg-emerald-700 text-white" };
  if (p >= 60) return { label: "Good match", pillClass: "bg-indigo-600 text-white" };
  return { label: "Potential match", pillClass: "bg-gray-800 text-white" };
}

/**
 * Returns:
 * [{ dog, score, scorePct, breakdown }]
 *
 * scorePct is percent from active questions only:
 *   scorePct = (earned / possible) * 100
 * where "possible" includes answered questions,
 * and "no preference" counts as answered AND full points (Option A).
 */
export function computeRankedMatches(dogs, answersById) {
  const dogList = Array.isArray(dogs) ? dogs : [];

  const questionIds = Object.keys(WEIGHTS);

  const rows = dogList.map((dog) => {
    let earned = 0;
    let possible = 0;

    const reasons = [];

    for (const qid of questionIds) {
      const ans = answersById?.[qid];
      const r = scoreQuestion(qid, ans, dog);

      earned += r.earned;
      possible += r.possible;

      // Track reasons for hover box (only if this question is active/answered)
      if (r.possible > 0 && r.reasonLabel) {
        reasons.push({
          key: qid,
          label: r.reasonLabel,
          matched: r.matched === true,
          weight: w(qid),
        });
      }
    }

    const scorePct = possible > 0 ? Math.round((earned / possible) * 100) : 0;

    // Build "Top reasons" list:
    // prefer matched reasons first, then by weight desc.
    const top = reasons
      .slice()
      .sort((a, b) => {
        if (a.matched !== b.matched) return a.matched ? -1 : 1;
        return (b.weight ?? 0) - (a.weight ?? 0);
      })
      .slice(0, 3)
      .map((r) => r.label);

    const tier = matchTierFromActivePct(scorePct);

    return {
      dog,
      score: earned,
      scorePct,
      breakdown: {
        scorePct,
        tierLabel: tier.label,
        topReasons: top,
      },
    };
  });

  // Sort best -> worst
  rows.sort((a, b) => {
    // primary: scorePct
    if (b.scorePct !== a.scorePct) return b.scorePct - a.scorePct;
    // secondary: earned (in case same pct)
    if (b.score !== a.score) return b.score - a.score;
    // tertiary: name
    return String(a.dog?.name ?? "").localeCompare(String(b.dog?.name ?? ""));
  });

  return rows;
}

/**
 * Backward compat (if any older code still calls rankDogs)
 * Returns dogs decorated with match_level + scorePct, sorted.
 */
export function rankDogs(dogs, answersById) {
  const rows = computeRankedMatches(dogs, answersById);
  return rows.map((r) => {
    const tier = matchTierFromActivePct(r.scorePct);
    const label = tier.label.toLowerCase();
    let match_level = "potential";
    if (label.includes("strong") || label.includes("great")) match_level = "strong";
    else if (label.includes("good")) match_level = "good";

    return {
      ...r.dog,
      scorePct: r.scorePct,
      match_level,
      breakdown: r.breakdown,
    };
  });
}
