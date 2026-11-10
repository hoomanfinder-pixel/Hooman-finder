const SOURCE_LABELS = Object.freeze({
  structured: "Shelter-listed",
  bio_explicit: "From listing bio",
  breed_coat_inference: "Estimated",
  profile_inference: "Estimated",
  mixed: "Mixed evidence sources",
});

export function hasRealFitScore(scorePct, breakdown) {
  if (breakdown?.enoughQuizInfo === false) return false;
  if (scorePct === null || scorePct === undefined || scorePct === "") return false;
  return Number.isFinite(Number(scorePct));
}

export function formatFitScore(scorePct) {
  return scorePct !== null && scorePct !== undefined && scorePct !== "" && Number.isFinite(Number(scorePct))
    ? `Fit score: ${Math.round(Number(scorePct))}/100`
    : "Fit score unavailable";
}

function naturalList(items) {
  const labels = items.filter(Boolean);
  if (labels.length <= 1) return labels[0] || "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export function getFitScoreScope(breakdown) {
  const labels = Array.isArray(breakdown?.activePreferenceLabels)
    ? breakdown.activePreferenceLabels.filter(Boolean)
    : [];
  const countValue = breakdown?.activePreferenceCount ?? breakdown?.answeredCount;
  const count = Number.isFinite(Number(countValue)) ? Number(countValue) : labels.length;
  const preferenceNoun = count === 1 ? "preference" : "preferences";
  const namedPreferences = labels.length ? `: ${naturalList(labels)}` : "";
  const summary = count > 0
    ? `Based on ${count} scored ${preferenceNoun}${namedPreferences}.`
    : "";

  const requestedWeight = Number(breakdown?.evidenceRequestedWeight);
  const coveredWeight = Number(breakdown?.evidenceCoveredWeight);
  const hasMissingEvidence = breakdown?.limitedInformation === true || (
    Number.isFinite(requestedWeight) &&
    Number.isFinite(coveredWeight) &&
    coveredWeight < requestedWeight
  );
  const evidenceSummary = count > 0
    ? hasMissingEvidence
      ? "Limited listing information for these scored preferences."
      : "Information is available for all scored preferences."
    : "";
  const prominent = count > 0
    ? `Based on ${count} scored ${preferenceNoun}`
    : "";

  return {
    count,
    labels,
    summary,
    evidenceSummary,
    prominent,
    compact: count > 0
      ? `${count} scored ${preferenceNoun} · ${hasMissingEvidence ? "Limited information" : "Information available"}`
      : "",
    limited: hasMissingEvidence,
  };
}

export function getRankingSignalKey(row) {
  const score = Number.isFinite(Number(row?.scorePct)) ? Number(row.scorePct) : -1;
  const coverage = Number(row?.breakdown?.coverageComponent || 0);
  const rawCompatibility = Number(row?.breakdown?.rawCompatibility || 0);
  return JSON.stringify([score, coverage, rawCompatibility]);
}

export function evidenceSourceLabel(source) {
  return SOURCE_LABELS[source] || "Source not specified";
}

export function getEvidenceLabels(breakdown) {
  const labels = [];
  const sources = new Set(
    (Array.isArray(breakdown?.contributions) ? breakdown.contributions : [])
      .map((contribution) => contribution?.source)
      .filter(Boolean)
  );

  if (sources.has("structured")) labels.push(SOURCE_LABELS.structured);
  if (sources.has("bio_explicit")) labels.push(SOURCE_LABELS.bio_explicit);
  if (sources.has("breed_coat_inference") || sources.has("profile_inference")) {
    labels.push(SOURCE_LABELS.profile_inference);
  }
  if (sources.has("mixed")) labels.push(SOURCE_LABELS.mixed);

  const requestedWeight = Number(breakdown?.evidenceRequestedWeight);
  const coveredWeight = Number(breakdown?.evidenceCoveredWeight);
  if (
    breakdown?.limitedInformation === true ||
    (Number.isFinite(requestedWeight) &&
      Number.isFinite(coveredWeight) &&
      coveredWeight < requestedWeight)
  ) {
    labels.push("Some information unknown");
  }

  return labels;
}

function contributionItems(breakdown, key, fallbackKey, limit) {
  const contributions = Array.isArray(breakdown?.[key]) ? breakdown[key] : [];
  const items = contributions
    .filter((contribution) => contribution?.explanation)
    .map((contribution) => ({
      explanation: contribution.explanation,
      source: contribution.source,
      sourceLabel: evidenceSourceLabel(contribution.source),
    }));

  if (items.length) return items.slice(0, limit);

  const fallback = Array.isArray(breakdown?.[fallbackKey])
    ? breakdown[fallbackKey]
    : [];
  return fallback
    .filter(Boolean)
    .map((explanation) => ({
      explanation,
      source: null,
      sourceLabel: "Source not specified",
    }))
    .slice(0, limit);
}

export function getPositiveEvidenceItems(breakdown, limit = 4) {
  return contributionItems(
    breakdown,
    "positiveContributions",
    "matchReasons",
    limit
  );
}

export function getTradeoffEvidenceItems(breakdown, limit = 1) {
  return contributionItems(
    breakdown,
    "tradeoffContributions",
    "matchTradeoffs",
    limit
  );
}
