import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  buildUrgencyRequestBody,
  emitDryRunSummary,
  runSingleOrganizationUrgencyDryRun,
  safeDryRunFailureMessage,
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

test("DACC source request is fixed to organization 8883 and supported fields", () => {
  const body = buildUrgencyRequestBody({ orgId: "8883" });
  assert.deepEqual(body.data.filters, [
    { fieldName: "orgs.id", operation: "equals", criteria: "8883" },
  ]);
  assert.deepEqual(body.data.fields.animals, [
    "name", "url", "updatedDate", "priority", "isNeedingFoster",
  ]);
  assert.doesNotMatch(JSON.stringify(body), /killDate|description/i);
});

test("complete roster produces aggregate counts without raw records", async () => {
  const summary = await runSingleOrganizationUrgencyDryRun({
    apiKey: "test-key",
    orgId: "8883",
    checkedAt: "2026-11-14T19:00:00Z",
    fetchImpl: async () => completeResponse([
      {
        id: "private-animal-id",
        attributes: {
          name: "Private dog name",
          priority: 0,
          isNeedingFoster: true,
          url: "https://example.test/dog",
          updatedDate: "2026-11-14T18:00:00Z",
        },
        relationships: { orgs: { data: [{ id: "8883" }] } },
      },
    ]),
  });
  assert.equal(summary.dogs_checked, 1);
  assert.equal(summary.explicit_source_urgent, 1);
  assert.equal(summary.explicit_foster_needed, 1);
  assert.equal(summary.would_deactivate_evidence, false);

  const output = [];
  emitDryRunSummary(summary, {
    log: (message) => output.push(message),
    warn: (message) => output.push(message),
  });
  assert.doesNotMatch(output.join("\n"), /private-animal-id|Private dog name/);
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
  assert.doesNotMatch(
    source,
    /@supabase|createClient|urgency-evidence|repository|reconcile|migration|dog_urgency_evidence/i
  );
});
