// src/lib/traitDisplay.js
// Shared confirmed-vs-estimated trait resolution, used by DogDetail.jsx and
// DogCard.jsx so the two surfaces never diverge on what counts as "confirmed".

export function normalizeBioValue(value) {
  const raw = String(value || "unknown").trim().toLowerCase();

  if (raw === "yes") return "yes";
  if (raw === "most_likely") return "most_likely";
  if (raw === "may_do_well") return "may_do_well";
  if (raw === "no") return "no";

  return "unknown";
}

export function hasUsefulBioValue(value) {
  const normalized = normalizeBioValue(value);
  return normalized !== "unknown";
}

export function displayBioTrait(value) {
  const normalized = normalizeBioValue(value);

  if (normalized === "yes") return "Yes";
  if (normalized === "most_likely") return "Most likely";
  if (normalized === "may_do_well") return "May do well";
  if (normalized === "no") return "No";

  return "Unknown";
}

export function getTraitDisplay({ structuredValue, bioValue, evidenceBasis }) {
  if (structuredValue === true) {
    return {
      value: "Yes",
      source: "listed",
      estimated: false,
    };
  }

  if (structuredValue === false) {
    return {
      value: "No",
      source: "listed",
      estimated: false,
    };
  }

  const normalizedBio = normalizeBioValue(bioValue);

  if (normalizedBio !== "unknown") {
    const bioExplicit = evidenceBasis === "bio_explicit";
    return {
      value: displayBioTrait(normalizedBio),
      source: bioExplicit ? "bio" : "profile_inference",
      estimated: true,
      note: bioExplicit ? "Interpreted from listing bio" : "AI profile estimate",
      title: bioExplicit
        ? "AI interpretation of dog-specific wording in the shelter or rescue bio. Confirm with the source."
        : "AI estimate based on broader profile context. This is not a known behavioral fact. Confirm with the shelter or rescue.",
    };
  }

  return {
    value: "Unknown",
    source: "unknown",
    estimated: false,
  };
}
