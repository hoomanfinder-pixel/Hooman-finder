// src/lib/matchingLogic.js
// Option A scoring:
// - If user selects "no preference / flexible" for a question,
//   the dog gets FULL points for that question.
// - Unanswered questions do NOT count against a dog.
// - If the user has not answered enough meaningful questions,
//   we do NOT show a fake 0% match. We return scorePct: null.
//
// Exports:
// - computeRankedMatches(dogs, answersById) -> [{ dog, score, scorePct, breakdown }]
// - matchTierFromActivePct(scorePct) -> { label, pillClass }
// - rankDogs(dogs, answersById) for backward compatibility.

const MIN_ANSWERED_FOR_REAL_MATCH = 2;

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

const READABLE_MATCH_REASONS = {
  size_preference: "Matches your preferred size range",
  age_preference: "Fits the age range you selected",
  energy_preference: "Fits your preferred energy level",
  kids_in_home: "May work with your kid/home setup",
  kids_age_band: "May fit your household age needs",
  pets_in_home: "Lines up with your pet preferences",
  potty_requirement: "Fits your potty-training preference",
  allergy_sensitivity: "May fit allergy or shedding needs",
  shedding_preference: "Fits your shedding preference",
  alone_time: "May fit your weekday alone-time schedule",
  dog_social_preference: "Fits your dog-social preference",
  first_time_owner: "May fit your experience level",
  crate_ok: "Fits your crate-training comfort level",
  daily_walk_minutes: "May fit your daily activity routine",
  weekend_activity_style: "May fit your weekend lifestyle",
  play_styles: "May fit your preferred play style",
  training_commitment_level: "Fits your training commitment level",
  reactivity_comfort: "May fit your behavior comfort level",
  behavior_tolerance: "May fit your behavior preferences",
  noise_preference: "May fit your noise preference",
  yard: "May fit your outdoor-space setup",
  stairs: "May fit your stairs situation",
  monthly_pet_budget_range: "May fit your monthly care budget",
  medical_needs_ok: "May fit your medical-needs comfort level",
  medication_comfort: "May fit your medication comfort level",
  housing_type: "May fit your housing setup",
  landlord_restrictions: "May fit your housing restrictions",
  separation_anxiety_willingness: "May fit your alone-time support comfort",
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
 * "No preference" should award full points.
 */
function isNoPreferenceValue(v) {
  if (v === undefined || v === null) return false;

  const tokens = new Set([
    "flexible",
    "no_preference",
    "none",
    "not_sure",
    "unknown",
    "doesnt_matter",
    "does_not_matter",
    "no_matter",
    "varies",
  ]);

  if (Array.isArray(v)) {
    return v.some((x) => tokens.has(String(x).toLowerCase()));
  }

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

function ageBucket(ageYears, ageText = "") {
  const n = Number(ageYears);

  if (Number.isFinite(n)) {
    if (n < 2) return "puppy";
    if (n >= 7) return "senior";
    return "adult";
  }

  const text = String(ageText || "").toLowerCase();

  if (text.includes("puppy")) return "puppy";
  if (text.includes("senior")) return "senior";

  const yearMatch = text.match(/(\d+)\s*year/);
  if (yearMatch) {
    const years = Number(yearMatch[1]);
    if (years < 2) return "puppy";
    if (years >= 7) return "senior";
    return "adult";
  }

  return "unknown";
}

function normalizeEnergy(s) {
  const v = (s ?? "").toString().toLowerCase().trim();
  if (!v) return "";
  if (v.includes("low")) return "low";
  if (v.includes("high")) return "high";
  if (v.includes("moderate")) return "moderate";
  if (v.includes("medium")) return "moderate";
  return v;
}

function normalizeAnswerList(answer) {
  if (Array.isArray(answer)) return answer.map((x) => String(x).toLowerCase());
  if (isEmptyAnswer(answer)) return [];
  return [String(answer).toLowerCase()];
}

function truthy(v) {
  if (v === true) return true;
  const s = String(v ?? "").toLowerCase().trim();
  if (!s) return false;
  return s === "true" || s === "yes" || s === "y" || s === "1";
}

function labelFor(qid) {
  return READABLE_MATCH_REASONS[qid] ?? prettifyId(qid);
}

function prettifyId(id) {
  return String(id)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * Basic question scoring.
 * Returns { earned, possible, reasonLabel, matchedBool }
 */
function scoreQuestion(qid, answer, dog) {
  const weight = w(qid);

  if (isEmptyAnswer(answer)) {
    return { earned: 0, possible: 0, reasonLabel: null, matched: null };
  }

  if (isNoPreferenceValue(answer)) {
    return {
      earned: weight,
      possible: weight,
      reasonLabel: labelFor(qid),
      matched: true,
    };
  }

  let matched = false;

  switch (qid) {
    case "size_preference": {
      const dogSize = normalizeSize(dog?.size);
      const picks = normalizeAnswerList(answer);
      matched = Boolean(dogSize && picks.includes(dogSize));
      break;
    }

    case "age_preference": {
      const dogAge = ageBucket(dog?.age_years, dog?.age_text);
      const picks = normalizeAnswerList(answer);
      matched = Boolean(dogAge && dogAge !== "unknown" && picks.includes(dogAge));
      break;
    }

    case "energy_preference": {
      const dogEnergy = normalizeEnergy(dog?.energy_level ?? dog?.energy);
      const userEnergy = normalizeEnergy(answer);
      matched = Boolean(dogEnergy && userEnergy && dogEnergy === userEnergy);
      break;
    }

    case "kids_in_home": {
      const a = String(answer).toLowerCase();
      const dogKids =
        dog?.good_with_kids ??
        dog?.kids_ok ??
        dog?.kid_friendly ??
        dog?.goodWithKids ??
        null;

      if (a === "yes" || a === "kids" || a === "children") {
        matched = truthy(dogKids);
      } else {
        matched = true;
      }
      break;
    }

    case "pets_in_home": {
      const picks = normalizeAnswerList(answer);
      let ok = true;

      if (picks.includes("dogs")) {
        ok = ok && truthy(dog?.good_with_dogs ?? dog?.dogs_ok ?? dog?.goodWithDogs);
      }

      if (picks.includes("cats")) {
        ok = ok && truthy(dog?.good_with_cats ?? dog?.cats_ok ?? dog?.goodWithCats);
      }

      if (picks.includes("small_pets") || picks.includes("small_animals")) {
        ok =
          ok &&
          truthy(
            dog?.good_with_small_animals ??
              dog?.good_with_small_pets ??
              dog?.small_pets_ok
          );
      }

      matched = ok;
      break;
    }

    case "potty_requirement": {
      const a = String(answer).toLowerCase();
      const dogPotty = dog?.potty_trained ?? dog?.house_trained ?? dog?.houseTrained ?? null;

      if (a === "must_be_trained" || a === "required" || a === "must") {
        matched = truthy(dogPotty);
      } else {
        matched = true;
      }
      break;
    }

    case "allergy_sensitivity": {
      const a = String(answer).toLowerCase();
      const hypo = dog?.hypoallergenic ?? dog?.hypoallergenic_only ?? dog?.is_hypoallergenic ?? null;
      const shedding = (dog?.shedding ?? dog?.shedding_level ?? "").toString().toLowerCase();

      if (
        a === "needs_low_shedding" ||
        a === "have_allergies" ||
        a === "allergies"
      ) {
        matched = truthy(hypo) || shedding === "minimal" || shedding === "low";
      } else {
        matched = true;
      }
      break;
    }

    case "shedding_preference": {
      const a = String(answer).toLowerCase();
      const shedding = (dog?.shedding ?? dog?.shedding_level ?? "").toString().toLowerCase();

      if (!shedding) {
        matched = false;
      } else if (a === "heavy_ok" || a === "no_preference") {
        matched = true;
      } else {
        matched = shedding === a;
      }
      break;
    }

    default: {
      // Questions we don't have dog-side data for yet are treated as neutral-positive
      // only after the user answers them. This keeps scoring from feeling punishing.
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

function countAnsweredQuestions(answersById) {
  if (!answersById || typeof answersById !== "object") return 0;

  return Object.values(answersById).filter((answer) => !isEmptyAnswer(answer)).length;
}

export function matchTierFromActivePct(scorePct) {
  const p = Number(scorePct);

  if (!Number.isFinite(p)) {
    return {
      label: "Quiz needed",
      pillClass: "bg-white text-stone-950",
    };
  }

  if (p >= 85) {
    return {
      label: "Strong match",
      pillClass: "bg-emerald-700 text-white",
    };
  }

  if (p >= 70) {
    return {
      label: "Good match",
      pillClass: "bg-indigo-600 text-white",
    };
  }

  return {
    label: "Potential match",
    pillClass: "bg-gray-800 text-white",
  };
}

/**
 * Returns:
 * [{ dog, score, scorePct, breakdown }]
 *
 * scorePct is percent from active questions only:
 *   scorePct = (earned / possible) * 100
 *
 * If there are not enough active answers, scorePct is null.
 * This prevents the UI from displaying fake/harsh "0% match" labels.
 */
export function computeRankedMatches(dogs, answersById) {
  const dogList = Array.isArray(dogs) ? dogs : [];
  const questionIds = Object.keys(WEIGHTS);
  const answeredCount = countAnsweredQuestions(answersById);
  const hasEnoughQuizInfo = answeredCount >= MIN_ANSWERED_FOR_REAL_MATCH;

  const rows = dogList.map((dog) => {
    let earned = 0;
    let possible = 0;

    const reasons = [];

    for (const qid of questionIds) {
      const ans = answersById?.[qid];
      const r = scoreQuestion(qid, ans, dog);

      earned += r.earned;
      possible += r.possible;

      if (r.possible > 0 && r.reasonLabel) {
        reasons.push({
          key: qid,
          label: r.reasonLabel,
          matched: r.matched === true,
          weight: w(qid),
        });
      }
    }

    const meaningfulScoreAvailable = hasEnoughQuizInfo && possible > 0;
    const scorePct = meaningfulScoreAvailable ? Math.round((earned / possible) * 100) : null;

    const top = meaningfulScoreAvailable
      ? reasons
          .filter((r) => r.matched)
          .slice()
          .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
          .slice(0, 4)
          .map((r) => r.label)
      : [];

    const tier = matchTierFromActivePct(scorePct);

    return {
      dog,
      score: earned,
      scorePct,
      breakdown: {
        scorePct,
        tierLabel: tier.label,
        topReasons: top,
        answeredCount,
        possible,
        enoughQuizInfo: meaningfulScoreAvailable,
        emptyReason:
          answeredCount === 0
            ? "no_quiz_answers"
            : !hasEnoughQuizInfo
              ? "too_few_quiz_answers"
              : possible <= 0
                ? "no_active_match_fields"
                : null,
      },
    };
  });

  rows.sort((a, b) => {
    const aPct = Number.isFinite(Number(a.scorePct)) ? Number(a.scorePct) : -1;
    const bPct = Number.isFinite(Number(b.scorePct)) ? Number(b.scorePct) : -1;

    if (bPct !== aPct) return bPct - aPct;
    if (b.score !== a.score) return b.score - a.score;

    return String(a.dog?.name ?? "").localeCompare(String(b.dog?.name ?? ""));
  });

  return rows;
}

/**
 * Backward compat.
 */
export function rankDogs(dogs, answersById) {
  const rows = computeRankedMatches(dogs, answersById);

  return rows.map((r) => {
    const tier = matchTierFromActivePct(r.scorePct);
    const label = tier.label.toLowerCase();

    let match_level = "potential";
    if (label.includes("strong") || label.includes("great")) match_level = "strong";
    else if (label.includes("good")) match_level = "good";
    else if (label.includes("quiz")) match_level = "quiz_needed";

    return {
      ...r.dog,
      scorePct: r.scorePct,
      match_level,
      breakdown: r.breakdown,
    };
  });
}