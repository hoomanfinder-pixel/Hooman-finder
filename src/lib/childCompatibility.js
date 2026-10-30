import { getTraitDisplay, normalizeBioValue } from "./traitDisplay.js";

export const CHILD_COMPATIBILITY = Object.freeze({
  NO: "no",
  OLDER_CHILDREN_ONLY: "older_children_only",
  YES: "yes",
  UNKNOWN: "unknown",
});

const YOUNGER_CHILD_AGE_BANDS = new Set(["under_3", "3_5", "6_9"]);

function normalizeAnswerList(answer) {
  if (Array.isArray(answer)) return answer.map((value) => String(value).toLowerCase());
  if (answer === null || answer === undefined || String(answer).trim() === "") return [];
  return [String(answer).toLowerCase()];
}

function normalizeQualityToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hasOlderChildrenOnlySourceQuality(qualities) {
  const values = Array.isArray(qualities)
    ? qualities
    : String(qualities || "").split(/[,;|]/);

  return values.some((value) => {
    const token = normalizeQualityToken(value);
    return token === "olderkidsonly" || token === "olderchildrenonly";
  });
}

function parseAiTraits(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

// RescueGroups can publish isKidsOk=true together with the more restrictive
// olderKidsOnly quality. The explicit restriction is the more specific source
// fact and must win over the broad boolean and every AI/bio fallback.
export function resolveChildCompatibility(dog) {
  const structuredValue = dog?.good_with_kids ?? dog?.kids_ok ?? dog?.kid_friendly ?? dog?.goodWithKids;

  // Keep an explicit all-child incompatibility conservative even when the
  // upstream source also sends a contradictory conditional quality.
  if (structuredValue === false || String(structuredValue).toLowerCase() === "false") {
    return { value: CHILD_COMPATIBILITY.NO, source: "structured", confirmed: true, evidence: "good_with_kids" };
  }

  if (hasOlderChildrenOnlySourceQuality(dog?.qualities)) {
    return {
      value: CHILD_COMPATIBILITY.OLDER_CHILDREN_ONLY,
      source: "structured",
      confirmed: true,
      evidence: "qualities.olderKidsOnly",
    };
  }

  if (structuredValue === true || String(structuredValue).toLowerCase() === "true") {
    return { value: CHILD_COMPATIBILITY.YES, source: "structured", confirmed: true, evidence: "good_with_kids" };
  }

  const bioValue = normalizeBioValue(dog?.bio_good_with_kids);
  if (bioValue !== CHILD_COMPATIBILITY.UNKNOWN) {
    const evidenceBasis = parseAiTraits(dog?.ai_traits)?.good_with_kids?.evidence_basis;
    return {
      value: bioValue,
      source: evidenceBasis === "bio_explicit" ? "bio" : "profile_inference",
      confirmed: false,
      evidence: "bio_good_with_kids",
      evidenceBasis,
    };
  }

  return { value: CHILD_COMPATIBILITY.UNKNOWN, source: "unknown", confirmed: false, evidence: null };
}

export function hasConservativelyYoungerChildren(answer) {
  return normalizeAnswerList(answer).some((age) => YOUNGER_CHILD_AGE_BANDS.has(age));
}

export function getChildTraitDisplay(dog) {
  const resolved = resolveChildCompatibility(dog);
  if (resolved.source === "structured") {
    return getTraitDisplay({ structuredValue: resolved.value });
  }

  return getTraitDisplay({
    structuredValue: null,
    bioValue: resolved.value,
    evidenceBasis: resolved.evidenceBasis,
  });
}

export function getChildFitChip(dog) {
  const trait = getChildTraitDisplay(dog);
  if (!trait.estimated && trait.value === "Yes") {
    return { label: "Good with kids", confirmed: true };
  }
  if (!trait.estimated && trait.value === "Older children only") {
    return { label: "Older children only", confirmed: true };
  }
  if (trait.estimated && ["Yes", "Most likely", "May do well"].includes(trait.value)) {
    return { label: "Likely good with kids", confirmed: false };
  }
  if (trait.estimated && trait.value === "Older children only") {
    return { label: "Older children only", confirmed: false };
  }
  return null;
}
