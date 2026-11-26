import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildMonitoringMarkdown,
  classifyExternalLinkResult,
  classifyMonitoringRequest,
  evaluateMonitoringCredentials,
  evaluatePublicDogFreshness,
  evaluateSyncApiFailure,
  evaluateSyncRuns,
  evaluateSourceFreshnessArtifact,
  hasActionableFailure,
  runWebsiteJourney,
} from "./productionMonitoring.js";

function healthyAdapter(overrides = {}) {
  return {
    loadHomepage: async () => {},
    loadQuiz: async () => {},
    completeQuiz: async () => {},
    waitForMatch: async () => ({ profileHref: "/dog/healthy-dog" }),
    openProfile: async () => ({ url: "https://hoomanfinder.com/dog/healthy-dog" }),
    findAdoptionDestination: async () => "https://rescue.example.org/dogs/healthy-dog",
    getCriticalErrors: async () => [],
    ...overrides,
  };
}

test("healthy production journey passes every adoption-blocking check", async () => {
  const result = await runWebsiteJourney(healthyAdapter(), { matchTimeoutMs: 50 });
  assert.equal(result.checks.filter(({ status }) => status === "fail").length, 0);
  assert.equal(result.checks.filter(({ status }) => status === "pass").length, 6);
});

test("slow but successful matching is accepted within the reasonable timeout", async () => {
  const adapter = healthyAdapter({
    waitForMatch: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { profileHref: "/dog/slow-dog" };
    },
  });
  const result = await runWebsiteJourney(adapter, { matchTimeoutMs: 80 });
  assert.equal(result.checks.find(({ name }) => name === "Quiz-to-results journey").status, "pass");
});

test("broken profile route is reported as an adoption-blocking failure", async () => {
  const result = await runWebsiteJourney(healthyAdapter({
    openProfile: async () => { throw new Error("Profile route returned the not-found page"); },
  }));
  const profile = result.checks.find(({ name }) => name === "Matched dog profile");
  assert.equal(profile.status, "fail");
  assert.equal(profile.blocksAdoption, true);
});

test("missing adoption destination is reported without inventing a replacement", async () => {
  const result = await runWebsiteJourney(healthyAdapter({
    findAdoptionDestination: async () => "",
  }));
  assert.equal(result.checks.find(({ name }) => name === "Official adoption destination").status, "fail");
});

test("third-party blocks, rate limits, and timeouts remain informational by themselves", () => {
  const timeout = classifyExternalLinkResult({
    url: "https://rescue.example.org/apply",
    error: "request_timeout_12000ms",
  });
  const botBlock = classifyExternalLinkResult({
    url: "https://rescue.example.org/apply",
    error: "http_403",
  });
  const rateLimit = classifyExternalLinkResult({
    url: "https://rescue.example.org/apply",
    error: "http_429",
  });
  assert.equal(timeout.status, "temporary_failure");
  assert.equal(botBlock.status, "blocked");
  assert.equal(rateLimit.status, "temporary_failure");
  assert.equal(hasActionableFailure([timeout, botBlock, rateLimit]), false);

  assert.equal(classifyExternalLinkResult({
    url: "https://rescue.example.org/missing",
    error: "http_404",
  }).status, "confirmed_broken");
});

test("stale successful sync evidence is actionable without asserting every shelter refreshed", () => {
  const now = Date.parse("2026-11-20T16:00:00.000Z");
  const result = evaluateSyncRuns([{
    status: "completed",
    conclusion: "success",
    created_at: "2026-11-18T12:00:00.000Z",
    updated_at: "2026-11-18T13:00:00.000Z",
  }], { now });
  assert.equal(result.status, "fail");
  assert.match(result.detail, /successful sync/i);
});

test("latest failed sync remains a failure even when an older complete sync is recent", () => {
  const now = Date.parse("2026-11-25T16:00:00.000Z");
  const result = evaluateSyncRuns([
    { id: 2, status: "completed", conclusion: "failure", created_at: "2026-11-25T12:00:00.000Z", updated_at: "2026-11-25T12:10:00.000Z" },
    { id: 1, status: "completed", conclusion: "success", created_at: "2026-11-24T12:00:00.000Z", updated_at: "2026-11-24T12:10:00.000Z" },
  ], { now });
  assert.equal(result.status, "fail");
  assert.match(result.detail, /latest completed sync run concluded failure/i);
});

test("in-progress latest sync is never reported as a completed success", () => {
  const result = evaluateSyncRuns([{ status: "in_progress", conclusion: null, created_at: "2026-11-25T15:50:00.000Z" }]);
  assert.equal(result.status, "unverified");
  assert.match(result.detail, /latest sync run is in_progress/i);
});

test("source-health artifact distinguishes complete, partial, and stale sources after provenance checks", () => {
  const latestRun = { id: 42, run_attempt: 2, head_sha: "abc123" };
  const artifact = {
    schema_version: 1,
    repository: "owner/repo",
    run_id: 42,
    run_attempt: 2,
    head_sha: "abc123",
    generated_at: "2026-11-25T15:00:00.000Z",
    sources: [
      { source: "Fresh Shelter", enabled: true, status: "success", last_successful_sync_at: "2026-11-25T14:00:00.000Z" },
      { source: "Partial Shelter", enabled: true, status: "failed", last_successful_sync_at: "2026-11-25T14:00:00.000Z" },
      { source: "Stale Shelter", enabled: true, status: "failed", last_successful_sync_at: "2026-11-20T14:00:00.000Z" },
      { source: "Disabled Shelter", enabled: false, status: "disabled", last_successful_sync_at: null },
    ],
  };
  const checks = evaluateSourceFreshnessArtifact(artifact, latestRun, {
    now: Date.parse("2026-11-25T16:00:00.000Z"),
    repository: "owner/repo",
  });
  assert.deepEqual(checks.map(({ status }) => status), ["pass", "partial", "fail"]);
  assert.equal(hasActionableFailure(checks), true);

  const wrongProvenance = evaluateSourceFreshnessArtifact({ ...artifact, head_sha: "different" }, latestRun, { repository: "owner/repo" });
  assert.equal(wrongProvenance[0].status, "unverified");
  const missingArtifact = evaluateSourceFreshnessArtifact(null, latestRun, { repository: "owner/repo" });
  assert.equal(missingArtifact[0].status, "unverified");
  const expired = evaluateSourceFreshnessArtifact({ ...artifact, generated_at: "2026-11-10T00:00:00.000Z" }, latestRun, {
    now: Date.parse("2026-11-25T16:00:00.000Z"), repository: "owner/repo",
  });
  assert.equal(expired[0].status, "unverified");
});

test("partial source evidence is visible as actionable without being mislabeled complete", () => {
  const markdown = buildMonitoringMarkdown({
    checkedAt: "2026-11-25T16:00:00.000Z",
    checks: [{ name: "RescueGroups source: Shelter", status: "partial", detail: "Latest attempt partial.", blocksAdoption: false }],
  });
  assert.match(markdown, /partial result\(s\) need review/i);
  assert.match(markdown, /⚠️/);
  assert.equal(hasActionableFailure([{ status: "partial" }]), true);
});

test("stale public listing evidence fails without treating the dog's listing age as availability age", () => {
  const result = evaluatePublicDogFreshness({
    source: "rescuegroups",
    rescuegroups_id: "dog-1",
    last_checked_at: "2026-11-15T12:00:00.000Z",
  }, { now: Date.parse("2026-11-20T16:00:00.000Z") });
  assert.equal(result.status, "fail");
  assert.match(result.detail, /last_checked_at/);
});

test("missing monitoring credentials makes sync evidence unverified, not a fabricated failure", () => {
  const result = evaluateMonitoringCredentials({ githubToken: "", repository: "" });
  assert.equal(result.status, "unverified");
  assert.equal(result.informational, true);
});

test("denied GitHub sync-run access produces a clear unverified diagnostic", () => {
  const result = evaluateSyncApiFailure(new Error("GitHub workflow API returned HTTP 403"));
  assert.equal(result.status, "unverified");
  assert.equal(result.informational, true);
  assert.match(result.detail, /could not be verified.*HTTP 403/i);
});

test("monitoring request policy blocks GA4 and every production write method", () => {
  assert.equal(classifyMonitoringRequest("https://www.googletagmanager.com/gtag/js?id=G-test", "GET"), "block_analytics");
  assert.equal(classifyMonitoringRequest("https://www.google-analytics.com/g/collect", "POST"), "block_analytics");
  assert.equal(classifyMonitoringRequest("https://project.supabase.co/rest/v1/quiz_responses", "POST"), "block_write");
  assert.equal(classifyMonitoringRequest("https://project.supabase.co/rest/v1/dogs", "PATCH"), "block_write");
  assert.equal(classifyMonitoringRequest("https://project.supabase.co/rest/v1/dogs", "GET"), "allow");
});

test("production monitoring workflow is daily, manual, read-only, and secret-free", () => {
  const workflow = fs.readFileSync(".github/workflows/production-monitoring.yml", "utf8");
  assert.equal((workflow.match(/\bcron:/g) || []).length, 1);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read\s*\n\s*actions: read/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|VERCEL_TOKEN|secrets\./);
});
