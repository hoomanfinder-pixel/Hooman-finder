import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  AI_ENRICHMENT_VERSION,
  buildRunFinalizationPayload,
  conciseErrorReason,
  determineRunStatus,
  formatRunErrorSummary,
  processDogBatch,
  resolveEnrichmentCandidates,
  validateDogId,
  validateRunMode,
} = require("../../scripts/enrich-dogs-ai.cjs");

const noTokens = { input: 0, output: 0, total: 0 };
const finishedAt = "2026-10-07T12:00:00.000Z";

function stats(overrides = {}) {
  return {
    attempted: 1,
    updated: 1,
    skippedNoChange: 0,
    skippedNoData: 0,
    failed: 0,
    ...overrides,
  };
}

test("successful runs finalize without a misleading error summary", () => {
  const runStats = stats();
  const payload = buildRunFinalizationPayload(runStats, {
    status: determineRunStatus(runStats),
    tokenUsage: noTokens,
    finishedAt,
  });

  assert.equal(payload.status, "success");
  assert.equal(payload.error_summary, null);
  assert.equal(payload.failed_count, 0);
});

test("dog-id targeting requires a UUID, normal eligibility, and no force override", () => {
  const id = "11cdb97b-f935-430d-ba22-7cc70614ea1a";
  assert.equal(validateDogId(id), id);
  assert.throws(() => validateDogId("Biscuit"), /valid UUID/);
  assert.throws(
    () => validateRunMode({ drain: false, force: true, dryRun: false, dogId: id }),
    /cannot be combined with --force/
  );

  const targeted = resolveEnrichmentCandidates([{
    id,
    name: "Biscuit",
    ai_enriched_at: null,
  }], { limit: 1, force: false, dogId: id });
  assert.deepEqual(targeted.dogs.map((dog) => dog.id), [id]);
  assert.equal(targeted.eligibleCount, 1);
  assert.equal(targeted.reasonCounts.new, 1);

  assert.throws(
    () => resolveEnrichmentCandidates([], { limit: 1, force: false, dogId: id }),
    /not found or is not publicly visible/
  );
  assert.throws(
    () => resolveEnrichmentCandidates([{
      id,
      name: "Biscuit",
      ai_enriched_at: "2026-10-07T12:00:00.000Z",
      ai_enrichment_version: AI_ENRICHMENT_VERSION,
      source_content_hash: "same-hash",
      ai_enriched_source_hash: "same-hash",
    }], { limit: 1, force: false, dogId: id }),
    /not eligible/
  );
});

test("one timeout failure is recognizable and makes a fully failed run useful", () => {
  const runStats = stats({ updated: 0, failed: 1 });
  const failures = [{
    dogId: "dog-1",
    dogName: "Biscuit",
    attempt: 1,
    reason: conciseErrorReason(Object.assign(new Error("This operation was aborted"), { name: "AbortError" })),
  }];
  const payload = buildRunFinalizationPayload(runStats, {
    status: determineRunStatus(runStats),
    failures,
    tokenUsage: noTokens,
    finishedAt,
  });

  assert.equal(payload.status, "failed");
  assert.equal(payload.failed_count, 1);
  assert.match(payload.error_summary, /Biscuit \(dog-1\), attempt 1/i);
  assert.match(payload.error_summary, /timed out after 60 seconds/i);
});

test("a fatal run with no completed batch is failed and retains its concise cause", () => {
  const error = new Error("Eligibility fetch failed");
  const status = determineRunStatus(null, { error });
  const payload = buildRunFinalizationPayload(null, {
    status,
    error,
    tokenUsage: noTokens,
    finishedAt,
  });

  assert.equal(payload.status, "failed");
  assert.equal(payload.failed_count, 1);
  assert.match(payload.error_summary, /Eligibility fetch failed/);
});

test("mixed success and failure finalizes partial with the dog-level reason", () => {
  const runStats = stats({ attempted: 2, updated: 1, failed: 1 });
  const payload = buildRunFinalizationPayload(runStats, {
    status: determineRunStatus(runStats),
    failures: [{ dogId: "dog-2", dogName: "Maggie", attempt: 1, reason: "OpenAI 503: unavailable" }],
    tokenUsage: noTokens,
    finishedAt,
  });

  assert.equal(payload.status, "partial");
  assert.match(payload.error_summary, /Maggie \(dog-2\)/);
  assert.match(payload.error_summary, /OpenAI 503: unavailable/);
});

test("multiple failures produce a bounded compact summary", () => {
  const failures = Array.from({ length: 40 }, (_, index) => ({
    dogId: `dog-${index}`,
    dogName: `Dog ${index}`,
    attempt: 3,
    reason: `Failure ${index} ${"x".repeat(200)}`,
  }));
  const summary = formatRunErrorSummary(failures);

  assert.ok(summary.length <= 2000);
  assert.match(summary, /Dog 0 \(dog-0\), attempt 3/);
  assert.match(summary, /\(\+\d+ more\)$/);
  assert.doesNotMatch(summary, /Error:|\n\s+at /);
});

test("drain retry accounting is shared, bounded, and does not stop other dogs", async () => {
  const failureAttempts = new Map();
  const biscuit = { id: "biscuit", name: "Biscuit" };
  const mason = { id: "mason", name: "Mason" };
  const timeout = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
  const enrichDog = async (dog) => {
    if (dog.id === biscuit.id) throw timeout;
    return {
      aiTraits: { overall_confidence: 0.8, needs_human_review: false, match_tags: [] },
      bioColumns: {
        bio_good_with_kids: "yes",
        bio_good_with_dogs: "yes",
        bio_good_with_cats: "unknown",
        bio_first_time_friendly: "unknown",
        bio_potty_trained: "unknown",
        bio_energy_level: "medium",
        bio_shedding_level: "unknown",
        bio_barking_level: "unknown",
        bio_grooming_level: "unknown",
        bio_max_alone_hours: null,
        bio_exercise_needs: "medium",
        bio_training_needs: "medium",
        bio_size: null,
      },
      carriedForwardFields: [],
      elapsed: "0.1",
    };
  };

  const first = await processDogBatch([biscuit, mason], {
    failureAttempts,
    maxAttempts: 3,
    enrichDog,
  });
  assert.deepEqual(first.stats, {
    attempted: 2,
    updated: 1,
    skippedNoChange: 0,
    skippedNoData: 0,
    failed: 1,
  });
  assert.equal(failureAttempts.get("biscuit"), 1);
  assert.deepEqual(first.exhaustedFailures, []);

  const second = await processDogBatch([biscuit], { failureAttempts, maxAttempts: 3, enrichDog });
  assert.equal(failureAttempts.get("biscuit"), 2);
  assert.deepEqual(second.exhaustedFailures, []);

  const third = await processDogBatch([biscuit], { failureAttempts, maxAttempts: 3, enrichDog });
  assert.equal(failureAttempts.get("biscuit"), 3);
  assert.deepEqual(third.exhaustedFailures, ["Biscuit (biscuit)"]);
  assert.match(third.failures[0].reason, /timed out after 60 seconds/i);
});
