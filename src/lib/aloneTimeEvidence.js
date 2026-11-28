const OBSERVATION_VALUES = new Set([
  "general_independence",
  "alone_comfort_claim",
  "observed_comfort",
  "separation_concern",
  "significant_distress",
]);

function cleanDescription(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function currentDogText(description) {
  return cleanDescription(description)
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !HISTORICAL_OR_OTHER_DOG.test(sentence))
    .join(" ");
}

function hoursFromMatch(match) {
  if (!match) return null;
  const first = Number(match[1]);
  const second = match[2] ? Number(match[2]) : null;
  if (!Number.isFinite(first) || first <= 0) return null;
  // For a stated range, use its lower bound so matching does not assume the
  // dog reliably tolerates the most optimistic end of the range.
  return second === null ? first : Math.min(first, second);
}

export function extractExplicitAloneHours(description) {
  return resolveBiographyDuration(description).hours;
}

const HISTORICAL_OR_OTHER_DOG = /\b(?:other dogs?|another dog|previous dog|former dog|used to|previously|in the past|years ago|when (?:he|she|they) were younger|at (?:his|her|their) previous home|before (?:coming to )?(?:the )?shelter|before adoption)\b/i;

function resolveBiographyDuration(description) {
  const sentences = cleanDescription(description).split(/(?<=[.!?])\s+/).filter(Boolean);
  const values = [];
  const patterns = [
    /\b(?:left|be left|stay|be) alone (?:for |up to |no more than |longer than )?(\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*(\d+(?:\.\d+)?))?\s*hours?\b/i,
    /\b(\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*(\d+(?:\.\d+)?))?\s*hours?\s+(?:alone|by (?:himself|herself|themselves))\b/i,
  ];

  for (const rawSentence of sentences) {
    const sentence = rawSentence.toLowerCase();
    if (HISTORICAL_OR_OTHER_DOG.test(sentence)) continue;

    const explicitLimit = sentence.match(/\b(?:cannot|can't|shouldn't|should not|unable to|not able to)\b[^.!?]{0,100}\b(?:be )?left alone\b[^.!?]{0,60}\b(?:no more than|more than|longer than|over|up to)\s+(\d+(?:\.\d+)?)\s*hours?\b/i);
    if (explicitLimit) {
      values.push(Number(explicitLimit[1]));
      continue;
    }

    // A negative statement that mentions a duration is not positive capacity.
    if (/\b(?:cannot|can't|shouldn't|should not|unable to|not able to)\b[^.!?]{0,100}\b(?:be )?left alone\b/i.test(sentence)) continue;

    const found = patterns.map((pattern) => hoursFromMatch(sentence.match(pattern))).find((hours) => hours !== null);
    if (found !== undefined) values.push(found);
  }

  const distinct = [...new Set(values)];
  const ambiguous = distinct.length > 1;
  return { hours: ambiguous || distinct.length === 0 ? null : distinct[0], ambiguous };
}

export function classifyAloneTimeObservation(description, aiTraits = {}) {
  const text = currentDogText(description).toLowerCase();
  const hasSevereDistress = /\b(?:severe separation anxiety|panic(?:s|ked)? when left alone|destructive when left alone|destroys things when alone|cannot be left alone|can't be left alone|needs someone home at all times)\b/.test(text);
  if (hasSevereDistress) return "significant_distress";

  const hasConcern = /\b(?:separation anxiety|separation distress|anxious when left alone|doesn't like to be left alone|does not like to be left alone|prefers someone home|prefers people home|working on alone time|still learning to be alone|cries when left alone|whines when left alone)\b/.test(text);
  if (hasConcern) return "separation_concern";

  const hasObservedComfort = /\b(?:foster|shelter staff|staff|caregiver)\b[^.!?]{0,100}\b(?:observed|reports?|says?)\b[^.!?]{0,140}\b(?:left alone|alone time|alone)\b[^.!?]{0,100}\b(?:settle[ds]?|comfortable|calm|no distress|did well|fine)\b/.test(text) ||
    /\b(?:foster|shelter staff|staff|caregiver)\b[^.!?]{0,100}\b(?:observed|reports?|says?)\b[^.!?]{0,100}\b(?:settle[ds]?|comfortable|calm|no distress|did well|fine)\b[^.!?]{0,100}\b(?:left alone|alone time|alone)\b/.test(text) ||
    /\b(?:observed|reported)\b[^.!?]{0,100}\b(?:left alone|alone time|alone)\b[^.!?]{0,100}\b(?:settle[ds]?|comfortable|calm|no distress|did well|fine)\b/.test(text);
  if (hasObservedComfort) return "observed_comfort";

  const hasAloneComfortClaim = /\b(?:handles alone time beautifully|comfortable alone|does well alone|fine when left alone|settles well alone|comfortable when left alone|does well when left alone)\b/.test(text);
  if (hasAloneComfortClaim) return "alone_comfort_claim";

  if (/\b(?:independent|settles on (?:their|his|her) own|entertains (?:himself|herself|themselves))\b/.test(text)) {
    return "general_independence";
  }

  const trait = aiTraits?.alone_time_observation;
  const value = String(trait?.value || "").toLowerCase();
  if (OBSERVATION_VALUES.has(value) && Number(trait?.confidence) > 0) return value;
  return "unknown";
}

function positiveHours(value) {
  const hours = Number(value);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

export function resolveAloneTimeEvidence(dog) {
  const traits = typeof dog?.ai_traits === "string"
    ? (() => { try { return JSON.parse(dog.ai_traits); } catch { return {}; } })()
    : (dog?.ai_traits || {});
  const structuredHours = positiveHours(dog?.max_alone_hours);
  const sourceHours = extractExplicitAloneHours(dog?.description);
  const storedBioHours = positiveHours(dog?.bio_max_alone_hours);
  const bioDuration = resolveBiographyDuration(dog?.description);
  const verifiedBioHours = bioDuration.ambiguous ? null : sourceHours;
  const legacyDurationUnverified = storedBioHours !== null && verifiedBioHours === null;
  const observation = classifyAloneTimeObservation(dog?.description, traits);
  const durationConflict = structuredHours !== null && verifiedBioHours !== null && structuredHours !== verifiedBioHours;
  const behaviorConflict = (structuredHours !== null || verifiedBioHours !== null) && ["separation_concern", "significant_distress"].includes(observation);
  const conflict = durationConflict || behaviorConflict;

  return {
    structuredHours,
    bioHours: verifiedBioHours,
    storedBioHours,
    legacyDurationUnverified,
    durationConflict,
    bioDurationConflict: bioDuration.ambiguous,
    behaviorConflict,
    conflict: conflict || bioDuration.ambiguous,
    observation,
    observationEvidence: traits?.alone_time_observation || null,
  };
}
