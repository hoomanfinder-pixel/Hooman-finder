require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { fetchCompleteRescueGroupsRoster } = require("./rescuegroups-roster.cjs");
const {
  assessRescueGroupsUrgencySignals,
} = require("./rescuegroups-urgency-signals.cjs");

const API_BASE_URL = "https://api.rescuegroups.org/v5/public/animals/search";
const ANIMAL_FIELDS = ["name", "url", "updatedDate", "priority", "isNeedingFoster"];
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;

function buildUrgencyApiUrl(views = ["available", "dogs"]) {
  const url = new URL(`${API_BASE_URL}/${views.join("/")}`);
  url.searchParams.set("fields[animals]", ANIMAL_FIELDS.join(","));
  url.searchParams.set("fields[orgs]", "name");
  url.searchParams.set("include", "orgs");
  url.searchParams.set("sort", "-animals.updatedDate");
  return url.toString();
}

function buildUrgencyRequestBody({ orgId }) {
  return {
    data: {
      filters: [{ fieldName: "orgs.id", operation: "equals", criteria: String(orgId) }],
    },
  };
}

function fieldShape(attributes, fieldName, documentedType) {
  if (!Object.hasOwn(attributes || {}, fieldName)) return "missing";
  if (attributes[fieldName] === null) return "explicit_null";
  return typeof attributes[fieldName] === documentedType
    ? "valid_documented_type"
    : "unexpected_type";
}

function emptyFieldDiagnostics() {
  return {
    valid_documented_type: 0,
    missing: 0,
    explicit_null: 0,
    unexpected_type: 0,
  };
}

function assertMatchingPositiveSets(label, fieldPositiveIds, viewPositiveIds) {
  const fieldOnly = [...fieldPositiveIds].filter((id) => !viewPositiveIds.has(id)).length;
  const viewOnly = [...viewPositiveIds].filter((id) => !fieldPositiveIds.has(id)).length;
  if (fieldOnly > 0 || viewOnly > 0) {
    throw new Error(
      `${label} cross-check mismatch: field_only=${fieldOnly}, view_only=${viewOnly}.`
    );
  }
}

function summarizeRoster({ roster, urgentRoster, fosterRoster }, orgId, checkedAt = new Date()) {
  if (!roster?.complete) throw new Error("Urgency dry run requires a proven-complete roster.");
  if (!urgentRoster?.complete || !fosterRoster?.complete) {
    throw new Error("Urgency dry run requires proven-complete cross-check views.");
  }
  const checkedAtMs = new Date(checkedAt).getTime();
  if (!Number.isFinite(checkedAtMs)) throw new Error("checkedAt must be a timestamp.");

  const priorityDiagnostics = emptyFieldDiagnostics();
  const fosterDiagnostics = emptyFieldDiagnostics();
  const priorityPositiveIds = new Set();
  const fosterPositiveIds = new Set();
  const urgentViewIds = new Set(urgentRoster.animals.map((animal) => String(animal.id)));
  const fosterViewIds = new Set(fosterRoster.animals.map((animal) => String(animal.id)));

  const summary = {
    mode: "READ ONLY",
    source_provider: "rescuegroups",
    external_org_id: String(orgId),
    complete_roster: true,
    pages_checked: roster.pages,
    urgent_view_pages_checked: urgentRoster.pages,
    foster_view_pages_checked: fosterRoster.pages,
    dogs_checked: roster.animals.length,
    explicit_source_urgent: 0,
    explicit_foster_needed: 0,
    unverified_signals: 0,
    dogs_with_unverified_signals: 0,
    signals_blocked_by_missing_provenance: 0,
    priority_field_diagnostics: priorityDiagnostics,
    is_needing_foster_field_diagnostics: fosterDiagnostics,
    urgent_view_matches: urgentViewIds.size,
    is_needing_foster_view_matches: fosterViewIds.size,
    cross_checks_consistent: false,
    would_deactivate_evidence: false,
  };

  for (const animal of roster.animals) {
    const attributes = animal.attributes || {};
    const assessment = assessRescueGroupsUrgencySignals(attributes);
    priorityDiagnostics[fieldShape(attributes, "priority", "string")] += 1;
    fosterDiagnostics[fieldShape(attributes, "isNeedingFoster", "boolean")] += 1;
    if (assessment.sourceUrgent) priorityPositiveIds.add(String(animal.id));
    if (assessment.fosterNeeded) fosterPositiveIds.add(String(animal.id));

    const sourceUrl = String(attributes.url || "");
    const sourceUpdatedAtMs = Date.parse(attributes.updatedDate);
    const hasVerifiableProvenance = sourceUrl.startsWith("https://") &&
      Number.isFinite(sourceUpdatedAtMs) && sourceUpdatedAtMs <= checkedAtMs;
    const blockedPositiveSignals = hasVerifiableProvenance
      ? 0
      : Number(assessment.sourceUrgent) + Number(assessment.fosterNeeded);
    summary.explicit_source_urgent += Number(assessment.sourceUrgent);
    summary.explicit_foster_needed += Number(assessment.fosterNeeded);
    summary.unverified_signals += assessment.unverifiedSignalCount + blockedPositiveSignals;
    summary.signals_blocked_by_missing_provenance += blockedPositiveSignals;
    summary.dogs_with_unverified_signals += Number(
      assessment.unverifiedSignalCount + blockedPositiveSignals > 0
    );
  }

  assertMatchingPositiveSets("urgent", priorityPositiveIds, urgentViewIds);
  assertMatchingPositiveSets("isNeedingFoster", fosterPositiveIds, fosterViewIds);
  summary.cross_checks_consistent = true;

  return summary;
}

async function runSingleOrganizationUrgencyDryRun({
  apiKey,
  orgId,
  fetchImpl = fetch,
  logger = console,
  sleep,
  checkedAt = new Date(),
}) {
  if (!apiKey) throw new Error("Missing RESCUEGROUPS_API_KEY.");
  if (!/^\d+$/.test(String(orgId || ""))) {
    throw new Error("A numeric --org-id is required.");
  }

  const safeRosterLogger = {
    warn: () => logger.warn(
      "RescueGroups request attempt failed; retrying the complete-roster check."
    ),
  };

  const fetchRoster = (views, allowVerifiedEmptyRoster = false) =>
    fetchCompleteRescueGroupsRoster({
      apiUrl: buildUrgencyApiUrl(views),
      apiKey,
      orgId: String(orgId),
      buildRequestBody: buildUrgencyRequestBody,
      fetchImpl,
      pageLimit: PAGE_LIMIT,
      maxPages: MAX_PAGES,
      timeoutMs: 30000,
      allowVerifiedEmptyRoster,
      maxAttempts: 3,
      retryDelayMs: 1000,
      logger: safeRosterLogger,
      ...(sleep ? { sleep } : {}),
    });

  const roster = await fetchRoster(["available", "dogs"]);
  if (!roster.staleMarkingAllowed) {
    throw new Error("RescueGroups returned a quarantined zero-result roster.");
  }
  const urgentRoster = await fetchRoster(["available", "urgent", "dogs"], true);
  const fosterRoster = await fetchRoster(
    ["available", "isneedingfoster", "dogs"],
    true
  );

  return summarizeRoster({ roster, urgentRoster, fosterRoster }, orgId, checkedAt);
}

function parseOrgId(argv) {
  const argument = argv.find((value) => value.startsWith("--org-id="));
  return argument?.slice("--org-id=".length) || null;
}

function emitDryRunSummary(summary, logger = console) {
  logger.log(JSON.stringify(summary, null, 2));
  if (summary.unverified_signals > 0) {
    logger.warn(
      `::warning title=Unverified RescueGroups urgency fields::${summary.unverified_signals} signal fields could not be verified across ${summary.dogs_with_unverified_signals} dogs.`
    );
  }
  if (summary.signals_blocked_by_missing_provenance > 0) {
    logger.warn(
      `::warning title=Missing urgency provenance::${summary.signals_blocked_by_missing_provenance} positive signals were excluded from verified evidence because their source URL or timestamp was unavailable or invalid.`
    );
  }
}

function safeDryRunFailureMessage(error) {
  if (error?.message === "Missing RESCUEGROUPS_API_KEY.") return error.message;
  if (error?.message === "A numeric --org-id is required.") return error.message;
  if (/^(urgent|isNeedingFoster) cross-check mismatch: field_only=\d+, view_only=\d+\.$/.test(
    error?.message || ""
  )) return error.message;
  return "RescueGroups roster could not be verified as complete; no results were emitted.";
}

async function main() {
  const orgId = parseOrgId(process.argv.slice(2));
  const summary = await runSingleOrganizationUrgencyDryRun({
    apiKey: process.env.RESCUEGROUPS_API_KEY,
    orgId,
  });
  emitDryRunSummary(summary);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Urgency source dry run failed: ${safeDryRunFailureMessage(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  ANIMAL_FIELDS,
  API_BASE_URL,
  assertMatchingPositiveSets,
  buildUrgencyApiUrl,
  buildUrgencyRequestBody,
  emitDryRunSummary,
  runSingleOrganizationUrgencyDryRun,
  safeDryRunFailureMessage,
  summarizeRoster,
};
