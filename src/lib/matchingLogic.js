// src/lib/matchingLogic.js
//
// Match scoring has three deliberately separate layers:
// 1. rawCompatibilityPct: compatibility after source/confidence adjustment,
//    calculated only from questions with usable dog evidence.
// 2. evidencePresencePct / evidenceQualityPct: how much of the adopter's
//    scoreable quiz is covered, and how trustworthy that evidence is.
// 3. scorePct: the displayed percentage after the tunable coverage modifier.
//
// Unsupported questions never enter any denominator. Flexible/no-preference
// answers are also neutral: they do not give every dog points or coverage.

const MIN_ANSWERED_FOR_REAL_MATCH = 2;
const CONFIRMED_COMPATIBILITY_CONFLICT_CAP = 49;
const LIMITED_INFORMATION_COVERAGE_PCT = 60;

const DISPLAY_COVERAGE_FLOOR = 0.6;
const DISPLAY_COVERAGE_WEIGHT = 0.4;
const PRESENCE_SHARE_OF_COVERAGE = 0.5;
const QUALITY_SHARE_OF_COVERAGE = 0.5;

export const MATCH_WEIGHTS = {
  size_preference: 3,
  age_preference: 3,
  kids_in_home: 3,
  pets_in_home: 3,
  potty_requirement: 3,
  dog_social_preference: 2,
  first_time_owner: 1,
  housing_type: 1,
  separation_anxiety_willingness: 2,
  training_commitment_level: 2,
  noise_preference: 1,
  daily_walk_minutes: 2,
  energy_preference: 2,
  yard: 3,
  alone_time: 2,
  allergy_sensitivity: 2,
  shedding_preference: 1,
};

const REASON_LABELS = {
  size_preference: "Size preference",
  age_preference: "Age preference",
  kids_in_home: "Children compatibility",
  pets_in_home: "Other-pet compatibility",
  potty_requirement: "Potty training",
  dog_social_preference: "Social fit with other dogs",
  first_time_owner: "First-time-owner fit",
  housing_type: "Home and apartment fit",
  separation_anxiety_willingness: "Separation and independence",
  training_commitment_level: "Training needs",
  noise_preference: "Barking and noise",
  daily_walk_minutes: "Daily exercise needs",
  energy_preference: "Energy level",
  yard: "Yard access",
  alone_time: "Weekday alone time",
  allergy_sensitivity: "Allergy and shedding needs",
  shedding_preference: "Shedding preference",
};

const DEFAULT_AI_CONFIDENCE = 0.35;
const BIO_EXPLICIT_STRENGTH = 0.65;
const PROFILE_INFERENCE_STRENGTH = 0.25;

function clamp01(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
}

function isEmptyAnswer(value) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "string" ? value.trim() === "" : false;
}

function normalizeAnswerList(answer) {
  if (Array.isArray(answer)) return answer.map((value) => String(value).toLowerCase());
  return isEmptyAnswer(answer) ? [] : [String(answer).toLowerCase()];
}

function isNoPreferenceValue(value) {
  const neutral = new Set([
    "flexible",
    "no_preference",
    "not_sure",
    "unknown",
    "doesnt_matter",
    "does_not_matter",
    "no_matter",
    "varies",
  ]);
  const values = Array.isArray(value) ? value : [value];
  return values.some((entry) => neutral.has(String(entry ?? "").toLowerCase()));
}

function normalizeSize(value) {
  const normalized = String(value ?? "").toLowerCase().trim();
  if (!normalized) return "";
  if (normalized.includes("extra") || normalized === "xl") return "extra_large";
  if (normalized.includes("medium")) return "medium";
  if (normalized.includes("large")) return "large";
  if (normalized.includes("small")) return "small";
  return normalized;
}

function parsedAgeYearsFromText(ageText) {
  const text = String(ageText || "").toLowerCase().trim();
  if (!text) return null;
  const year = text.match(/(\d+(?:\.\d+)?)\s*year/);
  const month = text.match(/(\d+(?:\.\d+)?)\s*month/);
  const week = text.match(/(\d+(?:\.\d+)?)\s*week/);
  const day = text.match(/(\d+(?:\.\d+)?)\s*day/);
  if (!year && !month && !week && !day) return null;
  return Number(year?.[1] || 0) + Number(month?.[1] || 0) / 12 + Number(week?.[1] || 0) / 52 + Number(day?.[1] || 0) / 365;
}

function resolveAgeYears(ageYears, ageText) {
  const hasRaw = ageYears !== null && ageYears !== undefined && String(ageYears).trim() !== "";
  const raw = Number(ageYears);
  const parsed = parsedAgeYearsFromText(ageText);
  if (parsed === null) return hasRaw && Number.isFinite(raw) ? raw : null;
  if (!hasRaw || !Number.isFinite(raw) || Math.abs(raw - parsed) > 0.5) return parsed;
  return raw;
}

function ageBucket(ageYears, ageText) {
  const years = resolveAgeYears(ageYears, ageText);
  if (Number.isFinite(years)) return years < 2 ? "puppy" : years >= 7 ? "senior" : "adult";
  const text = String(ageText || "").toLowerCase();
  if (text.includes("puppy")) return "puppy";
  if (text.includes("senior")) return "senior";
  return "unknown";
}

function normalizeEnergy(value) {
  const normalized = String(value ?? "").toLowerCase().trim().replace(/\s+/g, "_").replace(/-/g, "_");
  if (!normalized || normalized === "unknown") return "";
  if (["low", "medium_low", "medium", "medium_high", "high"].includes(normalized)) return normalized;
  if (normalized.includes("moderate")) return "medium";
  if (normalized.includes("slightly")) return "medium_low";
  if (normalized.includes("highly")) return "high";
  return normalized.includes("high") ? "high" : normalized.includes("low") ? "low" : "";
}

function normalizeShedding(value) {
  const normalized = String(value ?? "").toLowerCase().trim().replace(/\s+/g, "_").replace(/-/g, "_");
  if (!normalized || normalized === "unknown") return "";
  if (["low", "medium", "high"].includes(normalized)) return normalized;
  if (["none", "minimal", "very_low"].includes(normalized)) return "low";
  if (["moderate", "average"].includes(normalized)) return "medium";
  if (["heavy", "very_high"].includes(normalized)) return "high";
  return "";
}

function normalizeBarking(value) {
  const normalized = String(value ?? "").toLowerCase().trim();
  if (!normalized || normalized === "unknown") return "";
  if (/quiet|none|minimal|low/.test(normalized)) return "quiet";
  if (/some|moderate|medium|vocal|high|alert/.test(normalized)) return "some";
  return "";
}

function truthy(value) {
  if (value === true) return true;
  return ["true", "yes", "y", "1"].includes(String(value ?? "").toLowerCase().trim());
}

function falsy(value) {
  if (value === false) return true;
  return ["false", "no", "n", "0"].includes(String(value ?? "").toLowerCase().trim());
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
  const traitConfidence = Number(trait?.confidence);
  const rowConfidence = Number(dog?.ai_confidence_score);
  let confidence = Number.isFinite(traitConfidence)
    ? clamp01(traitConfidence)
    : Number.isFinite(rowConfidence)
      ? clamp01(rowConfidence)
      : DEFAULT_AI_CONFIDENCE;
  if (dog?.needs_human_review === true || traits?.needs_human_review === true) {
    confidence = Math.min(confidence, 0.35);
  }
  const source = trait?.evidence_basis === "bio_explicit" ? "bio_explicit" : "profile_inference";
  const tierStrength = source === "bio_explicit" ? BIO_EXPLICIT_STRENGTH : PROFILE_INFERENCE_STRENGTH;
  return { source, confidence, strength: tierStrength * confidence, trait };
}

function adjustedAiCredit(dog, field, rawCompatibility) {
  const raw = clamp01(rawCompatibility);
  if (raw === null) return null;
  const evidence = aiEvidenceForField(dog, field);
  if (!evidence.trait || evidence.strength <= 0) return null;
  return {
    rawCompatibility: raw,
    adjustedCompatibility: 0.5 + evidence.strength * (raw - 0.5),
    source: evidence.source,
    confidence: evidence.confidence,
    evidenceStrength: evidence.strength,
  };
}

function structuredCredit(rawCompatibility) {
  const raw = clamp01(rawCompatibility);
  if (raw === null) return null;
  return {
    rawCompatibility: raw,
    adjustedCompatibility: raw,
    source: "structured",
    confidence: 1,
    evidenceStrength: 1,
  };
}

function bioExplicitCredit(rawCompatibility, confidence = 0.85) {
  const raw = clamp01(rawCompatibility);
  const normalizedConfidence = clamp01(confidence);
  if (raw === null || normalizedConfidence === null) return null;
  const evidenceStrength = BIO_EXPLICIT_STRENGTH * normalizedConfidence;
  return {
    rawCompatibility: raw,
    adjustedCompatibility: 0.5 + evidenceStrength * (raw - 0.5),
    source: "bio_explicit",
    confidence: normalizedConfidence,
    evidenceStrength,
  };
}

function bioCompatibilityRaw(value) {
  const normalized = String(value ?? "").toLowerCase().trim();
  if (["yes", "true"].includes(normalized)) return 1;
  if (["most_likely", "likely"].includes(normalized)) return 0.9;
  if (["may_do_well", "maybe"].includes(normalized)) return 0.5;
  if (["no", "false"].includes(normalized)) return 0;
  return null;
}

function compatibilityEvidence(dog, field, structuredValue, bioValue) {
  if (structuredValue === true || truthy(structuredValue)) return structuredCredit(1);
  if (structuredValue === false || falsy(structuredValue)) return structuredCredit(0);
  return adjustedAiCredit(dog, field, bioCompatibilityRaw(bioValue));
}

function dogSocialStyleEvidence(dog, preference) {
  const structuredStyle = String(
    dog?.dog_social_style ?? dog?.social_with_dogs ?? dog?.dog_social_behavior ?? ""
  ).toLowerCase().trim();
  const explicitlyOnlyDog = dog?.only_dog === true || truthy(dog?.only_dog_required);

  let style = explicitlyOnlyDog ? "only_dog" : "";
  if (!style && /only.?dog|must be.*only dog/.test(structuredStyle)) style = "only_dog";
  if (!style && /selective|slow intro|meet.?and.?greet/.test(structuredStyle)) style = "selective";
  if (!style && /highly social|very dog friendly|loves other dogs|social butterfly/.test(structuredStyle)) style = "highly_social";

  const rawForStyle = (value) => {
    if (preference === "very_dog_friendly") {
      return value === "highly_social" ? 1 : value === "selective" ? 0.3 : value === "only_dog" ? 0 : null;
    }
    if (preference === "selective_ok") {
      return value === "highly_social" || value === "selective" ? 1 : value === "only_dog" ? 0.4 : null;
    }
    if (preference === "only_dog") return value === "only_dog" ? 1 : null;
    return null;
  };

  if (style) return structuredCredit(rawForStyle(style));

  const traits = parseAiTraits(dog?.ai_traits);
  const trait = traits?.dog_social_style;
  const traitValue = String(trait?.value ?? "").toLowerCase();
  if (trait && trait?.evidence_basis === "bio_explicit") {
    const normalized = /only/.test(traitValue)
      ? "only_dog"
      : /selective/.test(traitValue)
        ? "selective"
        : /social|friendly/.test(traitValue)
          ? "highly_social"
          : "";
    const raw = rawForStyle(normalized);
    if (raw !== null) return bioExplicitCredit(raw, Number(trait.confidence));
  }

  const description = String(dog?.description ?? "").toLowerCase();
  if (/\b(only dog|must be (?:the )?only dog|no other dogs)\b/.test(description)) style = "only_dog";
  else if (/\b(dog selective|selective with dogs|slow introductions?|proper introductions?|dog meet and greet)\b/.test(description)) style = "selective";
  else if (/\b(loves other dogs|very dog friendly|highly social with dogs|social butterfly|thrives with other dogs|enjoys the company of other dogs)\b/.test(description)) style = "highly_social";

  const raw = rawForStyle(style);
  return raw === null ? null : bioExplicitCredit(raw, 0.9);
}

function separationAnxietyEvidence(dog) {
  const structured = dog?.separation_anxiety ?? dog?.has_separation_anxiety;
  if (structured === true || truthy(structured)) return structuredCredit(0);
  if (structured === false || falsy(structured)) return structuredCredit(1);

  const traits = parseAiTraits(dog?.ai_traits);
  const trait = traits?.separation_anxiety ?? traits?.anxiety_or_fear;
  const evidenceText = String(trait?.evidence ?? "").toLowerCase();
  if (trait?.evidence_basis === "bio_explicit" && evidenceText.includes("separation")) {
    const anxietyCompatibility = bioCompatibilityRaw(trait.value);
    if (anxietyCompatibility !== null) {
      return bioExplicitCredit(1 - anxietyCompatibility, Number(trait.confidence));
    }
  }

  const description = String(dog?.description ?? "").toLowerCase();
  if (/\b(no|without) separation anxiety\b/.test(description)) return bioExplicitCredit(1, 0.9);
  if (/\bseparation (?:anxiety|distress|concerns?)\b/.test(description)) return bioExplicitCredit(0, 0.9);
  return null;
}

function energyRaw(userValue, dogValue) {
  const order = ["low", "medium_low", "medium", "medium_high", "high"];
  const user = normalizeEnergy(userValue);
  const dog = normalizeEnergy(dogValue);
  const userIndex = order.indexOf(user);
  const dogIndex = order.indexOf(dog);
  if (userIndex < 0 || dogIndex < 0) return null;
  const distance = Math.abs(userIndex - dogIndex);
  return distance === 0 ? 1 : distance === 1 ? 0.65 : distance === 2 ? 0.25 : 0;
}

function sheddingRaw(preference, dogValue) {
  const target = normalizeShedding(preference);
  const dog = normalizeShedding(dogValue);
  if (!target || !dog) return null;
  if (target === "low") return dog === "low" ? 1 : dog === "medium" ? 0.35 : 0;
  return dog === target ? 1 : 0;
}

function needLevelRaw(userCapacity, dogNeed) {
  const needOrder = ["low", "medium_low", "medium", "medium_high", "high"];
  const needIndex = needOrder.indexOf(normalizeEnergy(dogNeed));
  const capacityIndex = { low: 1, medium: 2, high: 4 }[String(userCapacity).toLowerCase()];
  if (needIndex < 0 || capacityIndex === undefined) return null;
  const shortfall = needIndex - capacityIndex;
  return shortfall <= 0 ? 1 : shortfall === 1 ? 0.5 : shortfall === 2 ? 0.2 : 0;
}

function exerciseCapacity(answer) {
  return { "0_15": 0, "15_30": 1, "30_60": 3, "60_plus": 4 }[String(answer).toLowerCase()];
}

function exerciseRaw(answer, dogNeed) {
  const order = ["low", "medium_low", "medium", "medium_high", "high"];
  const capacity = exerciseCapacity(answer);
  const need = order.indexOf(normalizeEnergy(dogNeed));
  if (capacity === undefined || need < 0) return null;
  const shortfall = need - capacity;
  return shortfall <= 0 ? 1 : shortfall === 1 ? 0.6 : shortfall === 2 ? 0.2 : 0;
}

function barkingRaw(answer, barking) {
  const dog = normalizeBarking(barking);
  if (!dog) return null;
  const preference = String(answer).toLowerCase();
  if (["alert_ok", "some_ok"].includes(preference)) return 1;
  if (preference === "prefer_quiet") return dog === "quiet" ? 1 : 0.4;
  if (preference === "need_very_quiet") return dog === "quiet" ? 1 : 0;
  return null;
}

function aloneTimeNeededHours(answer) {
  const normalized = String(answer).toLowerCase();
  if (["lt4", "1to2", "1-2"].includes(normalized)) return 2;
  if (["4_6", "4to6", "3to4", "3-4"].includes(normalized)) return 4;
  if (["6_8", "6to8", "5to6", "5-6"].includes(normalized)) return 6;
  if (["8_plus", "gt8", "7to8", "7-8"].includes(normalized)) return 8;
  return null;
}

function hoursRaw(available, needed) {
  const hours = Number(available);
  if (!Number.isFinite(hours) || hours <= 0 || !needed) return null;
  return hours >= needed ? 1 : hours >= needed - 2 ? 0.45 : 0;
}

function confirmedYardRequirementType(dog) {
  const fence = String(dog?.fence_needs ?? "").toLowerCase().trim();
  const fenceNotRequired = !fence || /\b(no|none|not required|optional|unknown)\b/.test(fence);
  if (!fenceNotRequired) return "fenced_yard";
  if (dog?.yard_required === true || truthy(dog?.yard_required)) return "yard";
  return null;
}

function evidenceFromStructuredOrAi({ dog, field, structuredValue, aiValue, rawForValue }) {
  if (structuredValue !== null && structuredValue !== undefined && String(structuredValue).trim() !== "") {
    const raw = rawForValue(structuredValue);
    if (raw !== null) return structuredCredit(raw);
  }
  return adjustedAiCredit(dog, field, rawForValue(aiValue));
}

function combineEvidence(items) {
  const known = items.filter(Boolean);
  if (!known.length) return null;
  const average = (key) => known.reduce((sum, item) => sum + item[key], 0) / known.length;
  const sources = [...new Set(known.map((item) => item.source))];
  return {
    rawCompatibility: average("rawCompatibility"),
    adjustedCompatibility: average("adjustedCompatibility"),
    evidenceStrength: average("evidenceStrength"),
    confidence: average("confidence"),
    source: sources.length === 1 ? sources[0] : "mixed",
    knownParts: known.length,
    requestedParts: items.length,
  };
}

function result(questionId, evidence, explanation, { requested = true } = {}) {
  const weight = MATCH_WEIGHTS[questionId];
  if (!requested) return { questionId, weight, requested: false, evidence: null, contribution: null };
  if (!evidence) return { questionId, weight, requested: true, evidence: null, contribution: null };
  const contribution = {
    questionId,
    label: REASON_LABELS[questionId],
    weight,
    rawCompatibility: evidence.rawCompatibility,
    adjustedCompatibility: evidence.adjustedCompatibility,
    source: evidence.source,
    confidence: evidence.confidence,
    evidenceStrength: evidence.evidenceStrength,
    explanation,
    positive: evidence.adjustedCompatibility > 0.5,
  };
  return { questionId, weight, requested: true, evidence, contribution };
}

function scoreQuestion(questionId, answer, dog) {
  if (isEmptyAnswer(answer) || isNoPreferenceValue(answer)) return result(questionId, null, "", { requested: false });

  switch (questionId) {
    case "size_preference": {
      const picks = normalizeAnswerList(answer).map(normalizeSize);
      if (dog?.size) return result(questionId, structuredCredit(picks.includes(normalizeSize(dog.size)) ? 1 : 0), `Shelter-listed size ${picks.includes(normalizeSize(dog.size)) ? "fits" : "does not fit"} your preference`);
      const value = normalizeSize(dog?.bio_size);
      return result(questionId, value ? adjustedAiCredit(dog, "size", picks.includes(value) ? 1 : 0) : null, `Estimated adult size ${picks.includes(value) ? "fits" : "may not fit"} your preference`);
    }
    case "age_preference": {
      const bucket = ageBucket(dog?.age_years, dog?.age_text);
      const evidence = bucket === "unknown" ? null : structuredCredit(normalizeAnswerList(answer).includes(bucket) ? 1 : 0);
      return result(questionId, evidence, `Listed age ${evidence?.rawCompatibility === 1 ? "fits" : "does not fit"} your preference`);
    }
    case "kids_in_home": {
      const needsKids = normalizeAnswerList(answer).some((value) => !["no_children"].includes(value));
      if (!needsKids) return result(questionId, null, "", { requested: false });
      const evidence = compatibilityEvidence(dog, "good_with_kids", dog?.good_with_kids, dog?.bio_good_with_kids);
      return result(questionId, evidence, evidence?.source === "structured" ? `Shelter listing ${evidence.rawCompatibility ? "supports" : "does not support"} a home with children` : `Available listing evidence ${evidence?.rawCompatibility > 0.5 ? "suggests possible" : "does not clearly support"} child compatibility`);
    }
    case "pets_in_home": {
      const picks = normalizeAnswerList(answer);
      if (picks.includes("none")) return result(questionId, null, "", { requested: false });
      const items = [];
      if (picks.includes("dogs")) items.push(compatibilityEvidence(dog, "good_with_dogs", dog?.good_with_dogs, dog?.bio_good_with_dogs));
      if (picks.includes("cats")) items.push(compatibilityEvidence(dog, "good_with_cats", dog?.good_with_cats, dog?.bio_good_with_cats));
      if (picks.includes("small_pets") || picks.includes("small_animals")) {
        const value = dog?.good_with_small_animals ?? dog?.good_with_small_pets ?? null;
        items.push(value === true || value === false ? structuredCredit(value ? 1 : 0) : adjustedAiCredit(dog, "good_with_small_animals", bioCompatibilityRaw(parseAiTraits(dog?.ai_traits)?.good_with_small_animals?.value)));
      }
      const evidence = combineEvidence(items);
      return result(questionId, evidence, evidence?.source === "structured" ? "Shelter-listed compatibility addresses the pets in your home" : "Available listing evidence partially addresses the pets in your home");
    }
    case "potty_requirement": {
      const required = String(answer).toLowerCase() === "must_be_trained";
      const preferred = String(answer).toLowerCase() === "preferred";
      if (!required && !preferred) return result(questionId, null, "", { requested: false });
      let evidence = compatibilityEvidence(dog, "potty_trained", dog?.potty_trained, dog?.bio_potty_trained);
      if (preferred && evidence) evidence = { ...evidence, rawCompatibility: 0.5 + evidence.rawCompatibility * 0.5, adjustedCompatibility: 0.5 + (evidence.adjustedCompatibility - 0.5) * 0.5 };
      return result(questionId, evidence, evidence?.source === "structured" ? `Shelter-listed potty-training status ${evidence.rawCompatibility > 0.5 ? "fits" : "does not fit"} your preference` : "Estimated potty-training status influences this fit cautiously");
    }
    case "dog_social_preference": {
      const preference = String(answer).toLowerCase();
      const evidence = dogSocialStyleEvidence(dog, preference);
      return result(questionId, evidence, evidence?.source === "structured" ? "Shelter-listed social style fits your preference around other dogs" : "Bio-explicit dog social style cautiously informs your preference");
    }
    case "first_time_owner": {
      if (String(answer).toLowerCase() !== "yes") return result(questionId, null, "", { requested: false });
      let structured = dog?.first_time_friendly;
      if (structured === null || structured === undefined) {
        const owner = String(dog?.owner_experience || "").toLowerCase();
        if (/experienced|advanced|breed experience/.test(owner)) structured = false;
      }
      const evidence = compatibilityEvidence(dog, "first_time_friendly", structured, dog?.bio_first_time_friendly);
      return result(questionId, evidence, evidence?.source === "structured" ? "Shelter guidance informs first-time-owner suitability" : "Estimated experience fit is applied cautiously");
    }
    case "housing_type": {
      const housing = String(answer).toLowerCase();
      if (!['apartment', 'townhouse'].includes(housing)) return result(questionId, null, "", { requested: false });
      const trait = parseAiTraits(dog?.ai_traits)?.apartment_friendly;
      const evidence = adjustedAiCredit(dog, "apartment_friendly", bioCompatibilityRaw(trait?.value));
      return result(questionId, evidence, "Estimated apartment suitability cautiously informs your home fit");
    }
    case "separation_anxiety_willingness": {
      if (String(answer).toLowerCase() !== "no") return result(questionId, null, "", { requested: false });
      const evidence = separationAnxietyEvidence(dog);
      return result(questionId, evidence, evidence?.source === "structured" ? "Shelter-listed separation-anxiety information fits your stated limit" : "Bio-explicit separation-anxiety information cautiously informs this fit");
    }
    case "training_commitment_level": {
      const structured = dog?.obedience_training;
      const ai = dog?.bio_training_needs ?? parseAiTraits(dog?.ai_traits)?.training_needs?.value;
      const evidence = evidenceFromStructuredOrAi({ dog, field: "training_needs", structuredValue: structured, aiValue: ai, rawForValue: (value) => needLevelRaw(answer, /needs? training|untrained/i.test(String(value)) ? "medium_high" : /well trained|advanced/i.test(String(value)) ? "low" : /basic|some training/i.test(String(value)) ? "medium_low" : value) });
      return result(questionId, evidence, evidence?.source === "structured" ? "Shelter-listed training status fits your available training commitment" : "Estimated training needs cautiously inform this fit");
    }
    case "noise_preference": {
      const evidence = evidenceFromStructuredOrAi({ dog, field: "barking_level", structuredValue: dog?.barking_level, aiValue: dog?.bio_barking_level ?? parseAiTraits(dog?.ai_traits)?.barking_level?.value, rawForValue: (value) => barkingRaw(answer, value) });
      return result(questionId, evidence, evidence?.source === "structured" ? "Shelter-listed barking tendency informs your noise preference" : "Estimated barking tendency cautiously informs your noise preference");
    }
    case "daily_walk_minutes": {
      const structured = dog?.exercise_needs ?? dog?.activity_level ?? dog?.energy_level;
      const ai = dog?.bio_exercise_needs ?? parseAiTraits(dog?.ai_traits)?.exercise_needs?.value;
      const evidence = evidenceFromStructuredOrAi({ dog, field: "exercise_needs", structuredValue: structured, aiValue: ai, rawForValue: (value) => exerciseRaw(answer, value) });
      return result(questionId, evidence, evidence?.source === "structured" ? "Shelter-listed exercise needs fit your daily walking capacity" : "Estimated exercise needs cautiously inform daily-walk fit");
    }
    case "energy_preference": {
      const structured = dog?.energy_level ?? dog?.activity_level;
      const evidence = evidenceFromStructuredOrAi({ dog, field: "energy_level", structuredValue: structured, aiValue: dog?.bio_energy_level, rawForValue: (value) => energyRaw(answer, value) });
      return result(questionId, evidence, evidence?.source === "structured" ? "Shelter-listed energy level fits your preference" : "Estimated energy level cautiously informs your preference");
    }
    case "yard": {
      const hasYard = String(answer).toLowerCase() === "yes";
      const requirement = confirmedYardRequirementType(dog);
      if (requirement) return result(questionId, structuredCredit(hasYard ? 1 : 0), hasYard ? "Your yard access fits the shelter-listed requirement" : "A shelter-listed yard requirement does not fit your current access");
      if (dog?.yard_required === false) return result(questionId, structuredCredit(1), "The shelter listing does not require a yard");
      const value = String(parseAiTraits(dog?.ai_traits)?.needs_yard?.value ?? "").toLowerCase();
      const raw = ["true", "likely"].includes(value) ? (hasYard ? 1 : 0) : value === "maybe" ? (hasYard ? 0.8 : 0.4) : null;
      return result(questionId, adjustedAiCredit(dog, "needs_yard", raw), "Estimated yard needs cautiously inform your home fit");
    }
    case "alone_time": {
      const needed = aloneTimeNeededHours(answer);
      const confirmedRaw = hoursRaw(dog?.max_alone_hours, needed);
      const evidence = confirmedRaw !== null ? structuredCredit(confirmedRaw) : adjustedAiCredit(dog, "max_alone_hours", hoursRaw(dog?.bio_max_alone_hours, needed));
      return result(questionId, evidence, evidence?.source === "structured" ? "Shelter-listed alone-time capacity fits your weekday routine" : "Estimated alone-time capacity cautiously informs your weekday fit");
    }
    case "allergy_sensitivity": {
      const sensitivity = String(answer).toLowerCase();
      if (sensitivity === "no_allergies") return result(questionId, null, "", { requested: false });
      if (dog?.hypoallergenic === true) return result(questionId, structuredCredit(1), "Shelter listing identifies a confirmed hypoallergenic fit");
      if (dog?.hypoallergenic === false) {
        const raw = sensitivity === "mild_allergies" ? 0.5 : 0;
        return result(questionId, structuredCredit(raw), "Shelter listing does not identify this dog as hypoallergenic");
      }
      return result(questionId, null, "");
    }
    case "shedding_preference": {
      if (String(answer).toLowerCase() === "heavy_ok") return result(questionId, null, "", { requested: false });
      const structured = normalizeShedding(dog?.shedding_level);
      const evidence = structured ? structuredCredit(sheddingRaw(answer, structured)) : adjustedAiCredit(dog, "shedding_level", sheddingRaw(answer, dog?.bio_shedding_level));
      return result(questionId, evidence, evidence?.source === "structured" ? "Shelter-listed shedding level fits your preference" : "Estimated shedding level cautiously informs your preference");
    }
    default:
      return { questionId, weight: 0, requested: false, evidence: null, contribution: null };
  }
}

function confirmedCompatibilityCautions(dog, answers) {
  const cautions = [];
  const kids = normalizeAnswerList(answers?.kids_in_home);
  const needsKids = kids.some((value) => value !== "no_children");
  const dogKids = dog?.good_with_kids ?? dog?.kids_ok ?? dog?.kid_friendly ?? dog?.goodWithKids;
  if (needsKids && falsy(dogKids)) cautions.push("This dog is listed as not compatible with children, but your household includes children.");

  const pets = normalizeAnswerList(answers?.pets_in_home);
  const dogDogs = dog?.good_with_dogs ?? dog?.dogs_ok ?? dog?.goodWithDogs;
  const dogCats = dog?.good_with_cats ?? dog?.cats_ok ?? dog?.goodWithCats;
  if (pets.includes("dogs") && falsy(dogDogs)) cautions.push("This dog is listed as not compatible with other dogs, but your home includes a dog.");
  if (pets.includes("cats") && falsy(dogCats)) cautions.push("This dog is listed as not compatible with cats, but your home includes a cat.");

  const yardType = confirmedYardRequirementType(dog);
  if (String(answers?.yard ?? "").toLowerCase() === "no" && yardType) {
    cautions.push(yardType === "fenced_yard" ? "This dog is listed as requiring a fenced yard, but your quiz says you do not have yard access." : "This dog is listed as requiring a yard or outdoor space, but your quiz says you do not have yard access.");
  }
  return cautions;
}

function meaningfulAnsweredCount(answers) {
  return Object.keys(MATCH_WEIGHTS).filter((questionId) => {
    const answer = answers?.[questionId];
    // This count gates whether the adopter has taken enough of the quiz to
    // display a score. Flexible answers count as completed responses here but
    // remain absent from points, requested evidence, and coverage below.
    return !isEmptyAnswer(answer);
  }).length;
}

export function matchTierFromActivePct(scorePct, { limitedInformation = false } = {}) {
  const percentage = Number(scorePct);
  if (!Number.isFinite(percentage)) return { label: "Quiz needed", pillClass: "bg-white text-stone-950" };
  if (limitedInformation) return { label: "Limited information", pillClass: "bg-amber-100 text-amber-950" };
  if (percentage >= 85) return { label: "Strong match", pillClass: "bg-emerald-700 text-white" };
  if (percentage >= 70) return { label: "Good match", pillClass: "bg-indigo-600 text-white" };
  return { label: "Potential match", pillClass: "bg-gray-800 text-white" };
}

export function computeRankedMatches(dogs, answersById) {
  const dogList = Array.isArray(dogs) ? dogs : [];
  const answeredCount = meaningfulAnsweredCount(answersById);

  const rows = dogList.map((dog) => {
    const questionResults = Object.keys(MATCH_WEIGHTS).map((questionId) => scoreQuestion(questionId, answersById?.[questionId], dog));
    const requested = questionResults.filter((entry) => entry.requested);
    const contributions = requested.map((entry) => entry.contribution).filter(Boolean);

    const requestedWeight = requested.reduce((sum, entry) => sum + entry.weight, 0);
    const knownWeight = contributions.reduce((sum, entry) => sum + entry.weight, 0);
    const earned = contributions.reduce((sum, entry) => sum + entry.weight * entry.adjustedCompatibility, 0);
    const qualityWeightedEvidence = contributions.reduce((sum, entry) => sum + entry.weight * entry.evidenceStrength, 0);

    const hasEnoughQuizInfo = answeredCount >= MIN_ANSWERED_FOR_REAL_MATCH;
    const meaningfulScoreAvailable = hasEnoughQuizInfo && requestedWeight > 0 && knownWeight > 0;
    const rawCompatibility = meaningfulScoreAvailable ? earned / knownWeight : null;
    const evidencePresence = requestedWeight > 0 ? knownWeight / requestedWeight : null;
    const evidenceQuality = knownWeight > 0 ? qualityWeightedEvidence / knownWeight : null;
    const qualityAdjustedCoverage = requestedWeight > 0 ? qualityWeightedEvidence / requestedWeight : null;
    const coverageComponent = evidencePresence === null || qualityAdjustedCoverage === null
      ? null
      : PRESENCE_SHARE_OF_COVERAGE * evidencePresence + QUALITY_SHARE_OF_COVERAGE * qualityAdjustedCoverage;

    const rawScorePct = meaningfulScoreAvailable ? Math.round(rawCompatibility * 100) : null;
    const coverageAdjustedPct = meaningfulScoreAvailable
      ? Math.round(rawCompatibility * (DISPLAY_COVERAGE_FLOOR + DISPLAY_COVERAGE_WEIGHT * coverageComponent) * 100)
      : null;
    const compatibilityCautions = confirmedCompatibilityCautions(dog, answersById);
    const scorePct = coverageAdjustedPct !== null && compatibilityCautions.length
      ? Math.min(coverageAdjustedPct, CONFIRMED_COMPATIBILITY_CONFLICT_CAP)
      : coverageAdjustedPct;

    const evidencePresencePct = evidencePresence === null ? null : Math.round(evidencePresence * 100);
    const evidenceQualityPct = evidenceQuality === null ? null : Math.round(evidenceQuality * 100);
    const evidenceCoveragePct = coverageComponent === null ? null : Math.round(coverageComponent * 100);
    const limitedInformation = meaningfulScoreAvailable && evidenceCoveragePct < LIMITED_INFORMATION_COVERAGE_PCT;

    const positiveContributions = contributions
      .filter((entry) => entry.positive)
      .sort((a, b) => b.weight * b.adjustedCompatibility - a.weight * a.adjustedCompatibility);
    const tradeoffContributions = contributions
      .filter((entry) => !entry.positive)
      .sort((a, b) => a.adjustedCompatibility - b.adjustedCompatibility);
    const matchReasons = positiveContributions.slice(0, 4).map((entry) => entry.explanation);
    const matchTradeoffs = tradeoffContributions.slice(0, 4).map((entry) => entry.explanation);
    const tier = matchTierFromActivePct(scorePct, { limitedInformation });

    return {
      dog,
      score: earned,
      scorePct,
      breakdown: {
        scorePct,
        rawScorePct,
        rawCompatibility,
        rawCompatibilityPct: rawScorePct,
        evidencePresence,
        evidencePresencePct,
        evidenceQuality,
        evidenceQualityPct,
        qualityAdjustedCoverage,
        coverageComponent,
        evidenceCoveragePct,
        evidenceCoveredWeight: knownWeight,
        evidenceRequestedWeight: requestedWeight,
        qualityWeightedEvidence,
        tierLabel: tier.label,
        limitedInformation,
        evidenceCoverageLabel: limitedInformation ? "Limited information" : "Sufficient information",
        answeredCount,
        possible: knownWeight,
        enoughQuizInfo: meaningfulScoreAvailable,
        contributions,
        positiveContributions,
        tradeoffContributions,
        matchReasons,
        matchTradeoffs,
        topReasons: matchReasons,
        compatibilityCautions,
        emptyReason: answeredCount === 0
          ? "no_quiz_answers"
          : !hasEnoughQuizInfo
            ? "too_few_quiz_answers"
            : requestedWeight <= 0
              ? "no_active_match_fields"
              : knownWeight <= 0
                ? "no_dog_evidence"
                : null,
      },
    };
  });

  rows.sort((a, b) => {
    const aPct = Number.isFinite(Number(a.scorePct)) ? Number(a.scorePct) : -1;
    const bPct = Number.isFinite(Number(b.scorePct)) ? Number(b.scorePct) : -1;
    if (bPct !== aPct) return bPct - aPct;
    const aCoverage = Number(a.breakdown?.coverageComponent || 0);
    const bCoverage = Number(b.breakdown?.coverageComponent || 0);
    if (bCoverage !== aCoverage) return bCoverage - aCoverage;
    const aRaw = Number(a.breakdown?.rawCompatibility || 0);
    const bRaw = Number(b.breakdown?.rawCompatibility || 0);
    if (bRaw !== aRaw) return bRaw - aRaw;
    return String(a.dog?.name ?? "").localeCompare(String(b.dog?.name ?? ""));
  });

  return rows;
}

export function rankDogs(dogs, answersById) {
  return computeRankedMatches(dogs, answersById).map((row) => {
    const tier = matchTierFromActivePct(row.scorePct, { limitedInformation: row.breakdown?.limitedInformation === true });
    const label = tier.label.toLowerCase();
    return {
      ...row.dog,
      scorePct: row.scorePct,
      match_level: label.includes("strong") ? "strong" : label.includes("good") ? "good" : label.includes("quiz") ? "quiz_needed" : "potential",
      breakdown: row.breakdown,
    };
  });
}
