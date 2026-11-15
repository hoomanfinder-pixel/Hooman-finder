import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  ANIMAL_FIELDS,
  buildUrgencyApiUrl,
  buildUrgencyRequestBody,
  emitDryRunSummary,
  runSingleOrganizationUrgencyDryRun,
  safeDryRunFailureMessage,
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

function responseByView({ available, urgent = [], foster = [] }) {
  return async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname.includes("/isneedingfoster/")) return completeResponse(foster);
    if (pathname.includes("/urgent/")) return completeResponse(urgent);
    return completeResponse(available);
  };
}

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
  assert.doesNotMatch(JSON.stringify({ url: url.toString(), body }), /killDate|description/i);
});

test("cross-check requests use documented available/dogs/trait view order", async () => {
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
  await runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    checkedAt: "2026-11-14T19:00:00Z",
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      paths.push(path);
      return path.endsWith("/available/dogs/")
        ? completeResponse([animal("1", { priority: "5", isNeedingFoster: false })])
        : completeResponse([]);
    },
  });
  assert.deepEqual(paths, [
    "/v5/public/animals/search/available/dogs/",
    "/v5/public/animals/search/available/dogs/urgent/",
    "/v5/public/animals/search/available/dogs/isneedingfoster/",
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
    fetchImpl: responseByView({ available: [unlinked] }),
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
    fetchImpl: responseByView({
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

test("positive view mismatches fail closed without exposing animal identifiers", async () => {
  const baseAnimal = animal("private-base-id", { priority: "0", isNeedingFoster: false });
  await assert.rejects(runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    fetchImpl: responseByView({ available: [baseAnimal], urgent: [], foster: [] }),
  }), (error) => {
    assert.match(error.message, /urgent cross-check mismatch/);
    assert.doesNotMatch(error.message, /private-base-id/);
    assert.equal(safeDryRunFailureMessage(error), error.message);
    return true;
  });

  await assert.rejects(runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    fetchImpl: responseByView({
      available: [animal("base", { priority: "5", isNeedingFoster: false })],
      urgent: [animal("private-view-id", { priority: "0", isNeedingFoster: false })],
      foster: [],
    }),
  }), (error) => {
    assert.match(error.message, /urgent cross-check mismatch/);
    assert.doesNotMatch(error.message, /private-view-id/);
    return true;
  });
});

test("malformed and wrong-organization view responses fail through shared roster validation", async () => {
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
    fetchImpl: responseByView({ available: [base], urgent: [wrongOrg], foster: [] }),
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
  }), /private-record/);
  assert.doesNotMatch(warnings.join("\n"), /private-record|upstream-echo|AnimalID|API_KEY/);
  assert.doesNotMatch(
    safeDryRunFailureMessage(new Error("AnimalID=private-record API_KEY=upstream-echo")),
    /private-record|upstream-echo|AnimalID|API_KEY/
  );
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
  assert.match(source, /\["available", "dogs", "urgent"\]/);
  assert.match(source, /\["available", "dogs", "isneedingfoster"\]/);
  assert.doesNotMatch(
    source,
    /@supabase|createClient|urgency-evidence|repository|reconcile|migration|dog_urgency_evidence/i
  );
});
