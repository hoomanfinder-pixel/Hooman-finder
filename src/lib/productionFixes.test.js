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

test("confirmed dog and cat negatives are symmetric while unknown is excluded from scoring", () => {
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
  assert.equal(unknown.scorePct, 100);
  assert.equal(unknown.breakdown.possible, 3);
  assert.deepEqual(unknown.breakdown.compatibilityCautions, []);
});

test("sparse evidence is labeled without adding unknown traits to the denominator", () => {
  const answers = {
    size_preference: ["flexible"],
    age_preference: ["flexible"],
    kids_in_home: ["under_3"],
    pets_in_home: ["dogs", "cats"],
    potty_requirement: "must_be_trained",
    alone_time: "8_plus",
  };
  const [sparse] = computeRankedMatches([{ name: "Sparse" }], answers);

  assert.equal(sparse.scorePct, 100);
  assert.equal(sparse.breakdown.possible, 6);
  assert.equal(sparse.breakdown.evidenceCoveragePct, 35);
  assert.equal(sparse.breakdown.limitedInformation, true);
  assert.equal(sparse.breakdown.tierLabel, "Limited information");
});

test("data-rich and sparse 90 percent scores remain numerically equal but presentation-distinct", () => {
  const answers = {
    size_preference: ["small"],
    age_preference: ["adult"],
    kids_in_home: ["under_3"],
    pets_in_home: ["dogs"],
    potty_requirement: "must_be_trained",
    alone_time: "8_plus",
    yard: "yes",
  };
  const dogs = [
    {
      name: "Sparse",
      size: "Small",
      age_years: 4,
      bio_potty_trained: "most_likely",
      ai_traits: { potty_trained: aiTrait("most_likely", 5 / 9, "bio_explicit") },
      max_alone_hours: 8,
    },
    {
      name: "Data rich",
      size: "Small",
      age_years: 4,
      good_with_kids: true,
      good_with_dogs: true,
      bio_potty_trained: "most_likely",
      ai_traits: { potty_trained: aiTrait("most_likely", 5 / 6, "bio_explicit") },
      max_alone_hours: 6,
      yard_required: true,
      fence_needs: "Not Required",
    },
  ];
  const byName = new Map(computeRankedMatches(dogs, answers).map((row) => [row.dog.name, row]));

  assert.equal(byName.get("Sparse").scorePct, 90);
  assert.equal(byName.get("Data rich").scorePct, 90);
  assert.equal(byName.get("Sparse").breakdown.evidenceCoveragePct, 55);
  assert.equal(byName.get("Data rich").breakdown.evidenceCoveragePct, 100);
  assert.equal(byName.get("Sparse").breakdown.limitedInformation, true);
  assert.equal(byName.get("Data rich").breakdown.limitedInformation, false);
  assert.equal(byName.get("Data rich").breakdown.tierLabel, "Strong match");
});

function aiTrait(value, confidence, evidenceBasis) {
  return { value, confidence, evidence_basis: evidenceBasis, evidence: "Test evidence" };
}

test("the same energy mismatch is strongest for Tier A, then Tier B, then Tier C", () => {
  const answers = {
    size_preference: ["flexible"],
    energy_preference: "low",
  };
  const dogs = [
    { name: "Tier A", energy_level: "High" },
    {
      name: "Tier B",
      bio_energy_level: "high",
      ai_traits: { energy_level: aiTrait("high", 1, "bio_explicit") },
    },
    {
      name: "Tier C",
      bio_energy_level: "high",
      ai_traits: { energy_level: aiTrait("high", 1, "profile_inference") },
    },
  ];

  const byName = new Map(computeRankedMatches(dogs, answers).map((row) => [row.dog.name, row]));
  assert.ok(byName.get("Tier A").scorePct < byName.get("Tier B").scorePct);
  assert.ok(byName.get("Tier B").scorePct < byName.get("Tier C").scorePct);
  assert.ok(byName.get("Tier C").score > 3, "Tier C mismatch must retain non-zero trait credit");
});

test("positive AI estimates remain discounted compared with confirmed facts", () => {
  const answers = {
    size_preference: ["flexible"],
    energy_preference: "low",
  };
  const [confirmed] = computeRankedMatches([{ name: "Confirmed", energy_level: "Low" }], answers);
  const [bio] = computeRankedMatches(
    [{
      name: "Bio",
      bio_energy_level: "low",
      ai_traits: { energy_level: aiTrait("low", 1, "bio_explicit") },
    }],
    answers
  );
  const [profile] = computeRankedMatches(
    [{
      name: "Profile",
      bio_energy_level: "low",
      ai_traits: { energy_level: aiTrait("low", 1, "profile_inference") },
    }],
    answers
  );

  assert.equal(confirmed.scorePct, 100);
  assert.ok(confirmed.scorePct > bio.scorePct);
  assert.ok(bio.scorePct > profile.scorePct);
});

test("unknown traits do not reduce earned points or the denominator", () => {
  const [result] = computeRankedMatches(
    [{ name: "Unknown energy" }],
    { size_preference: ["flexible"], energy_preference: "high" }
  );

  assert.equal(result.scorePct, 100);
  assert.equal(result.score, 3);
  assert.equal(result.breakdown.possible, 3);
});

test("legacy AI traits without evidence_basis default to Tier C", () => {
  const answers = { size_preference: ["flexible"], energy_preference: "low" };
  const [legacy] = computeRankedMatches(
    [{
      name: "Legacy",
      bio_energy_level: "high",
      ai_traits: { energy_level: { value: "high", confidence: 1 } },
    }],
    answers
  );
  const [tierC] = computeRankedMatches(
    [{
      name: "Tier C",
      bio_energy_level: "high",
      ai_traits: { energy_level: aiTrait("high", 1, "profile_inference") },
    }],
    answers
  );

  assert.equal(legacy.scorePct, tierC.scorePct);
  assert.equal(legacy.score, tierC.score);
});

test("Tier B and Tier C behavioral negatives cannot warn or trigger the confirmed cap", () => {
  const answers = { size_preference: ["flexible"], kids_in_home: ["under_3"] };
  const dogs = [
    {
      name: "Bio negative",
      bio_good_with_kids: "no",
      ai_traits: { good_with_kids: aiTrait("false", 1, "bio_explicit") },
    },
    {
      name: "Profile negative",
      breed: "Example breed",
      age_years: 1,
      bio_good_with_kids: "no",
      ai_traits: { good_with_kids: aiTrait("false", 1, "profile_inference") },
    },
  ];

  const results = computeRankedMatches(dogs, answers);
  assert.equal(results.length, 2);
  for (const result of results) {
    assert.ok(result.scorePct > 49);
    assert.deepEqual(result.breakdown.compatibilityCautions, []);
  }
});

test("confirmed child dog and cat incompatibilities retain warnings and the 49 percent cap", () => {
  const answers = {
    size_preference: ["flexible"],
    kids_in_home: ["under_3"],
    pets_in_home: ["dogs", "cats"],
  };
  const [result] = computeRankedMatches(
    [{ name: "Confirmed conflicts", good_with_kids: false, good_with_dogs: false, good_with_cats: false }],
    answers
  );

  assert.ok(result.scorePct <= 49);
  assert.equal(result.breakdown.compatibilityCautions.length, 3);
});

test("all Phase 1 AI fallback mismatches retain partial rather than zero credit", () => {
  const scenarios = [
    {
      dog: { bio_size: "Large", ai_traits: { size: aiTrait("Large", 1, "profile_inference") } },
      answers: { age_preference: ["flexible"], size_preference: ["small"] },
      baseline: 3,
    },
    {
      dog: { bio_shedding_level: "high", ai_traits: { shedding_level: aiTrait("high", 1, "profile_inference") } },
      answers: { size_preference: ["flexible"], shedding_preference: "minimal" },
      baseline: 3,
    },
    {
      dog: { bio_max_alone_hours: 2, ai_traits: { max_alone_hours_estimate: aiTrait(2, 1, "profile_inference") } },
      answers: { size_preference: ["flexible"], alone_time: "8_plus" },
      baseline: 3,
    },
    {
      dog: { bio_first_time_friendly: "no", ai_traits: { first_time_friendly: aiTrait("false", 1, "profile_inference") } },
      answers: { size_preference: ["flexible"], first_time_owner: "yes" },
      baseline: 3,
    },
  ];

  for (const [index, scenario] of scenarios.entries()) {
    const [result] = computeRankedMatches([{ name: `Scenario ${index}`, ...scenario.dog }], scenario.answers);
    assert.ok(result.score > scenario.baseline, `scenario ${index} should retain partial estimated credit`);
  }
});

test("confirmed yard requirement can cap, while AI yard evidence only nudges", () => {
  const answers = { size_preference: ["flexible"], yard: "no" };
  const dogs = [
    { name: "Confirmed yard", yard_required: true, fence_needs: "Not Required" },
    { name: "Confirmed fence", yard_required: true, fence_needs: "3 foot" },
    {
      name: "Bio yard",
      ai_traits: { needs_yard: aiTrait("true", 1, "bio_explicit") },
    },
    {
      name: "Profile yard",
      ai_traits: { needs_yard: aiTrait("likely", 1, "profile_inference") },
    },
    { name: "Unknown yard" },
  ];
  const byName = new Map(computeRankedMatches(dogs, answers).map((row) => [row.dog.name, row]));

  assert.equal(byName.get("Confirmed yard").scorePct, 49);
  assert.deepEqual(byName.get("Confirmed yard").breakdown.compatibilityCautions, [
    "This dog is listed as requiring a yard or outdoor space, but your quiz says you do not have yard access.",
  ]);
  assert.ok(!byName.get("Confirmed yard").breakdown.compatibilityCautions[0].includes("fenced yard"));
  assert.equal(byName.get("Confirmed fence").scorePct, 49);
  assert.deepEqual(byName.get("Confirmed fence").breakdown.compatibilityCautions, [
    "This dog is listed as requiring a fenced yard, but your quiz says you do not have yard access.",
  ]);
  assert.ok(byName.get("Bio yard").scorePct > 49);
  assert.ok(byName.get("Bio yard").scorePct < byName.get("Profile yard").scorePct);
  assert.deepEqual(byName.get("Bio yard").breakdown.compatibilityCautions, []);
  assert.deepEqual(byName.get("Profile yard").breakdown.compatibilityCautions, []);
  assert.equal(byName.get("Unknown yard").scorePct, 100);
  assert.equal(byName.get("Unknown yard").breakdown.possible, 3);
});

test("structured source matches remain full credit and ranking ties are deterministic", () => {
  const answers = { size_preference: ["small"], energy_preference: "low" };
  const results = computeRankedMatches(
    [
      { name: "Zulu", size: "Small", energy_level: "Low" },
      { name: "Alpha", size: "Small", energy_level: "Low" },
    ],
    answers
  );

  assert.deepEqual(results.map((result) => result.dog.name), ["Alpha", "Zulu"]);
  assert.deepEqual(results.map((result) => result.scorePct), [100, 100]);
});
