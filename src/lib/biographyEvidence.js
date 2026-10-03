const PROVENANCE = "biography_explicit_deterministic";

function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(text, match) {
  const start = Math.max(0, match.index - 55);
  const end = Math.min(text.length, match.index + match[0].length + 55);
  return text.slice(start, end).trim();
}

function pattern(id, regex, value, confidence, explanation) {
  return { id, regex, value, confidence, explanation };
}

export const BIOGRAPHY_EVIDENCE_POLICY = {
  potty_training: {
    accepted: [
      pattern("potty_confirmed", /(?<!not )(?<!isn't )(?<!is not )\b(?:fully\s+)?(?:house[ -]?trained|housebroken|potty[ -]?trained)\b/gi, "yes", 0.94, "Biography explicitly says the dog is house or potty trained."),
      pattern("potty_mostly", /\b(?:mostly|nearly|almost)\s+(?:house[ -]?trained|housebroken|potty[ -]?trained)|\bdoing (?:very )?well with (?:house|potty) training\b/gi, "most_likely", 0.84, "Biography explicitly describes substantial potty-training progress."),
      pattern("potty_in_progress", /\b(?:working on|learning|still learning)\s+(?:house|potty)\s*training\b/gi, "may_do_well", 0.76, "Biography explicitly says potty training is still in progress."),
      pattern("potty_negative", /\b(?:not|isn't|is not)\s+(?:house[ -]?trained|housebroken|potty[ -]?trained)\b/gi, "no", 0.92, "Biography explicitly says the dog is not potty trained."),
    ],
    ambiguous: [
      pattern("potty_transition_accidents", /\b(?:may|might|could) have accidents? (?:while|during|as) (?:adjusting|transitioning|settling in)\b/gi, null, 0, "Transition accidents do not establish the dog's general potty-training status."),
      pattern("crate_not_potty", /\bcrate[ -]?trained\b/gi, null, 0, "Crate training alone is not proof of potty training."),
    ],
  },
  training_needs: {
    accepted: [
      pattern("training_high", /\b(?:requires?|needs?) (?:an )?(?:experienced (?:owner|handler)|professional trainer)|\bintensive training\b/gi, "high", 0.9, "Biography explicitly describes advanced or professional training needs."),
      pattern("training_continued", /\b(?:needs?|requires?|will need) (?:continued|ongoing|consistent|additional) training\b|\btraining is (?:a )?must\b/gi, "medium_high", 0.85, "Biography explicitly calls for continued or consistent training."),
      pattern("training_in_progress", /\bworking on (?:basic )?(?:training|manners|commands|leash skills)|\bstill learning (?:basic )?(?:training|manners|commands)\b/gi, "medium", 0.8, "Biography explicitly describes training in progress."),
      pattern("training_basic", /\bknows? (?:some )?basic commands?\b|\b(?:basic obedience|obedience trained)\b/gi, "medium_low", 0.78, "Biography explicitly reports basic command or obedience knowledge."),
      pattern("training_well_trained", /\b(?:very |well[ -])trained\b|\bexcellent manners\b/gi, "low", 0.84, "Biography explicitly describes a well-trained dog."),
    ],
    ambiguous: [
      pattern("training_generic", /\b(?:all|every) dogs? (?:need|require) training\b|\bwould benefit from training\b/gi, null, 0, "Generic training advice is not dog-specific evidence."),
      pattern("smart_not_trained", /\b(?:smart|intelligent|eager to please|quick learner)\b/gi, null, 0, "Trainability language does not establish current training needs."),
    ],
  },
  barking_noise: {
    accepted: [
      pattern("noise_quiet", /\b(?:quiet in (?:the )?home|rarely barks?|hardly ever barks?|not a big barker|doesn't bark much|does not bark much|very quiet)\b/gi, "quiet", 0.9, "Biography explicitly describes low barking or quiet behavior."),
      pattern("noise_vocal", /\b(?:very vocal|quite vocal|vocal dog|talkative|alert barker|frequent barker|barks? (?:a lot|frequently|at (?:the )?door|at other dogs))\b/gi, "some", 0.9, "Biography explicitly describes vocal or barking behavior."),
    ],
    ambiguous: [
      pattern("noise_alert_only", /\balert\b/gi, null, 0, "The word alert alone does not establish barking frequency."),
      pattern("noise_guard", /\bwatchdog|guard dog\b/gi, null, 0, "Guarding language alone does not establish barking level."),
    ],
  },
  dog_social_style: {
    accepted: [
      pattern("social_only_dog", /\b(?:would prefer to be|would do best as|needs? to be|must be) (?:the )?only dog\b|\bno other dogs\b/gi, "only_dog", 0.92, "Biography explicitly recommends or requires an only-dog home."),
      pattern("social_selective", /\b(?:dog selective|selective with dogs|slow introductions? (?:are )?(?:needed|required|recommended)|proper introductions? (?:are )?(?:needed|required)|dog meet and greet (?:is )?(?:needed|required))\b/gi, "selective", 0.86, "Biography explicitly describes selectivity or required introductions."),
      pattern("social_high", /\b(?:loves other dogs|very dog friendly|highly social with dogs|social butterfly|thrives with other dogs|enjoys the company of other dogs)\b/gi, "highly_social", 0.9, "Biography explicitly describes strong social interest in other dogs."),
    ],
    ambiguous: [
      pattern("social_good_only", /\bgood with (?:other )?dogs\b/gi, null, 0, "Basic dog compatibility does not by itself establish social style."),
      pattern("social_meet_recommended", /\bmeet and greet (?:recommended|preferred)\b/gi, null, 0, "A recommended meet-and-greet alone does not establish selectivity."),
    ],
  },
  children: {
    accepted: [
      pattern("kids_negative", /\b(?:(?<!or )no (?:kids|children)(?! (?:under|younger than|below))|not good with (?:kids|children)|cannot live with (?:kids|children)|adult[- ]only home)\b/gi, "no", 0.95, "Biography explicitly rules out children."),
      pattern("kids_age_restricted", /\b(?:(?:older|teenage)(?:,? mature)? (?:kids|children)(?: only| or no (?:kids|children)(?: at all)?)|teenagers? only|no young (?:kids|children)|(?:kids|children) (?:ages? )?(?:1[0-9]|[6-9])\+|no (?:kids|children) (?:under|younger than|below) (?:1[0-9]|[1-9]))\b/gi, "older_children_only", 0.92, "Biography explicitly limits compatibility to older children; the current binary matcher must not treat this as universal child compatibility."),
      pattern("kids_conditional", /\b(?:may|might|could) do well with (?:respectful |older )?(?:kids|children)|\b(?:kids|children) with (?:slow|proper) introductions?\b/gi, "may_do_well", 0.78, "Biography gives conditional child-compatibility evidence."),
      pattern("kids_positive", /(?<!not )\b(?:good with|loves|lived with|does well with|gets along with) (?:young |older )?(?:kids|children)\b|\bkid[- ]friendly\b/gi, "yes", 0.92, "Biography explicitly describes positive experience with children."),
    ],
    ambiguous: [
      pattern("kids_untested", /\b(?:(?:not|never|hasn't|has not) (?:been )?tested|untested) with (?:kids|children)\b|\bunknown with (?:kids|children)\b/gi, null, 0, "Untested or unknown child compatibility must remain unknown."),
      pattern("kids_family", /\b(?:family dog|great for a family|perfect family dog)\b/gi, null, 0, "Family language is not child-specific evidence."),
    ],
  },
  dogs: {
    accepted: [
      pattern("dogs_negative", /\b(?:no other dogs|(?:would prefer to be|would do best as|needs? to be|must be) (?:the )?only dog|only dog (?:home|household|preferred|required)|not good with (?:other )?dogs|cannot live with (?:other )?dogs|doesn't like (?:other )?dogs|dog aggressive)\b/gi, "no", 0.94, "Biography explicitly rules out living with other dogs."),
      pattern("dogs_conditional", /\b(?:may|might|could) do well with (?:another|other) dogs?|\b(?:slow|proper) introductions? (?:to|with) (?:other )?dogs?\b|\bdog selective\b/gi, "may_do_well", 0.8, "Biography gives conditional dog-compatibility evidence."),
      pattern("dogs_positive", /(?<!not )\b(?:good with|loves|lived with|does well with|gets along with) (?:other )?dogs\b|\bvery dog friendly\b/gi, "yes", 0.93, "Biography explicitly describes positive experience with other dogs."),
    ],
    ambiguous: [
      pattern("dogs_untested", /\b(?:not|never|hasn't|has not) (?:been )?tested with (?:other )?dogs\b|\bunknown with (?:other )?dogs\b/gi, null, 0, "Untested or unknown dog compatibility must remain unknown."),
      pattern("dogs_meet_only", /\bmeet and greet (?:recommended|preferred)\b/gi, null, 0, "A recommended meet-and-greet alone does not establish compatibility."),
    ],
  },
  cats: {
    accepted: [
      pattern("cats_negative", /\b(?:no cats|feline[- ]free home|not cat[- ]safe|not good with cats|cannot live with cats|will chase cats|chases cats)\b/gi, "no", 0.95, "Biography explicitly rules out cats or describes chasing."),
      pattern("cats_conditional", /\b(?:may|might|could) do well with (?:dog[- ]savvy )?cats|\b(?:okay|ok) with (?:dog[- ]savvy )?cats (?:with|after) (?:slow|proper) introductions?\b/gi, "may_do_well", 0.78, "Biography gives conditional cat-compatibility evidence."),
      pattern("cats_positive", /(?<!not )\b(?:good with|loves|lived with|does well with|gets along with) cats\b|\bcat[- ]friendly\b/gi, "yes", 0.94, "Biography explicitly describes positive experience with cats."),
    ],
    ambiguous: [
      pattern("cats_untested", /\b(?:not|never|hasn't|has not) (?:been )?tested with cats\b|\bunknown with cats\b|\bcat history unknown\b/gi, null, 0, "Untested or unknown cat compatibility must remain unknown."),
      pattern("cats_interest", /\b(?:interested in|curious about|noticed) cats\b/gi, null, 0, "Interest in cats does not establish safe compatibility."),
    ],
  },
  small_animals: {
    accepted: [
      pattern("small_negative", /\b(?:no small animals|home without small animals|not good with small animals|does not do well with small animals|cannot live with small animals|no rabbits|no guinea pigs|high prey drive around small animals)\b/gi, "no", 0.95, "Biography explicitly rules out small animals."),
      pattern("small_conditional", /\b(?:may|might|could) do well with (?:small animals|rabbits|guinea pigs)\b/gi, "may_do_well", 0.76, "Biography gives conditional small-animal compatibility evidence."),
      pattern("small_positive", /(?<!not )\b(?:good with|lived with|does well with) (?:small animals|rabbits|guinea pigs)\b/gi, "yes", 0.94, "Biography explicitly describes positive small-animal experience."),
    ],
    ambiguous: [
      pattern("small_untested", /\b(?:not|never|hasn't|has not) (?:been )?tested with (?:small animals|rabbits|guinea pigs)\b|\bunknown with small animals\b/gi, null, 0, "Untested or unknown small-animal compatibility must remain unknown."),
      pattern("prey_drive_generic", /\bprey drive\b/gi, null, 0, "Prey-drive language without a small-animal context is not a compatibility finding."),
    ],
  },
};

const STRUCTURED_FIELDS = {
  potty_training: ["potty_trained"],
  training_needs: ["obedience_training"],
  barking_noise: ["barking_level"],
  dog_social_style: ["dog_social_style", "social_with_dogs", "dog_social_behavior", "only_dog", "only_dog_required"],
  children: ["good_with_kids"],
  dogs: ["good_with_dogs"],
  cats: ["good_with_cats"],
  small_animals: ["good_with_small_animals", "good_with_small_pets"],
};

const TRAIT_KEYS = {
  potty_training: "potty_trained",
  training_needs: "training_needs",
  barking_noise: "barking_level",
  dog_social_style: "dog_social_style",
  children: "good_with_kids",
  dogs: "good_with_dogs",
  cats: "good_with_cats",
  small_animals: "good_with_small_animals",
};

const BIO_COLUMNS = {
  potty_training: "bio_potty_trained",
  training_needs: "bio_training_needs",
  barking_noise: "bio_barking_level",
  children: "bio_good_with_kids",
  dogs: "bio_good_with_dogs",
  cats: "bio_good_with_cats",
};

function parseTraits(value) {
  if (!value) return {};
  if (typeof value === "object") return structuredClone(value);
  try { return JSON.parse(value); } catch { return {}; }
}

function isStructuredKnown(value) {
  return value === true || value === false || (
    value !== null && value !== undefined && String(value).trim() !== "" && String(value).toLowerCase() !== "unknown"
  );
}

function polarity(field, value) {
  if (["children", "dogs", "cats", "small_animals", "potty_training"].includes(field)) {
    if (value === "no") return "negative";
    if (["yes", "most_likely", "may_do_well"].includes(value)) return "positive";
  }
  if (field === "dog_social_style") {
    if (value === "only_dog") return "negative";
    if (["selective", "highly_social"].includes(value)) return "positive";
  }
  if (field === "barking_noise") return value === "quiet" ? "negative" : "positive";
  return String(value);
}

function structuredPolarity(field, dog) {
  const fields = STRUCTURED_FIELDS[field] || [];
  const value = fields.map((key) => dog?.[key]).find(isStructuredKnown);
  if (value === undefined) return null;
  if (["children", "dogs", "cats", "small_animals", "potty_training"].includes(field) && (value === true || value === false)) {
    return value ? "positive" : "negative";
  }
  if (field === "dog_social_style") {
    if (value === true || /only.?dog|no other dogs/i.test(String(value))) return "negative";
    return "positive";
  }
  if (field === "training_needs") {
    const text = String(value).toLowerCase();
    if (/well trained|advanced/.test(text)) return "low";
    if (/basic|some training/.test(text)) return "medium_low";
    if (/needs? training|untrained/.test(text)) return "medium_high";
    return null;
  }
  if (field === "barking_noise") return /quiet|none|minimal|low/i.test(String(value)) ? "negative" : "positive";
  return String(value).toLowerCase();
}

function allMatches(text, patterns) {
  const matches = [];
  for (const rule of patterns) {
    rule.regex.lastIndex = 0;
    for (const match of text.matchAll(rule.regex)) {
      matches.push({
        patternId: rule.id,
        value: rule.value,
        confidence: rule.confidence,
        explanation: rule.explanation,
        evidence: match[0],
        snippet: snippet(text, match),
        index: match.index,
      });
    }
  }
  return matches.sort((a, b) => a.index - b.index || b.confidence - a.confidence);
}

function resolveAccepted(field, matches) {
  if (!matches.length) return null;
  const groups = new Set(matches.map((entry) => polarity(field, entry.value)));
  if (groups.size > 1 && !["training_needs"].includes(field)) return null;
  if (field === "training_needs") {
    const order = ["low", "medium_low", "medium", "medium_high", "high"];
    return [...matches].sort((a, b) => order.indexOf(b.value) - order.indexOf(a.value) || b.confidence - a.confidence)[0];
  }
  if (field === "potty_training") {
    const order = ["no", "may_do_well", "most_likely", "yes"];
    return [...matches].sort((a, b) => order.indexOf(b.value) - order.indexOf(a.value) || b.confidence - a.confidence)[0];
  }
  return [...matches].sort((a, b) => b.confidence - a.confidence)[0];
}

export function extractBiographyEvidence(dog) {
  const text = normalizeText(dog?.description);
  const fields = {};
  for (const [field, policy] of Object.entries(BIOGRAPHY_EVIDENCE_POLICY)) {
    const acceptedMatches = allMatches(text, policy.accepted);
    const ambiguousMatches = allMatches(text, policy.ambiguous);
    const resolved = resolveAccepted(field, acceptedMatches);
    const contradictory = acceptedMatches.length > 1 && new Set(acceptedMatches.map((entry) => polarity(field, entry.value))).size > 1;
    const structuredFields = STRUCTURED_FIELDS[field] || [];
    const structuredPresent = structuredFields.some((key) => isStructuredKnown(dog?.[key]));
    const structuredDirection = structuredPolarity(field, dog);
    const biographyDirection = resolved ? polarity(field, resolved.value) : null;
    const structuredConflict = Boolean(structuredPresent && biographyDirection && structuredDirection !== null && structuredDirection !== biographyDirection);
    const ageRestricted = field === "children" && resolved?.value === "older_children_only";

    let status = "none";
    let reason = "No explicit biography evidence found.";
    if (contradictory) {
      status = "ambiguous";
      reason = "Biography contains contradictory explicit statements.";
    } else if (resolved) {
      status = "accepted";
      reason = ageRestricted
        ? "Accepted as age-specific evidence, but not mapped to the current binary child field."
        : structuredPresent
          ? "Accepted for audit only; structured source evidence takes precedence."
          : "Accepted as deterministic biography evidence.";
    } else if (ambiguousMatches.length) {
      status = "ambiguous";
      reason = ambiguousMatches[0].explanation;
    }

    fields[field] = {
      status,
      value: resolved?.value ?? null,
      confidence: resolved?.confidence ?? 0,
      provenance: resolved ? PROVENANCE : null,
      evidence: resolved?.evidence ?? null,
      snippet: resolved?.snippet ?? ambiguousMatches[0]?.snippet ?? null,
      patternId: resolved?.patternId ?? ambiguousMatches[0]?.patternId ?? null,
      explanation: resolved?.explanation ?? ambiguousMatches[0]?.explanation ?? null,
      reason,
      acceptedMatches,
      ambiguousMatches,
      structuredPresent,
      structuredConflict,
      applied: false,
      blockedReason: structuredPresent ? "structured_source_precedence" : ageRestricted ? "unsupported_age_specific_child_mapping" : null,
    };
  }
  return { dogId: dog?.id ?? null, dogName: dog?.name ?? null, textLength: text.length, fields };
}

function traitValue(field, value) {
  if (["children", "dogs", "cats", "small_animals", "potty_training"].includes(field)) {
    return { yes: "true", most_likely: "likely", may_do_well: "maybe", no: "false" }[value];
  }
  return value;
}

export function applyBiographyEvidenceForSimulation(dog, extraction = extractBiographyEvidence(dog), { fields = null } = {}) {
  const clone = structuredClone(dog);
  const aiTraits = parseTraits(clone.ai_traits);
  const allowed = fields ? new Set(fields) : null;
  const applied = [];
  const skipped = [];

  for (const [field, decision] of Object.entries(extraction.fields)) {
    if (allowed && !allowed.has(field)) continue;
    if (decision.status !== "accepted" || decision.blockedReason) {
      if (decision.status !== "none") skipped.push({ field, reason: decision.blockedReason || decision.reason });
      continue;
    }
    const key = TRAIT_KEYS[field];
    const existing = aiTraits[key];
    if (existing?.evidence_basis === "bio_explicit" && existing.value !== traitValue(field, decision.value)) {
      skipped.push({ field, reason: "existing_biography_explicit_conflict" });
      continue;
    }
    aiTraits[key] = {
      value: traitValue(field, decision.value),
      confidence: decision.confidence,
      evidence: decision.evidence,
      evidence_basis: "bio_explicit",
      provenance: PROVENANCE,
      pattern_id: decision.patternId,
    };
    const bioColumn = BIO_COLUMNS[field];
    if (bioColumn) clone[bioColumn] = decision.value;
    decision.applied = true;
    applied.push(field);
  }

  clone.ai_traits = aiTraits;
  return { dog: clone, extraction, applied, skipped };
}

export { PROVENANCE as BIOGRAPHY_EVIDENCE_PROVENANCE };
