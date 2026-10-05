import assert from "node:assert/strict";
import test from "node:test";

import {
  displayBioTrait,
  getTraitDisplay,
  hasUsefulBioValue,
  normalizeBioValue,
} from "./traitDisplay.js";

const NUANCED_VALUES = [
  ["yes", "Yes"],
  ["most_likely", "Most likely"],
  ["may_do_well", "May do well"],
  ["selective", "Selective with dogs"],
  ["only_dog", "Needs to be the only dog"],
  ["older_children_only", "Older children only"],
  ["no", "No"],
];

test("all nuanced compatibility values remain useful and human-readable", () => {
  for (const [value, label] of NUANCED_VALUES) {
    assert.equal(normalizeBioValue(value), value);
    assert.equal(hasUsefulBioValue(value), true);
    assert.equal(displayBioTrait(value), label);
  }
  assert.equal(normalizeBioValue("unknown"), "unknown");
  assert.equal(hasUsefulBioValue("unknown"), false);
  assert.equal(displayBioTrait("unknown"), "Unknown");
});

test("nuanced biography compatibility stays estimated while structured facts win", () => {
  const estimated = getTraitDisplay({
    structuredValue: null,
    bioValue: "only_dog",
    evidenceBasis: "bio_explicit",
  });
  assert.deepEqual(
    { value: estimated.value, source: estimated.source, estimated: estimated.estimated },
    { value: "Needs to be the only dog", source: "bio", estimated: true }
  );

  assert.deepEqual(
    getTraitDisplay({ structuredValue: true, bioValue: "only_dog", evidenceBasis: "bio_explicit" }),
    { value: "Yes", source: "listed", estimated: false }
  );
  assert.deepEqual(
    getTraitDisplay({ structuredValue: false, bioValue: "most_likely", evidenceBasis: "bio_explicit" }),
    { value: "No", source: "listed", estimated: false }
  );
});
