import test from "node:test";
import assert from "node:assert/strict";

import { computeRankedMatches } from "./matchingLogic.js";
import {
  ALL_QUESTIONS,
  canonicalizeAllergySensitivity,
} from "./quizQuestions.js";
import { normalizeExternalUrl } from "./urlSafety.js";

test("external URLs require a real hostname", () => {
  assert.equal(normalizeExternalUrl("http://"), "");
  assert.equal(normalizeExternalUrl("https://"), "");
  assert.equal(
    normalizeExternalUrl("http://projecthoperescue.org"),
    "https://projecthoperescue.org"
  );
});

test("allergy quiz options use the database constraint values", () => {
  const question = ALL_QUESTIONS.find(({ id }) => id === "allergy_sensitivity");
  assert.deepEqual(
    question.options.map(({ value }) => value),
    ["have_allergies", "mild_allergies", "no_allergies"]
  );
  assert.equal(canonicalizeAllergySensitivity("needs_low_shedding"), "have_allergies");
  assert.equal(canonicalizeAllergySensitivity("mild"), "mild_allergies");
  assert.equal(canonicalizeAllergySensitivity("none"), "no_allergies");
});

test("confirmed child incompatibility caps Toto's match and adds a caution", () => {
  const toto = {
    name: "Toto",
    size: "Small",
    age_years: 2.67,
    age_text: "2 Years 8 Months",
    good_with_kids: false,
    good_with_dogs: true,
    potty_trained: true,
  };
  const answers = {
    size_preference: ["small"],
    age_preference: ["adult"],
    kids_in_home: ["under_3"],
    pets_in_home: ["dogs"],
    potty_requirement: "must_be_trained",
  };

  const [result] = computeRankedMatches([toto], answers);
  assert.equal(result.scorePct, 49);
  assert.deepEqual(result.breakdown.compatibilityCautions, [
    "This dog is listed as not compatible with children, but your household includes children.",
  ]);
});

test("confirmed dog and cat negatives are symmetric while unknown stays neutral", () => {
  const answers = {
    size_preference: ["flexible"],
    pets_in_home: ["dogs", "cats"],
  };
  const [negative] = computeRankedMatches(
    [{ name: "Confirmed no", good_with_dogs: false, good_with_cats: false }],
    answers
  );
  const [unknown] = computeRankedMatches([{ name: "Unknown" }], answers);

  assert.equal(negative.scorePct, 49);
  assert.equal(negative.breakdown.compatibilityCautions.length, 2);
  assert.equal(unknown.scorePct, 75);
  assert.deepEqual(unknown.breakdown.compatibilityCautions, []);
});
