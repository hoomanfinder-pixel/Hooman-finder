import assert from "node:assert/strict";
import test from "node:test";

import {
  evidenceSourceLabel,
  formatFitScore,
  getEvidenceLabels,
  getFitScoreScope,
  getPositiveEvidenceItems,
  getRankingSignalKey,
  getTradeoffEvidenceItems,
  hasRealFitScore,
} from "./matchPresentation.js";
import { getMatchReasons } from "./matchReasons.js";

test("fit-score language does not imply a percentage match", () => {
  assert.equal(formatFitScore(82.4), "Fit score: 82/100");
  assert.equal(formatFitScore(null), "Fit score unavailable");
  assert.equal(hasRealFitScore(82, { enoughQuizInfo: true }), true);
  assert.equal(hasRealFitScore(null, { enoughQuizInfo: false }), false);
});

test("fit-score scope names scored preferences without inventing confidence", () => {
  assert.deepEqual(
    getFitScoreScope({
      activePreferenceCount: 2,
      activePreferenceLabels: ["size", "age"],
      evidenceRequestedWeight: 6,
      evidenceCoveredWeight: 6,
      limitedInformation: false,
    }),
    {
      count: 2,
      labels: ["size", "age"],
      summary: "Based on 2 scored preferences: size and age.",
      evidenceSummary: "Information is available for all scored preferences.",
      prominent: "Based on 2 scored preferences",
      compact: "2 scored preferences · Information available",
      limited: false,
    }
  );

  assert.equal(
    getFitScoreScope({
      activePreferenceCount: 1,
      activePreferenceLabels: ["age"],
      evidenceRequestedWeight: 3,
      evidenceCoveredWeight: 3,
    }).prominent,
    "Based on 1 scored preference"
  );

  assert.equal(
    getFitScoreScope({
      activePreferenceCount: 2,
      activePreferenceLabels: ["size", "age"],
      evidenceRequestedWeight: 6,
      evidenceCoveredWeight: 3,
      limitedInformation: true,
    }).evidenceSummary,
    "Limited listing information for these scored preferences."
  );
});

test("exact ranking ties use score, evidence coverage, and raw compatibility only", () => {
  const alpha = {
    dog: { name: "Alpha" },
    scorePct: 100,
    breakdown: { coverageComponent: 1, rawCompatibility: 1 },
  };
  const zulu = { ...alpha, dog: { name: "Zulu" } };
  const lowerCoverage = {
    ...alpha,
    breakdown: { coverageComponent: 0.8, rawCompatibility: 1 },
  };
  const lowerScore = { ...alpha, scorePct: 99 };

  assert.equal(getRankingSignalKey(alpha), getRankingSignalKey(zulu));
  assert.notEqual(getRankingSignalKey(alpha), getRankingSignalKey(lowerCoverage));
  assert.notEqual(getRankingSignalKey(alpha), getRankingSignalKey(lowerScore));
});

test("evidence labels distinguish listed, biography, estimated, and unknown data", () => {
  assert.deepEqual(
    getEvidenceLabels({
      limitedInformation: true,
      evidenceRequestedWeight: 9,
      evidenceCoveredWeight: 6,
      contributions: [
        { source: "structured" },
        { source: "bio_explicit" },
        { source: "profile_inference" },
      ],
    }),
    [
      "Shelter-listed",
      "From listing bio",
      "Estimated",
      "Some information unknown",
    ]
  );
  assert.equal(evidenceSourceLabel("mixed"), "Mixed evidence sources");
});

test("mixed evidence without a structured fact never implies shelter confirmation", () => {
  assert.deepEqual(
    getEvidenceLabels({
      contributions: [
        { source: "bio_explicit" },
        { source: "profile_inference" },
        { source: "mixed" },
      ],
    }),
    ["From listing bio", "Estimated", "Mixed evidence sources"]
  );
});

test("presentation items retain the scored explanation and its source", () => {
  const breakdown = {
    positiveContributions: [
      { explanation: "Listed age fits your preference", source: "structured" },
    ],
    tradeoffContributions: [
      { explanation: "Estimated energy may not fit", source: "profile_inference" },
    ],
  };

  assert.deepEqual(getPositiveEvidenceItems(breakdown, 1), [
    {
      explanation: "Listed age fits your preference",
      source: "structured",
      sourceLabel: "Shelter-listed",
    },
  ]);
  assert.deepEqual(getTradeoffEvidenceItems(breakdown, 1), [
    {
      explanation: "Estimated energy may not fit",
      source: "profile_inference",
      sourceLabel: "Estimated",
    },
  ]);
});

test("legacy allergy reason avoids implying guaranteed allergy safety", () => {
  assert.deepEqual(
    getMatchReasons(
      { hypoallergenic: true },
      { allergy_sensitivity: "have_allergies" }
    ),
    [
      "Shelter listing identifies this dog as hypoallergenic; individual allergy responses vary and must be confirmed directly",
    ]
  );
});
