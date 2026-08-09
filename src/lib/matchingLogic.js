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
const CONFIRMED_COMPATIBILITY_CONFLICT_CAP = 49;
const LIMITED_INFORMATION_COVERAGE_PCT = 60;

const WEIGHTS = {
  // Only fields with real dog-side comparison logic belong here.
  size_preference: 3,
  age_preference: 3,
  kids_in_home: 3,
  pets_in_home: 3,
  potty_requirement: 3,
  first_time_owner: 1,
  energy_preference: 2,
  allergy_sensitivity: 2,
  shedding_preference: 1,
  alone_time: 2,
  yard: 3,
};

const DEFAULT_AI_CONFIDENCE = 0.35;
const BIO_EXPLICIT_STRENGTH = 0.6;
const PROFILE_INFERENCE_STRENGTH = 0.2;

const READABLE_MATCH_REASONS = {
  size_preference: "Matches your preferred size range",
  age_preference: "Fits the age range you selected",
  energy_preference: "Fits your preferred energy level",
  kids_in_home: "May work with your kid/home setup",
  pets_in_home: "Lines up with your pet preferences",
  potty_requirement: "Fits your potty-training preference",
  allergy_sensitivity: "May fit allergy or shedding needs",
  shedding_preference: "Fits your shedding preference",
  alone_time: "May fit your weekday alone-time schedule",
  first_time_owner: "May fit your experience level",
  yard: "May fit your yard access",
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
// rows (e.g. a raw month count stored as whole years). When the two disagree
// by more than half a year, the unit-aware text parse is preferred.
function resolveTrustworthyAgeYears(ageYears, ageText) {
  const hasRawAge = ageYears !== null && ageYears !== undefined && String(ageYears).trim() !== "";
  const raw = Number(ageYears);
  const parsed = parsedAgeYearsFromText(ageText);

  if (parsed === null) return hasRawAge && Number.isFinite(raw) ? raw : null;
  if (!hasRawAge || !Number.isFinite(raw)) return parsed;
  if (Math.abs(raw - parsed) > 0.5) return parsed;

  return raw;
}

function ageBucket(ageYears, ageText = "") {
  const n = resolveTrustworthyAgeYears(ageYears, ageText);

  if (Number.isFinite(n)) {
    if (n < 2) return "puppy";
    if (n >= 7) return "senior";
    return "adult";
  }

  const text = String(ageText || "").toLowerCase();

  if (text.includes("puppy")) return "puppy";
  if (text.includes("senior")) return "senior";

  return "unknown";
}

function normalizeEnergy(s) {
  const v = (s ?? "").toString().toLowerCase().trim().replace(/\s+/g, "_").replace(/-/g, "_");
  if (!v) return "";
  if (["low", "medium_low", "medium", "medium_high", "high"].includes(v)) return v;
  if (v.includes("moderate")) return "medium";
  if (v.includes("medium") && v.includes("low")) return "medium_low";
  if (v.includes("medium") && v.includes("high")) return "medium_high";
  if (v.includes("low")) return "low";
  if (v.includes("high")) return "high";
  if (v.includes("medium")) return "medium";
  return v;
}

function normalizeShedding(s) {
  const v = (s ?? "").toString().toLowerCase().trim().replace(/\s+/g, "_").replace(/-/g, "_");
  if (!v || v === "unknown") return "";
  if (["low", "medium", "high"].includes(v)) return v;
  if (v === "none" || v === "minimal" || v === "very_low") return "low";
  if (v === "moderate" || v === "average") return "medium";
  if (v === "heavy" || v === "very_high") return "high";
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

function falsy(v) {
  if (v === false) return true;
  const s = String(v ?? "").toLowerCase().trim();
  return s === "false" || s === "no" || s === "n" || s === "0";
}

function aiConfidence(dog) {
  const n = Number(dog?.ai_confidence_score);
  if (Number.isFinite(n) && n >= 0) return Math.max(0, Math.min(1, n));
  return DEFAULT_AI_CONFIDENCE;
}

function parseAiTraits(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function aiEvidenceForField(dog, field) {
  const traits = parseAiTraits(dog?.ai_traits);
  const traitKey = field === "max_alone_hours" ? "max_alone_hours_estimate" : field;
  const trait = traits?.[traitKey];
  const traitConfidence = Number(traits?.[traitKey]?.confidence);
  let confidence = Number.isFinite(traitConfidence)
    ? Math.max(0, Math.min(1, traitConfidence))
    : aiConfidence(dog);

  if (dog?.needs_human_review === true || traits?.needs_human_review === true) {
    confidence = Math.min(confidence, 0.35);
  }

  // Legacy traits did not store machine-readable provenance. They must remain
  // conservative until a future enrichment run explicitly classifies them.
  const evidenceBasis =
    trait?.evidence_basis === "bio_explicit" ? "bio_explicit" : "profile_inference";

  return {
    confidence,
    evidenceBasis,
    strength:
      (evidenceBasis === "bio_explicit" ? BIO_EXPLICIT_STRENGTH : PROFILE_INFERENCE_STRENGTH) *
      confidence,
  };
}

function bioBaseTraitCredit(value) {
  const normalized = String(value ?? "").toLowerCase().trim();
  if (normalized === "yes") return 1;
  if (normalized === "most_likely") return 0.9;
  if (normalized === "may_do_well") return 0.5;
  if (normalized === "no") return 0;
  return null;
}

function aiTraitCredit(dog, field, rawCredit) {
  if (rawCredit === null || rawCredit === undefined) return null;

  const raw = Math.max(0, Math.min(1, Number(rawCredit)));
  if (!Number.isFinite(raw)) return null;

  const { strength } = aiEvidenceForField(dog, field);
  if (strength <= 0) return null;
  return 0.5 + strength * (raw - 0.5);
}

function compatibilityCredit(dog, field, confirmedValue, bioValue) {
  if (confirmedValue === true || truthy(confirmedValue)) return 1;
  if (confirmedValue === false || falsy(confirmedValue)) return 0;

  const base = bioBaseTraitCredit(bioValue);
  return aiTraitCredit(dog, field, base);
}

function confirmedYardRequirementType(dog) {
  const fence = String(dog?.fence_needs ?? "").toLowerCase().trim();
  const fenceNotRequired = !fence || /\b(no|none|not required|optional|unknown)\b/.test(fence);

  // RescueGroups fenceNeeds values such as "3 foot" or "Any Type" are an
  // explicit fence specification even when they do not contain "required".
  if (!fenceNotRequired) return "fenced_yard";
  if (dog?.yard_required === true || truthy(dog?.yard_required)) return "yard";
  return null;
}

function isConfirmedYardRequirement(dog) {
  return confirmedYardRequirementType(dog) !== null;
}

function yardCredit(dog, answer) {
  const hasYard = String(answer ?? "").toLowerCase() === "yes";
  if (isConfirmedYardRequirement(dog)) return hasYard ? 1 : 0;

  const traits = parseAiTraits(dog?.ai_traits);
  const value = String(traits?.needs_yard?.value ?? "").toLowerCase();
  if (!["true", "likely", "maybe"].includes(value)) return null;

  return aiTraitCredit(dog, "needs_yard", hasYard ? 1 : 0);
}

function energyCreditForValues(userEnergy, dogEnergy) {
  const order = ["low", "medium_low", "medium", "medium_high", "high"];
  const userIndex = order.indexOf(userEnergy);
  const dogIndex = order.indexOf(dogEnergy);
  if (userIndex < 0 || dogIndex < 0) return null;

  const distance = Math.abs(userIndex - dogIndex);
  if (distance === 0) return 1;
  if (distance === 1) return 0.65;
  if (distance === 2) return 0.25;
  return 0;
}

function energyCredit(dog, confirmedEnergy, bioEnergy) {
  const userEnergy = normalizeEnergy(confirmedEnergy.user);
  const confirmedDogEnergy = normalizeEnergy(confirmedEnergy.dog);
  const bioDogEnergy = normalizeEnergy(bioEnergy);

  if (!userEnergy) return null;
  if (confirmedDogEnergy) return energyCreditForValues(userEnergy, confirmedDogEnergy);

  const base = energyCreditForValues(userEnergy, bioDogEnergy);
  return aiTraitCredit(dog, "energy_level", base);
}

function sheddingCredit(dog, preference) {
  const a = String(preference).toLowerCase();
  const confirmed = normalizeShedding(dog?.shedding ?? dog?.shedding_level);
  const bio = normalizeShedding(dog?.bio_shedding_level);

  if (a === "heavy_ok" || a === "no_preference") return 1;

  const target = normalizeShedding(a);
  if (!target) return null;

  if (confirmed) {
    if (target === "low") return confirmed === "low" ? 1 : confirmed === "medium" ? 0.35 : 0;
    return confirmed === target ? 1 : 0;
  }

  if (!bio) return null;
  const base = target === "low" ? (bio === "low" ? 1 : bio === "medium" ? 0.35 : 0) : bio === target ? 1 : 0;
  return aiTraitCredit(dog, "shedding_level", base);
}

function aloneTimeNeededHours(answer) {
  const a = String(answer).toLowerCase();
  if (a === "lt4" || a === "1to2" || a === "1-2") return 2;
  if (a === "4_6" || a === "4to6" || a === "3to4" || a === "3-4") return 4;
  if (a === "6_8" || a === "6to8" || a === "5to6" || a === "5-6") return 6;
  if (a === "8_plus" || a === "gt8" || a === "7to8" || a === "7-8") return 8;
  return null;
}

function aloneTimeCredit(dog, answer) {
  const needed = aloneTimeNeededHours(answer);
  if (!needed) return null;

  const confirmed = Number(dog?.max_alone_hours);
  if (Number.isFinite(confirmed) && confirmed > 0) return confirmed >= needed ? 1 : confirmed >= needed - 2 ? 0.45 : 0;

  const bio = Number(dog?.bio_max_alone_hours);
  if (!Number.isFinite(bio) || bio <= 0) return null;

  const base = bio >= needed ? 1 : bio >= needed - 2 ? 0.45 : 0;
  return aiTraitCredit(dog, "max_alone_hours", base);
}

function pushUnique(arr, msg) {
  if (!msg) return;
  if (!arr.includes(msg)) arr.push(msg);
}

function positiveCompatibilityEvidence(dog, field, confirmedValue, bioValue) {
  if (confirmedValue === true || truthy(confirmedValue)) return "listed";
  if (falsy(confirmedValue)) return "";

  const bio = String(bioValue ?? "").toLowerCase().trim();
  const credit = aiTraitCredit(dog, field, bioBaseTraitCredit(bio));
  if ((bio === "yes" || bio === "most_likely" || bio === "may_do_well") && credit > 0.5) {
    return "estimated";
  }
  return "";
}

function estimatedEvidencePhrase(dog, field, bioPhrase, profilePhrase) {
  return aiEvidenceForField(dog, field).evidenceBasis === "bio_explicit"
    ? bioPhrase
    : profilePhrase;
}

function buildSupportedMatchReasons(dog, answersById, limit = 4) {
  if (!dog || !answersById) return [];

  const reasons = [];

  const sizePrefs = normalizeAnswerList(answersById.size_preference).map(normalizeSize);
  const dogSize = normalizeSize(dog?.size);
  if (!sizePrefs.includes("flexible") && sizePrefs.length && dogSize && sizePrefs.includes(dogSize)) {
    pushUnique(reasons, `Fits your preferred size (${dog.size})`);
  } else {
    const bioDogSize = normalizeSize(dog?.bio_size);
    if (!sizePrefs.includes("flexible") && sizePrefs.length && bioDogSize && sizePrefs.includes(bioDogSize)) {
      pushUnique(reasons, `AI profile estimate suggests adult size may fit (likely ${dog.bio_size})`);
    }
  }

  const agePrefs = normalizeAnswerList(answersById.age_preference);
  const dogAge = ageBucket(dog?.age_years, dog?.age_text);
  if (!agePrefs.includes("flexible") && agePrefs.length && dogAge !== "unknown" && agePrefs.includes(dogAge)) {
    const label = dogAge === "puppy" ? "puppy" : dogAge === "adult" ? "adult" : "senior";
    pushUnique(reasons, `Age matches what you’re looking for (${label})`);
  }

  const userEnergy = normalizeEnergy(answersById.energy_preference);
  const dogEnergy = normalizeEnergy(dog?.energy_level ?? dog?.activity_level ?? dog?.energy);
  if (userEnergy && dogEnergy && userEnergy === dogEnergy) {
    pushUnique(reasons, `Energy level matches what you want (${dog.energy_level ?? dog.activity_level ?? dog.energy})`);
  }

  const kids = normalizeAnswerList(answersById.kids_in_home);
  const hasKidsNeed = kids.some((pick) =>
    ["yes", "kids", "children", "sometimes", "visiting", "children_visit", "under_3", "3_5", "6_9", "10_12", "13_plus"].includes(pick)
  );
  if (hasKidsNeed) {
    const evidence = positiveCompatibilityEvidence(
      dog,
      "good_with_kids",
      dog?.good_with_kids ?? dog?.kids_ok ?? dog?.kid_friendly ?? dog?.goodWithKids,
      dog?.bio_good_with_kids
    );
    if (evidence === "listed") pushUnique(reasons, "Listed as compatible with children");
    if (evidence === "estimated") pushUnique(
      reasons,
      estimatedEvidencePhrase(
        dog,
        "good_with_kids",
        "Listing bio interpretation suggests this dog may do well with children",
        "AI profile estimate cautiously suggests this dog may do well with children"
      )
    );
  }

  const pets = normalizeAnswerList(answersById.pets_in_home);
  if (pets.includes("dogs")) {
    const evidence = positiveCompatibilityEvidence(
      dog,
      "good_with_dogs",
      dog?.good_with_dogs ?? dog?.dogs_ok ?? dog?.goodWithDogs,
      dog?.bio_good_with_dogs
    );
    if (evidence === "listed") pushUnique(reasons, "Listed as compatible with other dogs");
    if (evidence === "estimated") pushUnique(
      reasons,
      estimatedEvidencePhrase(
        dog,
        "good_with_dogs",
        "Listing bio interpretation suggests this dog may do well with another dog",
        "AI profile estimate cautiously suggests this dog may do well with another dog"
      )
    );
  }
  if (pets.includes("cats")) {
    const evidence = positiveCompatibilityEvidence(
      dog,
      "good_with_cats",
      dog?.good_with_cats ?? dog?.cats_ok ?? dog?.goodWithCats,
      dog?.bio_good_with_cats
    );
    if (evidence === "listed") pushUnique(reasons, "Listed as compatible with cats");
    if (evidence === "estimated") pushUnique(
      reasons,
      estimatedEvidencePhrase(
        dog,
        "good_with_cats",
        "Listing bio interpretation suggests this dog may do well with cats",
        "AI profile estimate cautiously suggests this dog may do well with cats"
      )
    );
  }
  if ((pets.includes("small_animals") || pets.includes("small_pets")) && dog?.good_with_small_animals === true) {
    pushUnique(reasons, "Listed as okay with small animals");
  }

  const neededAlone = aloneTimeNeededHours(answersById.alone_time);
  const confirmedAlone = Number(dog?.max_alone_hours);
  const bioAlone = Number(dog?.bio_max_alone_hours);
  if (neededAlone && Number.isFinite(confirmedAlone) && confirmedAlone > 0) {
    if (confirmedAlone >= neededAlone) {
      pushUnique(reasons, "Listed alone-time capacity fits your weekday routine");
    }
  } else if (
    neededAlone &&
    Number.isFinite(bioAlone) &&
    bioAlone > 0 &&
    bioAlone >= neededAlone &&
    aiTraitCredit(dog, "max_alone_hours", 1) > 0.5
  ) {
    pushUnique(
      reasons,
      estimatedEvidencePhrase(
        dog,
        "max_alone_hours",
        "Listing bio interpretation suggests the alone time may fit your weekday routine",
        "AI profile estimate suggests the alone time may fit your weekday routine"
      )
    );
  }

  const allergy = String(answersById.allergy_sensitivity ?? "").toLowerCase();
  if ((allergy === "have_allergies" || allergy === "needs_low_shedding") && dog?.hypoallergenic === true) {
    pushUnique(reasons, "Better fit for allergy-sensitive homes");
  }

  return reasons.slice(0, limit);
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
  let credit = null;

  switch (qid) {
    case "size_preference": {
      const picks = normalizeAnswerList(answer);
      const dogSize = normalizeSize(dog?.size);

      if (dogSize) {
        matched = picks.includes(dogSize);
        break;
      }

      // No confirmed size. Fall back to a breed/age-based puppy estimate,
      // conservatively discounted, rather than treating the question as
      // fully unanswerable.
      const bioSize = normalizeSize(dog?.bio_size);
      if (!bioSize) return { earned: 0, possible: 0, reasonLabel: null, matched: null };

      credit = aiTraitCredit(dog, "size", picks.includes(bioSize) ? 1 : 0);
      matched = credit !== null ? credit > 0.5 : null;
      break;
    }

    case "age_preference": {
      const dogAge = ageBucket(dog?.age_years, dog?.age_text);
      if (!dogAge || dogAge === "unknown") {
        return { earned: 0, possible: 0, reasonLabel: null, matched: null };
      }
      const picks = normalizeAnswerList(answer);
      matched = picks.includes(dogAge);
      break;
    }

    case "energy_preference": {
      credit = energyCredit(
        dog,
        {
          user: answer,
          dog: dog?.energy_level ?? dog?.activity_level ?? dog?.energy,
        },
        dog?.bio_energy_level
      );
      matched = credit !== null ? credit > 0.5 : null;
      break;
    }

    case "kids_in_home": {
      const picks = normalizeAnswerList(answer);
      const hasKidsNeed = picks.some((pick) =>
        ["yes", "kids", "children", "sometimes", "visiting", "children_visit", "under_3", "3_5", "6_9", "10_12", "13_plus"].includes(pick)
      );
      const dogKids =
        dog?.good_with_kids ??
        dog?.kids_ok ??
        dog?.kid_friendly ??
        dog?.goodWithKids ??
        null;

      if (hasKidsNeed) {
        credit = compatibilityCredit(dog, "good_with_kids", dogKids, dog?.bio_good_with_kids);
        matched = credit !== null ? credit > 0.5 : null;
      } else {
        matched = true;
      }
      break;
    }

    case "pets_in_home": {
      const picks = normalizeAnswerList(answer);
      const credits = [];

      if (picks.includes("dogs")) {
        credits.push(
          compatibilityCredit(
            dog,
            "good_with_dogs",
            dog?.good_with_dogs ?? dog?.dogs_ok ?? dog?.goodWithDogs,
            dog?.bio_good_with_dogs
          )
        );
      }

      if (picks.includes("cats")) {
        credits.push(
          compatibilityCredit(
            dog,
            "good_with_cats",
            dog?.good_with_cats ?? dog?.cats_ok ?? dog?.goodWithCats,
            dog?.bio_good_with_cats
          )
        );
      }

      if (picks.includes("small_pets") || picks.includes("small_animals")) {
        const smallAnimalValue =
          dog?.good_with_small_animals ??
          dog?.good_with_small_pets ??
          dog?.small_pets_ok ??
          null;
        credits.push(
          smallAnimalValue === true || truthy(smallAnimalValue)
            ? 1
            : null
        );
      }

      credit = credits.length
        ? credits.filter((value) => value !== null).reduce((sum, value) => sum + value, 0) /
          credits.filter((value) => value !== null).length
        : 1;
      if (!Number.isFinite(credit)) credit = null;
      matched = credit !== null ? credit > 0.5 : null;
      break;
    }

    case "potty_requirement": {
      const a = String(answer).toLowerCase();
      const dogPotty = dog?.potty_trained ?? dog?.house_trained ?? dog?.houseTrained ?? null;

      if (a === "must_be_trained" || a === "required" || a === "must") {
        credit = compatibilityCredit(dog, "potty_trained", dogPotty, dog?.bio_potty_trained);
        matched = credit !== null ? credit > 0.5 : null;
      } else {
        matched = true;
      }
      break;
    }

    case "first_time_owner": {
      const a = String(answer).toLowerCase();
      const dogFirstTime =
        dog?.first_time_friendly ?? dog?.beginner_friendly ?? dog?.firstTimeFriendly ?? null;

      if (a === "yes") {
        credit = compatibilityCredit(
          dog,
          "first_time_friendly",
          dogFirstTime,
          dog?.bio_first_time_friendly
        );
        matched = credit !== null ? credit > 0.5 : null;
      } else {
        matched = true;
      }
      break;
    }

    case "allergy_sensitivity": {
      const a = String(answer).toLowerCase();
      // No current source (RescueGroups or otherwise) ever confirms hypoallergenic
      // as false, so only an explicit true is treated as evidence. false and
      // null are handled identically and fall back to shedding_level (structured)
      // then bio_shedding_level (cautious AI estimate) via sheddingCredit.
      const hypo = dog?.hypoallergenic ?? dog?.hypoallergenic_only ?? dog?.is_hypoallergenic ?? null;

      if (
        a === "needs_low_shedding" ||
        a === "have_allergies" ||
        a === "allergies"
      ) {
        credit = hypo === true ? 1 : sheddingCredit(dog, "low");
        matched = credit !== null ? credit > 0.5 : null;
      } else {
        matched = true;
      }
      break;
    }

    case "shedding_preference": {
      const a = String(answer).toLowerCase();
      credit = sheddingCredit(dog, a);
      matched = credit !== null ? credit > 0.5 : null;
      break;
    }

    case "alone_time": {
      credit = aloneTimeCredit(dog, answer);
      matched = credit !== null ? credit > 0.5 : null;
      break;
    }

    case "yard": {
      credit = yardCredit(dog, answer);
      matched = credit !== null ? credit > 0.5 : null;
      break;
    }

    default: {
      // Unsupported fields must never affect a displayed match percentage.
      return { earned: 0, possible: 0, reasonLabel: null, matched: null };
    }
  }

  if (credit === null && matched === null) {
    return {
      earned: 0,
      possible: 0,
      reasonLabel: null,
      matched: null,
    };
  }

  return {
    earned: credit === null ? (matched ? weight : 0) : weight * credit,
    possible: weight,
    reasonLabel: labelFor(qid),
    matched,
  };
}

function countAnsweredQuestions(answersById) {
  if (!answersById || typeof answersById !== "object") return 0;

  return Object.keys(WEIGHTS).filter((questionId) => !isEmptyAnswer(answersById[questionId])).length;
}

function petsEvidenceCoverageWeight(dog, answer, weight) {
  const picks = normalizeAnswerList(answer);
  if (picks.some((pick) => ["none", "not_sure", "flexible"].includes(pick))) return weight;

  const requestedCredits = [];

  if (picks.includes("dogs")) {
    requestedCredits.push(
      compatibilityCredit(
        dog,
        "good_with_dogs",
        dog?.good_with_dogs ?? dog?.dogs_ok ?? dog?.goodWithDogs,
        dog?.bio_good_with_dogs
      )
    );
  }

  if (picks.includes("cats")) {
    requestedCredits.push(
      compatibilityCredit(
        dog,
        "good_with_cats",
        dog?.good_with_cats ?? dog?.cats_ok ?? dog?.goodWithCats,
        dog?.bio_good_with_cats
      )
    );
  }

  if (picks.includes("small_pets") || picks.includes("small_animals")) {
    const smallAnimalValue =
      dog?.good_with_small_animals ?? dog?.good_with_small_pets ?? dog?.small_pets_ok ?? null;
    requestedCredits.push(
      smallAnimalValue === true ||
      smallAnimalValue === false ||
      truthy(smallAnimalValue) ||
      falsy(smallAnimalValue)
        ? 1
        : null
    );
  }

  if (!requestedCredits.length) return weight;
  const knownCount = requestedCredits.filter((credit) => credit !== null).length;
  return weight * (knownCount / requestedCredits.length);
}

function evidenceCoverageWeight(qid, answer, dog, questionResult) {
  const weight = w(qid);
  if (isNoPreferenceValue(answer)) return weight;
  if (qid === "pets_in_home") return petsEvidenceCoverageWeight(dog, answer, weight);
  return questionResult.possible > 0 ? weight : 0;
}

function confirmedCompatibilityCautions(dog, answersById) {
  const cautions = [];
  const kids = normalizeAnswerList(answersById?.kids_in_home);
  const hasKidsNeed = kids.some((pick) =>
    ["yes", "kids", "children", "sometimes", "visiting", "children_visit", "under_3", "3_5", "6_9", "10_12", "13_plus"].includes(pick)
  );
  const dogKids =
    dog?.good_with_kids ?? dog?.kids_ok ?? dog?.kid_friendly ?? dog?.goodWithKids;

  if (hasKidsNeed && falsy(dogKids)) {
    cautions.push(
      "This dog is listed as not compatible with children, but your household includes children."
    );
  }

  const pets = normalizeAnswerList(answersById?.pets_in_home);
  const dogDogs = dog?.good_with_dogs ?? dog?.dogs_ok ?? dog?.goodWithDogs;
  const dogCats = dog?.good_with_cats ?? dog?.cats_ok ?? dog?.goodWithCats;

  if (pets.includes("dogs") && falsy(dogDogs)) {
    cautions.push(
      "This dog is listed as not compatible with other dogs, but your home includes a dog."
    );
  }

  if (pets.includes("cats") && falsy(dogCats)) {
    cautions.push(
      "This dog is listed as not compatible with cats, but your home includes a cat."
    );
  }
  const yardRequirementType = confirmedYardRequirementType(dog);
  if (String(answersById?.yard ?? "").toLowerCase() === "no" && yardRequirementType) {
    cautions.push(
      yardRequirementType === "fenced_yard"
        ? "This dog is listed as requiring a fenced yard, but your quiz says you do not have yard access."
        : "This dog is listed as requiring a yard or outdoor space, but your quiz says you do not have yard access."
    );
  }

  return cautions;
}

export function matchTierFromActivePct(scorePct, { limitedInformation = false } = {}) {
  const p = Number(scorePct);

  if (!Number.isFinite(p)) {
    return {
      label: "Quiz needed",
      pillClass: "bg-white text-stone-950",
    };
  }

  if (limitedInformation) {
    return {
      label: "Limited information",
      pillClass: "bg-amber-100 text-amber-950",
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
    let evidenceCoveredWeight = 0;
    let evidenceRequestedWeight = 0;

    const reasons = [];

    for (const qid of questionIds) {
      const ans = answersById?.[qid];
      const r = scoreQuestion(qid, ans, dog);

      earned += r.earned;
      possible += r.possible;

      if (!isEmptyAnswer(ans)) {
        evidenceRequestedWeight += w(qid);
        evidenceCoveredWeight += evidenceCoverageWeight(qid, ans, dog, r);
      }

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
    const compatibilityCautions = confirmedCompatibilityCautions(dog, answersById);
    const rawScorePct = meaningfulScoreAvailable ? Math.round((earned / possible) * 100) : null;
    const scorePct =
      rawScorePct !== null && compatibilityCautions.length
        ? Math.min(rawScorePct, CONFIRMED_COMPATIBILITY_CONFLICT_CAP)
        : rawScorePct;
    const evidenceCoveragePct = evidenceRequestedWeight > 0
      ? Math.round((evidenceCoveredWeight / evidenceRequestedWeight) * 100)
      : null;
    const limitedInformation =
      meaningfulScoreAvailable &&
      evidenceCoveragePct !== null &&
      evidenceCoveragePct < LIMITED_INFORMATION_COVERAGE_PCT;

    const top = meaningfulScoreAvailable
      ? reasons
          .filter((r) => r.matched)
          .slice()
          .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
          .slice(0, 4)
          .map((r) => r.label)
      : [];

    const tier = matchTierFromActivePct(scorePct, { limitedInformation });

    return {
      dog,
      score: earned,
      scorePct,
      breakdown: {
        scorePct,
        tierLabel: tier.label,
        topReasons: top,
        matchReasons: meaningfulScoreAvailable ? buildSupportedMatchReasons(dog, answersById, 4) : [],
        compatibilityCautions,
        evidenceCoveragePct,
        evidenceCoveredWeight,
        evidenceRequestedWeight,
        evidenceCoverageLabel: limitedInformation ? "Limited information" : "Sufficient information",
        limitedInformation,
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
    const tier = matchTierFromActivePct(r.scorePct, {
      limitedInformation: r.breakdown?.limitedInformation === true,
    });
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
