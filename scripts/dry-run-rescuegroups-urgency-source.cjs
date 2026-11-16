require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { fetchCompleteRescueGroupsRoster } = require("./rescuegroups-roster.cjs");
const {
  assessRescueGroupsUrgencySignals,
} = require("./rescuegroups-urgency-signals.cjs");

const API_BASE_URL = "https://api.rescuegroups.org/v5/public/animals/search";
const ANIMAL_FIELDS = [
  "name",
  "url",
  "updatedDate",
  "priority",
  "isNeedingFoster",
  "orgs",
];
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;
const SOURCE_URGENT_FILTER = Object.freeze({
  fieldName: "animals.priority",
  operation: "equals",
  criteria: "0",
});
const FOSTER_NEEDED_FILTER = Object.freeze({
  fieldName: "animals.isNeedingFoster",
  operation: "equals",
  criteria: true,
});
const MAX_VALIDATION_ERROR_BODY_CHARS = 16384;
const HTTP_400_REASON_PATTERN = /^(?:filter_[0-9]_(?:field|operator|criteria)|filter_structure|filter_processing|query_(?:fields|include|sort|page|limit)|invalid_(?:field|operator|criteria|filter|parameter)|validation_unclassified)$/;

function buildUrgencyApiUrl(views = ["available", "dogs"]) {
  const url = new URL(`${API_BASE_URL}/${views.join("/")}/`);
  url.searchParams.set("fields[animals]", ANIMAL_FIELDS.join(","));
  url.searchParams.set("fields[orgs]", "name");
  url.searchParams.set("include", "orgs");
  url.searchParams.set("sort", "-animals.updatedDate");
  return url.toString();
}

function buildUrgencyRequestBody({ orgId, signalFilter = null }) {
  const filters = [
    { fieldName: "orgs.id", operation: "equals", criteria: String(orgId) },
  ];
  if (signalFilter) filters.push(signalFilter);
  return {
    data: {
      filters,
    },
  };
}

function classifyRescueGroupsHttp400(body) {
  if (typeof body !== "string" || body.length > MAX_VALIDATION_ERROR_BODY_CHARS) {
    return "validation_unclassified";
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return "validation_unclassified";
  }
  if (!Array.isArray(json?.errors)) return "validation_unclassified";

  const parameterReasons = new Map([
    ["fields[animals]", "query_fields"],
    ["include", "query_include"],
    ["sort", "query_sort"],
    ["page", "query_page"],
    ["limit", "query_limit"],
  ]);
  const titleReasons = new Map([
    ["invalid field", "invalid_field"],
    ["invalid operation", "invalid_operator"],
    ["invalid operator", "invalid_operator"],
    ["invalid criteria", "invalid_criteria"],
    ["invalid filter", "invalid_filter"],
    ["invalid parameter", "invalid_parameter"],
  ]);

  for (const upstreamError of json.errors.slice(0, 5)) {
    const pointer = upstreamError?.source?.pointer;
    if (typeof pointer === "string") {
      const filterComponent = pointer.match(
        /^\/data\/filters\/([0-9])\/(fieldName|operation|criteria)(?:\/[^/\s]{1,64})?$/
      );
      if (filterComponent) {
        const component = {
          fieldName: "field",
          operation: "operator",
          criteria: "criteria",
        }[filterComponent[2]];
        return `filter_${filterComponent[1]}_${component}`;
      }
      if (/^\/data\/filters(?:\/[0-9])?$/.test(pointer)) return "filter_structure";
      if (pointer === "/data/filterProcessing") return "filter_processing";
    }

    const parameterReason = parameterReasons.get(upstreamError?.source?.parameter);
    if (parameterReason) return parameterReason;

    const title = typeof upstreamError?.title === "string"
      ? upstreamError.title.trim().toLowerCase()
      : "";
    const titleReason = titleReasons.get(title);
    if (titleReason) return titleReason;
  }

  return "validation_unclassified";
}

function safeHttp400Reason(error) {
  const reason = String(error?.safeHttp400Reason || "");
  return HTTP_400_REASON_PATTERN.test(reason) ? reason : "validation_unclassified";
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

  const fetchRoster = async (
    requestStage,
    signalFilter = null,
    allowVerifiedEmptyRoster = false
  ) => {
    let http400Reason = "validation_unclassified";
    const diagnosticFetchImpl = async (...args) => {
      const response = await fetchImpl(...args);
      if (Number(response?.status) !== 400 || typeof response.text !== "function") {
        return response;
      }
      return {
        ok: response.ok,
        status: response.status,
        text: async () => {
          const body = await response.text();
          http400Reason = classifyRescueGroupsHttp400(body);
          return "[RescueGroups HTTP 400 response redacted]";
        },
      };
    };
    try {
      return await fetchCompleteRescueGroupsRoster({
        apiUrl: buildUrgencyApiUrl(),
        apiKey,
        orgId: String(orgId),
        buildRequestBody: ({ orgId: requestedOrgId }) => buildUrgencyRequestBody({
          orgId: requestedOrgId,
          signalFilter,
        }),
        fetchImpl: diagnosticFetchImpl,
        pageLimit: PAGE_LIMIT,
        maxPages: MAX_PAGES,
        timeoutMs: 30000,
        allowVerifiedEmptyRoster,
        maxAttempts: 3,
        retryDelayMs: 1000,
        logger: safeRosterLogger,
        ...(sleep ? { sleep } : {}),
      });
    } catch (error) {
      error.safeRequestStage = requestStage;
      if (Number(error?.status) === 400) error.safeHttp400Reason = http400Reason;
      throw error;
    }
  };

  const roster = await fetchRoster("available_dogs");
  if (!roster.staleMarkingAllowed) {
    throw new Error("RescueGroups returned a quarantined zero-result roster.");
  }
  const urgentRoster = await fetchRoster("urgent_view", SOURCE_URGENT_FILTER, true);
  const fosterRoster = await fetchRoster(
    "foster_view",
    FOSTER_NEEDED_FILTER,
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

function safeRequestFailureCategory(error) {
  const status = Number(error?.status);
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return `http_${status}`;
  }
  if (error?.name === "AbortError") return "timeout";
  if (error instanceof TypeError) return "network";
  if (error?.name === "IncompleteRosterError") return "response_verification";
  return "unknown";
}

function safeRequestFailureStage(error) {
  const allowedStages = new Set(["available_dogs", "urgent_view", "foster_view"]);
  return allowedStages.has(error?.safeRequestStage) ? error.safeRequestStage : "unknown";
}

function safeResponseVerificationReason(error) {
  const message = String(error?.message || "");
  const exactPatterns = [
    [/^RescueGroups returned invalid JSON /, "invalid_json"],
    [/^RescueGroups response is missing data or metadata\.$/, "missing_data_or_metadata"],
    [/^RescueGroups returned page \d+ when page \d+ was requested\.$/, "page_mismatch"],
    [/^RescueGroups used limit \d+; expected \d+\.$/, "limit_mismatch"],
    [/^RescueGroups countReturned \d+ does not match \d+ rows\.$/, "count_returned_mismatch"],
    [/^RescueGroups pages \d+ does not match count \d+ at limit \d+\.$/, "pages_mismatch"],
    [/^RescueGroups returned an animal without an ID\.$/, "missing_animal_id"],
    [/^Animal .+ did not identify requested organization .+\.$/, "organization_linkage"],
    [/^RescueGroups roster requires more than the configured \d+ pages\.$/, "max_pages"],
    [/^RescueGroups reports \d+ pages, exceeding the configured \d+\.$/, "max_pages"],
    [/^RescueGroups roster metadata changed during pagination /, "metadata_changed"],
    [/^RescueGroups repeated animal .+ across pages /, "duplicate_animal_id"],
    [/^RescueGroups returned \d+ unique animals; metadata declared \d+\.$/, "total_count_mismatch"],
  ];
  const matched = exactPatterns.find(([pattern]) => pattern.test(message));
  if (matched) return matched[1];

  const invalidMetadata = message.match(
    /^Invalid RescueGroups metadata (count|countReturned|pageReturned|limit|pages):/
  );
  if (invalidMetadata) return `invalid_metadata_${invalidMetadata[1]}`;
  return "unknown";
}

function safeDryRunFailureMessage(error) {
  if (error?.message === "Missing RESCUEGROUPS_API_KEY.") return error.message;
  if (error?.message === "A numeric --org-id is required.") return error.message;
  if (/^(urgent|isNeedingFoster) cross-check mismatch: field_only=\d+, view_only=\d+\.$/.test(
    error?.message || ""
  )) return error.message;
  const category = safeRequestFailureCategory(error);
  const stage = safeRequestFailureStage(error);
  const reason = category === "response_verification"
    ? safeResponseVerificationReason(error)
    : category === "http_400"
      ? safeHttp400Reason(error)
      : "not_applicable";
  return `RescueGroups roster could not be verified as complete (stage=${stage}, category=${category}, reason=${reason}); no results were emitted.`;
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
  FOSTER_NEEDED_FILTER,
  SOURCE_URGENT_FILTER,
  assertMatchingPositiveSets,
  buildUrgencyApiUrl,
  buildUrgencyRequestBody,
  classifyRescueGroupsHttp400,
  emitDryRunSummary,
  runSingleOrganizationUrgencyDryRun,
  safeDryRunFailureMessage,
  safeHttp400Reason,
  safeRequestFailureCategory,
  safeRequestFailureStage,
  safeResponseVerificationReason,
  summarizeRoster,
};
