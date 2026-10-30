import assert from "node:assert/strict";
import test from "node:test";

import {
  CHILD_COMPATIBILITY,
  getChildFitChip,
  getChildTraitDisplay,
  resolveChildCompatibility,
} from "./childCompatibility.js";
import { filterDogItems } from "./dogListFilters.js";
import { computeRankedMatches, getConfirmedIncompatibilities } from "./matchingLogic.js";

const ADELINE = {
  id: "8307fe4b-16df-431f-996b-15ff0fae6f94",
  rescuegroups_id: "19743030",
  rescuegroups_org_id: "5510",
  name: "ADELINE",
  qualities: ["needsCompanionAnimal", "olderKidsOnly", "playful", "timid"],
  good_with_kids: true,
  bio_good_with_kids: "yes",
  ai_traits: {
    good_with_kids: {
      value: "true",
      confidence: 0.95,
      evidence_basis: "structured_source",
    },
  },
};

function answers(kids) {
  return { size_preference: ["flexible"], kids_in_home: kids };
}

test("ADELINE's source age restriction overrides broad source and AI positives", () => {
  assert.deepEqual(resolveChildCompatibility(ADELINE), {
    value: CHILD_COMPATIBILITY.OLDER_CHILDREN_ONLY,
    source: "structured",
    confirmed: true,
    evidence: "qualities.olderKidsOnly",
  });
  assert.deepEqual(getChildTraitDisplay(ADELINE), {
    value: "Older children only",
    source: "listed",
    estimated: false,
  });
  assert.deepEqual(getChildFitChip(ADELINE), {
    label: "Older children only",
    confirmed: true,
  });
});

test("source-confirmed older-child restrictions exclude conservatively younger age bands", () => {
  for (const age of ["under_3", "3_5", "6_9"]) {
    const incompatibilities = getConfirmedIncompatibilities(ADELINE, answers([age]));
    assert.equal(incompatibilities[0]?.code, "confirmed_child_age_restriction", age);
    assert.deepEqual(computeRankedMatches([ADELINE], answers([age])), [], age);
  }

  assert.deepEqual(
    computeRankedMatches([ADELINE], answers(["13_plus", "3_5"])),
    [],
    "one younger child keeps a mixed-age household excluded"
  );
});

test("10-12 stays ambiguous while 13+ is a strong, non-perfect older-child fit", () => {
  const [ambiguous] = computeRankedMatches([ADELINE], answers(["10_12"]));
  const ambiguousKids = ambiguous.breakdown.contributions.find(({ questionId }) => questionId === "kids_in_home");
  assert.equal(ambiguousKids.rawCompatibility, 0.65);
  assert.equal(ambiguousKids.source, "structured");
  assert.match(ambiguousKids.explanation, /limits compatibility to older children/i);

  const [older] = computeRankedMatches([ADELINE], answers(["13_plus"]));
  const olderKids = older.breakdown.contributions.find(({ questionId }) => questionId === "kids_in_home");
  assert.equal(olderKids.rawCompatibility, 0.9);
  assert.ok(older.scorePct < 100);
});

test("all-child incompatibility remains stricter than an older-child quality", () => {
  const dog = { ...ADELINE, good_with_kids: false, bio_good_with_kids: "yes" };
  assert.equal(resolveChildCompatibility(dog).value, CHILD_COMPATIBILITY.NO);
  assert.equal(getConfirmedIncompatibilities(dog, answers(["13_plus"]))[0]?.code, "confirmed_child_incompatibility");
  assert.deepEqual(computeRankedMatches([dog], answers(["13_plus"])), []);
});

test("unrestricted positive and unknown child compatibility remain distinct", () => {
  const positive = { id: "positive", good_with_kids: true, qualities: [], bio_good_with_kids: "no" };
  const unknown = { id: "unknown", good_with_kids: null, qualities: [], bio_good_with_kids: "unknown" };

  assert.equal(resolveChildCompatibility(positive).value, CHILD_COMPATIBILITY.YES);
  assert.equal(computeRankedMatches([positive], answers(["under_3"]))[0].scorePct, 100);
  assert.equal(resolveChildCompatibility(unknown).value, CHILD_COMPATIBILITY.UNKNOWN);
  assert.equal(computeRankedMatches([unknown], answers(["under_3"]))[0].scorePct, null);
});

test("kids filter includes only unrestricted source-confirmed positives", () => {
  const unrestricted = { id: "yes", good_with_kids: true, qualities: [] };
  const unknown = { id: "unknown", good_with_kids: null, qualities: [] };
  const bioPositive = { id: "estimated", good_with_kids: null, bio_good_with_kids: "yes" };
  assert.deepEqual(
    filterDogItems([ADELINE, unrestricted, unknown, bioPositive], { kidsOnly: true }).map(({ id }) => id),
    ["yes"]
  );
});
