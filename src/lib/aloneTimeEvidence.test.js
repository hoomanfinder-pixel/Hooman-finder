import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyAloneTimeObservation,
  extractExplicitAloneHours,
  resolveAloneTimeEvidence,
} from "./aloneTimeEvidence.js";
import { computeRankedMatches } from "./matchingLogic.js";

test("numeric alone-time evidence requires an explicit duration and uses a cautious range bound", () => {
  assert.equal(extractExplicitAloneHours("Foster says she is left alone for 4 to 6 hours."), 4);
  assert.equal(extractExplicitAloneHours("He manages a normal workday alone."), null);
  assert.equal(extractExplicitAloneHours("She cannot be left alone for 8 hours."), null);
  assert.equal(extractExplicitAloneHours("She cannot be left alone for more than 2 hours."), 2);
});

test("other-dog and historical durations do not establish this dog's current capacity", () => {
  assert.equal(extractExplicitAloneHours("Other dogs can stay alone for 8 hours."), null);
  assert.equal(extractExplicitAloneHours("She used to be left alone for 8 hours at her previous home."), null);
  assert.equal(classifyAloneTimeObservation("My previous dog was independent and did well alone."), "unknown");
});

test("conflicting biography durations remain unresolved and require confirmation", () => {
  const dog = {
    description: "Her foster says she can be left alone for 4 hours. A prior note says she can be left alone for 8 hours.",
  };
  const resolved = resolveAloneTimeEvidence(dog);
  assert.equal(resolved.bioHours, null);
  assert.equal(resolved.bioDurationConflict, true);
  assert.equal(resolved.conflict, true);
  const [match] = computeRankedMatches([dog], { alone_time: "8_plus" });
  assert.equal(match.breakdown.contributions.some(({ questionId }) => questionId === "alone_time"), false);
  assert.match(match.breakdown.compatibilityCautions[0], /conflicting alone-time durations/);
});

test("a stated duration is not scored positively when the same bio describes separation distress", () => {
  const dog = {
    description: "Her foster says she can be left alone for 8 hours, but she has separation anxiety and panics when left alone.",
  };
  const resolved = resolveAloneTimeEvidence(dog);
  assert.equal(resolved.bioHours, 8);
  assert.equal(resolved.behaviorConflict, true);
  const [match] = computeRankedMatches([dog], { alone_time: "8_plus" });
  assert.equal(match.breakdown.contributions.some(({ questionId }) => questionId === "alone_time"), false);
  assert.match(match.breakdown.compatibilityCautions[0], /separation concerns/);
});

test("legacy qualitative-to-numeric values remain unverified and do not become match evidence", () => {
  const dog = {
    bio_max_alone_hours: 8,
    bio_max_alone_hours_label: "7-8",
    description: "A calm, crate-trained dog who is independent.",
    ai_traits: {
      max_alone_hours_estimate: {
        value: 8,
        confidence: 0.72,
        evidence_basis: "bio_explicit",
        evidence: "Bio explicitly states comfort alone for a normal workday.",
      },
    },
  };
  const resolved = resolveAloneTimeEvidence(dog);
  assert.equal(resolved.bioHours, null);
  assert.equal(resolved.legacyDurationUnverified, true);

  const [match] = computeRankedMatches([dog], { alone_time: "8_plus" });
  assert.equal(match.breakdown.contributions.some(({ questionId }) => questionId === "alone_time"), false);
  assert.match(match.breakdown.compatibilityCautions[0], /could not be verified/);
});

test("conflicting structured and biography durations are both visible and not positively scored", () => {
  const dog = {
    max_alone_hours: 8,
    bio_max_alone_hours: 6,
    description: "Foster reports she can be left alone for 6 to 8 hours.",
    ai_traits: { max_alone_hours_estimate: { value: 6, confidence: 0.88, evidence_basis: "bio_explicit" } },
  };
  const resolved = resolveAloneTimeEvidence(dog);
  assert.equal(resolved.structuredHours, 8);
  assert.equal(resolved.bioHours, 6);
  assert.equal(resolved.conflict, true);

  const [match] = computeRankedMatches([dog], { alone_time: "8_plus" });
  const alone = match.breakdown.contributions.find(({ questionId }) => questionId === "alone_time");
  assert.equal(alone, undefined);
  assert.match(match.breakdown.compatibilityCautions[0], /durations differ/);
});

test("explicit bio duration is estimated evidence and receives a confirmation caution", () => {
  const dog = {
    bio_max_alone_hours: 6,
    description: "Her foster says she can be left alone for 6 hours.",
    ai_traits: { max_alone_hours_estimate: { value: 6, confidence: 0.82, evidence_basis: "bio_explicit" } },
  };
  const resolved = resolveAloneTimeEvidence(dog);
  assert.equal(resolved.bioHours, 6);

  const [match] = computeRankedMatches([dog], { alone_time: "4_6" });
  const alone = match.breakdown.contributions.find(({ questionId }) => questionId === "alone_time");
  assert.equal(alone.source, "bio_explicit");
  assert.match(alone.explanation, /Biography-stated.*confirm the hours/);
  assert.match(match.breakdown.compatibilityCautions[0], /confirm that the dog can manage/);
});

test("purely unknown alone-time status stays unknown without adding an alarm-style caution", () => {
  const [match] = computeRankedMatches([{ description: "Friendly, calm dog." }], { alone_time: "8_plus" });
  assert.equal(match.breakdown.contributions.some(({ questionId }) => questionId === "alone_time"), false);
  assert.equal(match.breakdown.compatibilityCautions.length, 0);
});

test("alone-time observations distinguish independence, a claim, observation, concerns, distress, and unknown", () => {
  assert.equal(classifyAloneTimeObservation("An independent dog who settles on her own."), "general_independence");
  assert.equal(classifyAloneTimeObservation("The bio says she does well alone."), "alone_comfort_claim");
  assert.equal(classifyAloneTimeObservation("Foster reports she was left alone and settled calmly."), "observed_comfort");
  assert.equal(classifyAloneTimeObservation("He prefers someone home and is learning to be alone."), "separation_concern");
  assert.equal(classifyAloneTimeObservation("She panics and is destructive when left alone."), "significant_distress");
  assert.equal(classifyAloneTimeObservation("A friendly, calm dog."), "unknown");
});
