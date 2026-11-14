require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { fetchCompleteRescueGroupsRoster } = require("./rescuegroups-roster.cjs");
const {
  assessRescueGroupsUrgencySignals,
} = require("./rescuegroups-urgency-signals.cjs");

const API_URL = "https://api.rescuegroups.org/v5/public/animals/search/available/dogs";
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;

function buildUrgencyRequestBody({ orgId }) {
  return {
    data: {
      filters: [{ fieldName: "orgs.id", operation: "equals", criteria: String(orgId) }],
      sort: [{ fieldName: "animals.updatedDate", direction: "desc" }],
      fields: {
        animals: ["name", "url", "updatedDate", "priority", "isNeedingFoster"],
        orgs: ["name"],
      },
      include: ["orgs"],
    },
  };
}

function summarizeRoster(roster, orgId, checkedAt = new Date()) {
  if (!roster?.complete) throw new Error("Urgency dry run requires a proven-complete roster.");
  const checkedAtMs = new Date(checkedAt).getTime();
  if (!Number.isFinite(checkedAtMs)) throw new Error("checkedAt must be a timestamp.");

  const summary = {
    mode: "READ ONLY",
    source_provider: "rescuegroups",
    external_org_id: String(orgId),
    complete_roster: true,
    pages_checked: roster.pages,
    dogs_checked: roster.animals.length,
    explicit_source_urgent: 0,
    explicit_foster_needed: 0,
    unverified_signals: 0,
    dogs_with_unverified_signals: 0,
    signals_blocked_by_missing_provenance: 0,
    would_deactivate_evidence: false,
  };

  for (const animal of roster.animals) {
    const assessment = assessRescueGroupsUrgencySignals(animal.attributes || {});
    const sourceUrl = String(animal.attributes?.url || "");
    const sourceUpdatedAtMs = Date.parse(animal.attributes?.updatedDate);
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

  const roster = await fetchCompleteRescueGroupsRoster({
    apiUrl: API_URL,
    apiKey,
    orgId: String(orgId),
    buildRequestBody: buildUrgencyRequestBody,
    fetchImpl,
    pageLimit: PAGE_LIMIT,
    maxPages: MAX_PAGES,
    timeoutMs: 30000,
    maxAttempts: 3,
    retryDelayMs: 1000,
    logger: safeRosterLogger,
    ...(sleep ? { sleep } : {}),
  });
  if (!roster.staleMarkingAllowed) {
    throw new Error("RescueGroups returned a quarantined zero-result roster.");
  }

  return summarizeRoster(roster, orgId, checkedAt);
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
  API_URL,
  buildUrgencyRequestBody,
  emitDryRunSummary,
  runSingleOrganizationUrgencyDryRun,
  safeDryRunFailureMessage,
  summarizeRoster,
};
