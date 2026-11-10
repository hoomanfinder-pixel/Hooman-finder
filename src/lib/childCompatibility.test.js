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
  return { energy_preference: "low", kids_in_home: kids };
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
    note: "Shelter-listed age restriction.",
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

test("specific source-backed age restrictions outrank generic source positives", () => {
  const dog = {
    id: "source-backed-restriction",
    good_with_kids: true,
    qualities: [],
    bio_good_with_kids: "older_children_only",
    ai_traits: {
      good_with_kids: {
        value: "older_children_only",
        confidence: 1,
        evidence_basis: "structured_source",
      },
    },
  };

  assert.deepEqual(resolveChildCompatibility(dog), {
    value: CHILD_COMPATIBILITY.OLDER_CHILDREN_ONLY,
    source: "structured",
    confirmed: true,
    evidence: "bio_good_with_kids",
    evidenceBasis: "structured_source",
  });
  assert.equal(
    getConfirmedIncompatibilities(dog, answers(["under_3"]))[0]?.code,
    "confirmed_child_age_restriction"
  );
});

test("biography-interpreted age restrictions stay cautious and cannot hard-exclude", () => {
  const dog = {
    id: "bio-restriction",
    energy_level: "Low",
    good_with_kids: true,
    qualities: [],
    bio_good_with_kids: "older_children_only",
    ai_traits: {
      good_with_kids: {
        value: "older_children_only",
        confidence: 1,
        evidence_basis: "bio_explicit",
      },
    },
  };

  const resolved = resolveChildCompatibility(dog);
  assert.equal(resolved.value, CHILD_COMPATIBILITY.OLDER_CHILDREN_ONLY);
  assert.equal(resolved.source, "bio");
  assert.equal(resolved.confirmed, false);
  assert.deepEqual(getConfirmedIncompatibilities(dog, answers(["under_3"])), []);

  const [row] = computeRankedMatches([dog], answers(["under_3"]));
  const children = row.breakdown.contributions.find(({ questionId }) => questionId === "kids_in_home");
  assert.equal(children.source, "bio_explicit");
  assert.ok(children.adjustedCompatibility < 0.5);
});

test("generic child-positive facts remain general and do not score specific age bands", () => {
  const positive = {
    id: "positive",
    energy_level: "Low",
    good_with_kids: true,
    qualities: [],
    bio_good_with_kids: "no",
  };

  assert.equal(resolveChildCompatibility(positive).value, CHILD_COMPATIBILITY.YES);
  assert.deepEqual(getChildTraitDisplay(positive), {
    value: "Yes",
    source: "listed",
    estimated: false,
    note: "General shelter fact; child ages are not specified.",
  });

  for (const age of ["under_3", "3_5", "6_9", "10_12", "13_plus"]) {
    const [row] = computeRankedMatches([positive], answers([age]));
    assert.equal(row.dog.id, "positive", age);
    assert.equal(
      row.breakdown.contributions.some(({ questionId }) => questionId === "kids_in_home"),
      false,
      age
    );
    assert.equal(row.breakdown.limitedInformation, true, age);
    assert.equal(
      row.breakdown.matchReasons.some((reason) => /supports a home with children/i.test(reason)),
      false,
      age
    );
  }
});

test("unknown child-age compatibility stays eligible without child evidence coverage", () => {
  const unknown = {
    id: "unknown",
    energy_level: "Low",
    good_with_kids: null,
    qualities: [],
    bio_good_with_kids: "unknown",
  };

  assert.equal(resolveChildCompatibility(unknown).value, CHILD_COMPATIBILITY.UNKNOWN);
  for (const age of ["under_3", "3_5", "6_9", "10_12", "13_plus"]) {
    const [row] = computeRankedMatches([unknown], answers([age]));
    assert.equal(row.dog.id, "unknown", age);
    assert.equal(
      row.breakdown.contributions.some(({ questionId }) => questionId === "kids_in_home"),
      false,
      age
    );
  }
});

test("general child facts can address visiting children without claiming their ages", () => {
  const dog = { id: "visits", energy_level: "Low", good_with_kids: true, qualities: [] };
  const [row] = computeRankedMatches([dog], answers(["children_visit"]));
  const children = row.breakdown.contributions.find(({ questionId }) => questionId === "kids_in_home");

  assert.equal(children.rawCompatibility, 1);
  assert.equal(children.source, "structured");
  assert.match(children.explanation, /general child compatibility/i);
  assert.match(children.explanation, /ages are not specified/i);
});

test("confirmed child negatives exclude every child-present option but not child-free homes", () => {
  const dog = { id: "no-kids", good_with_kids: false };
  for (const age of ["under_3", "3_5", "6_9", "10_12", "13_plus", "children_visit"]) {
    assert.equal(
      getConfirmedIncompatibilities(dog, answers([age]))[0]?.code,
      "confirmed_child_incompatibility",
      age
    );
  }
  assert.deepEqual(getConfirmedIncompatibilities(dog, answers(["no_children"])), []);
});

test("biography and AI child positives stay distinct from age-specific source facts", () => {
  const dog = {
    id: "bio-positive",
    energy_level: "Low",
    good_with_kids: null,
    bio_good_with_kids: "yes",
    ai_traits: {
      good_with_kids: {
        value: "true",
        confidence: 1,
        evidence_basis: "bio_explicit",
      },
    },
  };

  for (const age of ["under_3", "3_5", "6_9", "10_12", "13_plus"]) {
    const [row] = computeRankedMatches([dog], answers([age]));
    assert.equal(
      row.breakdown.contributions.some(({ questionId }) => questionId === "kids_in_home"),
      false,
      age
    );
    assert.deepEqual(getConfirmedIncompatibilities(dog, answers([age])), [], age);
  }
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
