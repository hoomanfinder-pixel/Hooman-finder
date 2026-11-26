import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  ANIMAL_FIELDS,
  FOSTER_NEEDED_FILTER,
  PRIORITY_CRITERIA_PROBE_FILTER,
  SOURCE_URGENT_FILTER,
  buildUrgencyApiUrl,
  buildUrgencyRequestBody,
  classifyRescueGroupsHttp400,
  emitDryRunSummary,
  emitPriorityCriteriaProbeOutcome,
  runSingleOrganizationUrgencyDryRun,
  runPriorityCriteriaDiagnosticProbe,
  safeDryRunFailureMessage,
  safeHttp400Reason,
  safeRequestFailureCategory,
  safeRequestFailureStage,
  safeResponseVerificationReason,
  summarizeRoster,
} = require("../../scripts/dry-run-rescuegroups-urgency-source.cjs");

function completeResponse(animals) {
  return {
    ok: true,
    json: async () => ({
      data: animals,
      included: [],
      meta: {
        count: animals.length,
        countReturned: animals.length,
        pageReturned: 1,
        limit: 100,
        pages: animals.length === 0 ? 0 : 1,
      },
    }),
  };
}

function metadataOnlyResponse(count = 0) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: [],
      meta: {
        count,
        countReturned: 0,
        pageReturned: 1,
        limit: 0,
        pages: 0,
      },
    }),
  };
}

function roster(animals) {
  return { complete: true, pages: animals.length === 0 ? 0 : 1, animals };
}

function animal(id, attributes = {}) {
  return {
    id: String(id),
    attributes: {
      url: `https://example.test/dog/${id}`,
      updatedDate: "2026-11-14T18:00:00Z",
      ...attributes,
    },
    relationships: { orgs: { data: [{ id: "8883" }] } },
  };
}

function responseByFilter({ available, urgent = [], foster = [] }) {
  return async (_url, options) => {
    const filters = JSON.parse(options.body).data.filters;
    if (filters.some((filter) => filter.fieldName === "animals.isNeedingFoster")) {
      return completeResponse(foster);
    }
    if (filters.some((filter) => filter.fieldName === "animals.priority")) {
      if (filters.some((filter) => filter.criteria === 0)) {
        return metadataOnlyResponse(urgent.length);
      }
      return completeResponse(urgent);
    }
    return completeResponse(available);
  };
}

test("signal filters reuse the proven equals operator with documented value types", () => {
  assert.deepEqual(SOURCE_URGENT_FILTER, {
    fieldName: "animals.priority",
    operation: "equals",
    criteria: "0",
  });
  assert.equal(typeof SOURCE_URGENT_FILTER.criteria, "string");
  assert.deepEqual(PRIORITY_CRITERIA_PROBE_FILTER, {
    fieldName: "animals.priority",
    operation: "equals",
    criteria: 0,
  });
  assert.equal(typeof PRIORITY_CRITERIA_PROBE_FILTER.criteria, "number");
  assert.deepEqual(FOSTER_NEEDED_FILTER, {
    fieldName: "animals.isNeedingFoster",
    operation: "equals",
    criteria: true,
  });
  assert.equal(typeof FOSTER_NEEDED_FILTER.criteria, "boolean");
});

test("numeric priority diagnostic is metadata-only and emits no animal data", async () => {
  let request;
  const result = await runPriorityCriteriaDiagnosticProbe({
    apiKey: "private-api-key",
    orgId: "8883",
    fetchImpl: async (url, options) => {
      request = { url: new URL(url), options };
      return metadataOnlyResponse(3);
    },
  });

  assert.deepEqual(result, { outcome: "accepted", reason: "not_applicable" });
  assert.equal(request.url.pathname, "/v5/public/animals/search/available/dogs/");
  assert.equal(request.url.searchParams.get("limit"), "0");
  assert.equal(request.url.searchParams.get("page"), "1");
  assert.deepEqual(JSON.parse(request.options.body).data.filters, [
    { fieldName: "orgs.id", operation: "equals", criteria: "8883" },
    { fieldName: "animals.priority", operation: "equals", criteria: 0 },
  ]);
  assert.equal(request.options.method, "POST");
});

test("numeric priority diagnostic safely classifies failures and malformed metadata", async () => {
  const sensitive400 = await runPriorityCriteriaDiagnosticProbe({
    apiKey: "private-api-key",
    orgId: "8883",
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        errors: [{
          source: { pointer: "/data/filters/1/criteria" },
          detail: "private-animal-id API_KEY=private-secret",
        }],
      }),
    }),
  });
  assert.deepEqual(sensitive400, { outcome: "http_400", reason: "filter_1_criteria" });

  for (const json of [
    { data: [] },
    { data: [{ id: "private-animal-id" }], meta: { count: 1, countReturned: 1, pageReturned: 1, limit: 0 } },
    { data: [], meta: { count: 1, countReturned: 0, pageReturned: 1, limit: 100 } },
  ]) {
    assert.deepEqual(await runPriorityCriteriaDiagnosticProbe({
      apiKey: "private-api-key",
      orgId: "8883",
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => json }),
    }), { outcome: "malformed_metadata", reason: "not_applicable" });
  }

  assert.deepEqual(await runPriorityCriteriaDiagnosticProbe({
    apiKey: "private-api-key",
    orgId: "8883",
    fetchImpl: async () => {
      throw new TypeError("private network details");
    },
  }), { outcome: "network", reason: "not_applicable" });

  assert.deepEqual(await runPriorityCriteriaDiagnosticProbe({
    apiKey: "private-api-key",
    orgId: "8883",
    timeoutMs: 1,
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("private timeout details");
        error.name = "AbortError";
        reject(error);
      });
    }),
  }), { outcome: "timeout", reason: "not_applicable" });
});

test("numeric priority diagnostic output is strictly allowlisted and redacted", () => {
  const output = [];
  const logger = { log: (message) => output.push(message) };
  emitPriorityCriteriaProbeOutcome({
    outcome: "http_400",
    reason: "private-animal-id API_KEY=private-secret",
  }, logger);
  emitPriorityCriteriaProbeOutcome({
    outcome: "private-network-path",
    reason: "Authorization: private-header",
  }, logger);
  assert.deepEqual(output.map(JSON.parse), [
    {
      diagnostic: "priority_numeric_zero_metadata_probe",
      outcome: "http_400",
      reason: "validation_unclassified",
    },
    {
      diagnostic: "priority_numeric_zero_metadata_probe",
      outcome: "unexpected_failure",
      reason: "not_applicable",
    },
  ]);
  assert.doesNotMatch(output.join("\n"), /private|API_KEY|Authorization/);
});

test("HTTP 400 validation diagnostics emit only bounded allowlisted reason codes", () => {
  const validationError = (source, title = "Ignored upstream title") => JSON.stringify({
    errors: [{
      status: 400,
      source,
      title,
      detail: "private-animal-id API_KEY=private-secret Authorization: private-header",
    }],
  });

  assert.equal(classifyRescueGroupsHttp400(validationError({
    pointer: "/data/filters/2/fieldName/animals.priority",
  })), "filter_2_field");
  assert.equal(classifyRescueGroupsHttp400(validationError({
    pointer: "/data/filters/2/operation",
  })), "filter_2_operator");
  assert.equal(classifyRescueGroupsHttp400(validationError({
    pointer: "/data/filters/2/criteria",
  })), "filter_2_criteria");
  assert.equal(classifyRescueGroupsHttp400(validationError({
    pointer: "/data/filters",
  })), "filter_structure");
  assert.equal(classifyRescueGroupsHttp400(validationError({
    parameter: "include",
  })), "query_include");
  assert.equal(classifyRescueGroupsHttp400(validationError(
    {},
    "Invalid operation"
  )), "invalid_operator");

  for (const unsafeBody of [
    "not json private-animal-id",
    JSON.stringify({ errors: [{ detail: "private-animal-id" }] }),
    JSON.stringify({ errors: [{ source: { pointer: "/private/animal/id" } }] }),
    "x".repeat(16385),
  ]) {
    assert.equal(classifyRescueGroupsHttp400(unsafeBody), "validation_unclassified");
  }
  assert.equal(
    safeHttp400Reason({ safeHttp400Reason: "private-animal-id" }),
    "validation_unclassified"
  );
});

test("DACC source request uses documented query fields and a body-only organization filter", () => {
  const url = new URL(buildUrgencyApiUrl(["available", "dogs"]));
  const body = buildUrgencyRequestBody({ orgId: "8883" });
  assert.equal(url.pathname, "/v5/public/animals/search/available/dogs/");
  assert.equal(url.searchParams.get("fields[animals]"), ANIMAL_FIELDS.join(","));
  assert.ok(ANIMAL_FIELDS.includes("orgs"), "sparse fields must retain org linkage");
  assert.equal(url.searchParams.get("fields[orgs]"), "name");
  assert.equal(url.searchParams.get("include"), "orgs");
  assert.equal(url.searchParams.get("sort"), "-animals.updatedDate");
  assert.deepEqual(body.data.filters, [
    { fieldName: "orgs.id", operation: "equals", criteria: "8883" },
  ]);
  assert.deepEqual(Object.keys(body.data), ["filters"]);
  assert.deepEqual(buildUrgencyRequestBody({
    orgId: "8883",
    signalFilter: SOURCE_URGENT_FILTER,
  }).data.filters, [
    { fieldName: "orgs.id", operation: "equals", criteria: "8883" },
    { fieldName: "animals.priority", operation: "equals", criteria: "0" },
  ]);
  assert.deepEqual(buildUrgencyRequestBody({
    orgId: "8883",
    signalFilter: PRIORITY_CRITERIA_PROBE_FILTER,
  }).data.filters, [
    { fieldName: "orgs.id", operation: "equals", criteria: "8883" },
    { fieldName: "animals.priority", operation: "equals", criteria: 0 },
  ]);
  assert.deepEqual(buildUrgencyRequestBody({
    orgId: "8883",
    signalFilter: FOSTER_NEEDED_FILTER,
  }).data.filters, [
    { fieldName: "orgs.id", operation: "equals", criteria: "8883" },
    { fieldName: "animals.isNeedingFoster", operation: "equals", criteria: true },
  ]);
  assert.doesNotMatch(JSON.stringify({ url: url.toString(), body }), /killDate|description/i);
});

test("all three complete-roster requests use available/dogs with documented AND filters", async () => {
  const paths = [];
  await runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    checkedAt: "2026-11-14T19:00:00Z",
    fetchImpl: async (url) => {
      paths.push(new URL(url).pathname);
      return completeResponse([]);
    },
  }).catch((error) => {
    assert.match(error.message, /quarantined zero-result roster/i);
  });
  assert.deepEqual(paths, ["/v5/public/animals/search/available/dogs/"]);

  paths.length = 0;
  const bodies = [];
  await runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    checkedAt: "2026-11-14T19:00:00Z",
    fetchImpl: async (url, options) => {
      const path = new URL(url).pathname;
      paths.push(path);
      const body = JSON.parse(options.body);
      bodies.push(body);
      return body.data.filters.length === 1
        ? completeResponse([animal("1", { priority: "5", isNeedingFoster: false })])
        : completeResponse([]);
    },
  });
  assert.deepEqual(paths, [
    "/v5/public/animals/search/available/dogs/",
    "/v5/public/animals/search/available/dogs/",
    "/v5/public/animals/search/available/dogs/",
    "/v5/public/animals/search/available/dogs/",
  ]);
  assert.deepEqual(bodies.map((body) => body.data.filters), [
    [{ fieldName: "orgs.id", operation: "equals", criteria: "8883" }],
    [
      { fieldName: "orgs.id", operation: "equals", criteria: "8883" },
      { fieldName: "animals.priority", operation: "equals", criteria: 0 },
    ],
    [
      { fieldName: "orgs.id", operation: "equals", criteria: "8883" },
      { fieldName: "animals.priority", operation: "equals", criteria: "0" },
    ],
    [
      { fieldName: "orgs.id", operation: "equals", criteria: "8883" },
      { fieldName: "animals.isNeedingFoster", operation: "equals", criteria: true },
    ],
  ]);
});

test("sparse responses without organization linkage still fail closed", async () => {
  const unlinked = animal("private-unlinked-id", {
    priority: "5",
    isNeedingFoster: false,
  });
  delete unlinked.relationships;

  await assert.rejects(runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    fetchImpl: responseByFilter({ available: [unlinked] }),
  }), (error) => {
    assert.match(error.message, /did not identify requested organization 8883/i);
    assert.doesNotMatch(safeDryRunFailureMessage(error), /private-unlinked-id/);
    return true;
  });
});

test("complete roster produces aggregate counts without raw records", async () => {
  const summary = await runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    checkedAt: "2026-11-14T19:00:00Z",
    fetchImpl: responseByFilter({
      available: [animal("private-animal-id", {
        name: "Private dog name",
        priority: "0",
        isNeedingFoster: true,
      })],
      urgent: [animal("private-animal-id", { priority: "0", isNeedingFoster: true })],
      foster: [animal("private-animal-id", { priority: "0", isNeedingFoster: true })],
    }),
  });
  assert.equal(summary.dogs_checked, 1);
  assert.equal(summary.explicit_source_urgent, 1);
  assert.equal(summary.explicit_foster_needed, 1);
  assert.equal(summary.cross_checks_consistent, true);
  assert.equal(summary.would_deactivate_evidence, false);

  const output = [];
  emitDryRunSummary(summary, {
    log: (message) => output.push(message),
    warn: (message) => output.push(message),
  });
  assert.doesNotMatch(output.join("\n"), /private-animal-id|Private dog name/);
});

test("field diagnostics distinguish documented types, missing, null, and unexpected types", () => {
  const animals = [
    animal("1", { priority: "0", isNeedingFoster: true }),
    animal("2", {}),
    animal("3", { priority: null, isNeedingFoster: null }),
    animal("4", { priority: 5, isNeedingFoster: "false" }),
  ];
  const summary = summarizeRoster({
    roster: roster(animals),
    urgentRoster: roster([animals[0]]),
    fosterRoster: roster([animals[0]]),
  }, "8883", "2026-11-14T19:00:00Z");

  assert.deepEqual(summary.priority_field_diagnostics, {
    valid_documented_type: 1,
    missing: 1,
    explicit_null: 1,
    unexpected_type: 1,
  });
  assert.deepEqual(summary.is_needing_foster_field_diagnostics, {
    valid_documented_type: 1,
    missing: 1,
    explicit_null: 1,
    unexpected_type: 1,
  });
});

test("missing provenance emits aggregate warnings without exposing records", () => {
  const output = [];
  emitDryRunSummary({
    dogs_checked: 1,
    unverified_signals: 2,
    dogs_with_unverified_signals: 1,
    signals_blocked_by_missing_provenance: 2,
  }, {
    log: (message) => output.push(message),
    warn: (message) => output.push(message),
  });
  const combined = output.join("\n");
  assert.match(combined, /Unverified RescueGroups urgency fields/);
  assert.match(combined, /Missing urgency provenance/);
});

test("missing credentials and incomplete rosters fail closed", async () => {
  let fetched = false;
  await assert.rejects(runSingleOrganizationUrgencyDryRun({
    apiKey: "",
    orgId: "8883",
    fetchImpl: async () => {
      fetched = true;
      return completeResponse([]);
    },
  }), /Missing RESCUEGROUPS_API_KEY/);
  assert.equal(fetched, false);

  await assert.rejects(runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: [],
        included: [],
        meta: { count: 1, countReturned: 0, pageReturned: 1, limit: 100, pages: 1 },
      }),
    }),
  }), /unique animals/i);

  await assert.rejects(runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    fetchImpl: async () => completeResponse([]),
  }), /quarantined zero-result roster/i);
});

test("positive filtered cross-check mismatches fail closed without exposing animal identifiers", async () => {
  const baseAnimal = animal("private-base-id", { priority: "0", isNeedingFoster: false });
  await assert.rejects(runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    fetchImpl: responseByFilter({ available: [baseAnimal], urgent: [], foster: [] }),
  }), (error) => {
    assert.match(error.message, /urgent cross-check mismatch/);
    assert.doesNotMatch(error.message, /private-base-id/);
    assert.equal(safeDryRunFailureMessage(error), error.message);
    return true;
  });

  await assert.rejects(runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    fetchImpl: responseByFilter({
      available: [animal("base", { priority: "5", isNeedingFoster: false })],
      urgent: [animal("private-view-id", { priority: "0", isNeedingFoster: false })],
      foster: [],
    }),
  }), (error) => {
    assert.match(error.message, /urgent cross-check mismatch/);
    assert.doesNotMatch(error.message, /private-view-id/);
    return true;
  });

  await assert.rejects(runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    fetchImpl: responseByFilter({
      available: [animal("private-foster-id", {
        priority: "5",
        isNeedingFoster: true,
      })],
      urgent: [],
      foster: [],
    }),
  }), (error) => {
    assert.match(error.message, /isNeedingFoster cross-check mismatch/);
    assert.doesNotMatch(error.message, /private-foster-id/);
    return true;
  });
});

test("malformed and wrong-organization cross-check responses fail shared validation", async () => {
  const base = animal("base", { priority: "5", isNeedingFoster: false });
  let requestNumber = 0;
  await assert.rejects(runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    fetchImpl: async () => {
      requestNumber += 1;
      if (requestNumber === 1) return completeResponse([base]);
      return { ok: true, json: async () => ({ data: [], included: [] }) };
    },
  }), /missing data or metadata/i);

  const wrongOrg = animal("wrong-org", { priority: "0", isNeedingFoster: false });
  wrongOrg.relationships.orgs.data = [{ id: "9999" }];
  await assert.rejects(runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    fetchImpl: responseByFilter({ available: [base], urgent: [wrongOrg], foster: [] }),
  }), /did not identify requested organization 8883/i);
});

test("retry and failure logs sanitize response bodies and animal identifiers", async () => {
  const warnings = [];
  await assert.rejects(runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    logger: { warn: (message) => warnings.push(message) },
    sleep: async () => {},
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      text: async () => "AnimalID=private-record API_KEY=upstream-echo",
    }),
  }), (error) => {
    assert.match(error.message, /HTTP 500/);
    assert.doesNotMatch(error.message, /private-record|upstream-echo|AnimalID|API_KEY/);
    assert.equal(
      safeDryRunFailureMessage(error),
      "RescueGroups roster could not be verified as complete (stage=available_dogs, category=http_500, reason=not_applicable); no results were emitted."
    );
    return true;
  });
  assert.doesNotMatch(warnings.join("\n"), /private-record|upstream-echo|AnimalID|API_KEY/);
  assert.doesNotMatch(
    safeDryRunFailureMessage(new Error("AnimalID=private-record API_KEY=upstream-echo")),
    /private-record|upstream-echo|AnimalID|API_KEY/
  );
});

test("safe failure diagnostics expose only bounded stage and status category", () => {
  const upstreamFailure = new Error("private upstream response body");
  upstreamFailure.status = 503;
  upstreamFailure.safeRequestStage = "urgent_view";
  assert.equal(safeRequestFailureCategory(upstreamFailure), "http_503");
  assert.equal(safeRequestFailureStage(upstreamFailure), "urgent_view");
  assert.equal(
    safeDryRunFailureMessage(upstreamFailure),
    "RescueGroups roster could not be verified as complete (stage=urgent_view, category=http_503, reason=not_applicable); no results were emitted."
  );

  const rateLimitFailure = new Error("private rate-limit response body");
  rateLimitFailure.status = 429;
  assert.equal(safeRequestFailureCategory(rateLimitFailure), "http_429");

  const networkFailure = new TypeError("private connection details");
  assert.equal(safeRequestFailureCategory(networkFailure), "network");

  const timeoutFailure = new Error("private timeout details");
  timeoutFailure.name = "AbortError";
  assert.equal(safeRequestFailureCategory(timeoutFailure), "timeout");

  const verificationFailure = new Error("private animal identifier");
  verificationFailure.name = "IncompleteRosterError";
  assert.equal(safeRequestFailureCategory(verificationFailure), "response_verification");
  verificationFailure.safeRequestStage = "private stage value";
  assert.equal(safeRequestFailureStage(verificationFailure), "unknown");

  for (const error of [upstreamFailure, rateLimitFailure, networkFailure, timeoutFailure, verificationFailure]) {
    assert.doesNotMatch(
      safeDryRunFailureMessage(error),
      /private|response body|connection details|timeout details|animal identifier/
    );
  }
});

test("HTTP 400 failure output reports a bounded pointer reason and drops raw details", async () => {
  const base = animal("private-base-id", { priority: "5", isNeedingFoster: false });
  let requestNumber = 0;
  await assert.rejects(runSingleOrganizationUrgencyDryRun({
    apiKey: "private-api-key",
    orgId: "8883",
    fetchImpl: async () => {
      requestNumber += 1;
      if (requestNumber === 1) return completeResponse([base]);
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          errors: [{
            status: 400,
            source: { pointer: "/data/filters/2/criteria" },
            title: "Invalid criteria",
            detail: "private-animal-id API_KEY=private-secret Authorization: private-header",
          }],
        }),
      };
    },
  }), (error) => {
    const safeMessage = safeDryRunFailureMessage(error);
    assert.doesNotMatch(
      error.message,
      /private-animal-id|private-secret|private-header|Authorization|API_KEY/
    );
    assert.equal(
      safeMessage,
      "RescueGroups roster could not be verified as complete (stage=urgent_view, category=http_400, reason=filter_2_criteria); no results were emitted."
    );
    assert.doesNotMatch(
      safeMessage,
      /private-base-id|private-animal-id|private-api-key|private-secret|private-header|Authorization|API_KEY/
    );
    return true;
  });
});

test("response verification diagnostics map every roster invariant to a bounded reason", () => {
  const cases = [
    ["RescueGroups returned invalid JSON for org private-org, page 1: private-body", "invalid_json"],
    ["RescueGroups response is missing data or metadata.", "missing_data_or_metadata"],
    ["Invalid RescueGroups metadata count: private-value", "invalid_metadata_count"],
    ["Invalid RescueGroups metadata countReturned: private-value", "invalid_metadata_countReturned"],
    ["Invalid RescueGroups metadata pageReturned: private-value", "invalid_metadata_pageReturned"],
    ["Invalid RescueGroups metadata limit: private-value", "invalid_metadata_limit"],
    ["Invalid RescueGroups metadata pages: private-value", "invalid_metadata_pages"],
    ["RescueGroups returned page 0 when page 1 was requested.", "page_mismatch"],
    ["RescueGroups used limit 25; expected 100.", "limit_mismatch"],
    ["RescueGroups countReturned 1 does not match 0 rows.", "count_returned_mismatch"],
    ["RescueGroups pages 1 does not match count 0 at limit 100.", "pages_mismatch"],
    ["RescueGroups returned an animal without an ID.", "missing_animal_id"],
    ["Animal private-id did not identify requested organization private-org.", "organization_linkage"],
    ["RescueGroups roster requires more than the configured 20 pages.", "max_pages"],
    ["RescueGroups reports 21 pages, exceeding the configured 20.", "max_pages"],
    ["RescueGroups roster metadata changed during pagination for org private-org.", "metadata_changed"],
    ["RescueGroups repeated animal private-id across pages for org private-org.", "duplicate_animal_id"],
    ["RescueGroups returned 1 unique animals; metadata declared 2.", "total_count_mismatch"],
  ];

  for (const [message, reason] of cases) {
    const error = new Error(message);
    error.name = "IncompleteRosterError";
    error.safeRequestStage = "urgent_view";
    assert.equal(safeResponseVerificationReason(error), reason);
    const safeMessage = safeDryRunFailureMessage(error);
    assert.match(safeMessage, new RegExp(`reason=${reason}`));
    assert.doesNotMatch(safeMessage, /private/i);
  }
});

test("workflow is manual, read-only, fixed-scope, and secret-minimal", () => {
  const workflow = readFileSync(new URL(
    "../../.github/workflows/dry-run-dacc-urgency.yml",
    import.meta.url
  ), "utf8");
  assert.match(workflow, /^on:\n {2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^\s+schedule:/m);
  assert.match(workflow, /^permissions:\n {2}contents: read\s*$/m);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /RESCUEGROUPS_API_KEY:\s*\$\{\{ secrets\.RESCUEGROUPS_API_KEY \}\}/);
  assert.equal(workflow.match(/secrets\./g)?.length, 1);
  assert.match(workflow, /node scripts\/dry-run-rescuegroups-urgency-source\.cjs --org-id=8883/);
  assert.doesNotMatch(workflow, /SUPABASE|service.role|contents:\s*write|schedule:|sync-rescuegroups-dogs/i);
});

test("pilot dependency closure excludes persistence and database migrations", () => {
  const source = readFileSync(new URL(
    "../../scripts/dry-run-rescuegroups-urgency-source.cjs",
    import.meta.url
  ), "utf8");
  assert.match(source, /rescuegroups-roster\.cjs/);
  assert.match(source, /rescuegroups-urgency-signals\.cjs/);
  assert.match(source, /animals\.priority/);
  assert.match(source, /animals\.isNeedingFoster/);
  assert.doesNotMatch(source, /\["available", "dogs", "(?:urgent|isneedingfoster)"\]/);
  assert.doesNotMatch(
    source,
    /@supabase|createClient|urgency-evidence|repository|reconcile|migration|dog_urgency_evidence/i
  );
});
