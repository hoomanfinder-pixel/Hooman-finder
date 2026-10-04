import test from "node:test";
import assert from "node:assert/strict";

import {
  BIOGRAPHY_EVIDENCE_PROVENANCE,
  applyBiographyEvidenceForSimulation,
  extractBiographyEvidence,
} from "./biographyEvidence.js";
import { bioCompatibilityRaw, computeRankedMatches, getConfirmedIncompatibilities } from "./matchingLogic.js";

function field(description, key, extra = {}) {
  return extractBiographyEvidence({ description, ...extra }).fields[key];
}

test("extracts explicit potty evidence without treating crate training as potty training", () => {
  assert.equal(field("She is fully house trained.", "potty_training").value, "yes");
  assert.equal(field("He is working on house training.", "potty_training").value, "may_do_well");
  assert.equal(field("Crate trained and sleeps all night.", "potty_training").status, "ambiguous");
  assert.equal(field("She may have accidents while adjusting.", "potty_training").status, "ambiguous");
});

test("normalizes explicit training and noise evidence", () => {
  assert.equal(field("Knows basic commands and is quiet in the home.", "training_needs").value, "medium_low");
  assert.equal(field("Knows basic commands and is quiet in the home.", "barking_noise").value, "quiet");
  assert.equal(field("He needs continued training and is very vocal.", "training_needs").value, "medium_high");
  assert.equal(field("He needs continued training and is very vocal.", "barking_noise").value, "some");
});

test("distinguishes dog compatibility from dog social style", () => {
  assert.equal(field("She is good with dogs.", "dogs").value, "yes");
  assert.equal(field("She is good with dogs.", "dog_social_style").status, "ambiguous");
  assert.equal(field("She loves other dogs and is a social butterfly.", "dog_social_style").value, "highly_social");
  assert.equal(field("He is dog selective and needs slow introductions.", "dog_social_style").value, "selective");
  assert.equal(field("He would prefer to be the only dog.", "dog_social_style").value, "only_dog");
});

test("keeps untested compatibility unknown and conditional language conditional", () => {
  assert.equal(field("She has not been tested with cats.", "cats").status, "ambiguous");
  assert.equal(field("She has not been tested with cats.", "cats").value, null);
  assert.equal(field("She may do well with dog-savvy cats.", "cats").value, "may_do_well");
  assert.equal(field("No cats and no small animals.", "cats").value, "no");
  assert.equal(field("No cats and no small animals.", "small_animals").value, "no");
  assert.equal(field("She is not good with cats.", "cats").value, "no");
  assert.equal(field("He is not good with children.", "children").value, "no");
  assert.equal(field("He is not house trained.", "potty_training").value, "no");
});

test("does not turn older-children-only evidence into universal child compatibility", () => {
  for (const description of [
    "A calm home with older children only.",
    "A calm home with older children or no children.",
    "A calm home with older, mature children or no children at all.",
    "She needs a home with no young children.",
    "Teenagers only, please.",
  ]) {
    const extraction = extractBiographyEvidence({ description });
    assert.equal(extraction.fields.children.status, "accepted", description);
    assert.equal(extraction.fields.children.value, "older_children_only", description);
    assert.equal(extraction.fields.children.blockedReason, null, description);
    const applied = applyBiographyEvidenceForSimulation({ description }, extraction);
    assert.equal(applied.applied.includes("children"), true, description);
    assert.equal(applied.dog.bio_good_with_kids, "older_children_only", description);
  }
});

test("preserves nuanced conditional compatibility across dogs cats and children", () => {
  const cases = [
    ["dogs", "She is dog selective.", "selective"],
    ["dogs", "Slow introductions are required with other dogs.", "selective"],
    ["dogs", "She could live with a compatible low-energy dog.", "selective"],
    ["dogs", "Best as the only dog, but she has lived with dogs before.", "only_dog"],
    ["dogs", "He may do well with another dog.", "may_do_well"],
    ["cats", "Unknown with cats, but she may do well after slow introductions.", "may_do_well"],
    ["cats", "She may live with dog-savvy cats after proper introductions.", "may_do_well"],
    ["cats", "She has not been tested with cats.", null],
    ["children", "Older children only.", "older_children_only"],
    ["children", "Older children or no children.", "older_children_only"],
    ["children", "She may do well with respectful children.", "may_do_well"],
    ["children", "She is untested with children.", null],
  ];

  for (const [dimension, description, expected] of cases) {
    const decision = field(description, dimension);
    assert.equal(decision.value, expected, description);
    assert.notEqual(decision.value, expected === null ? "yes" : "no", description);
  }
});

test("Abby's dog-selective wording remains selective soft evidence", () => {
  const description = "While she is dog selective and takes time to warm up to new canine friends (she prefers low-energy dogs), she can do well in a home with a patient introduction process—or as the only dog.";
  const extraction = extractBiographyEvidence({ description });
  assert.equal(extraction.fields.dogs.value, "selective");
  const { dog } = applyBiographyEvidenceForSimulation({ description }, extraction);
  assert.equal(dog.bio_good_with_dogs, "selective");
  assert.equal(dog.ai_traits.good_with_dogs.value, "selective");
  assert.deepEqual(getConfirmedIncompatibilities(dog, { pets_in_home: ["dogs"] }), []);
});

test("only-dog recommendations with explicit compatible alternatives remain selective", () => {
  const cases = [
    ["He would be best as the only dog, at least until training is complete.", "only_dog"],
    ["She should be the only dog in the house.", "only_dog"],
    ["He loves to play with other dogs, but prefers to be the only dog to live with you.", "only_dog"],
    ["He can be the only dog, or share with another small mature respectful dog.", "selective"],
    ["She would ideally prefer to be an only dog, but could share with the right canine companion.", "selective"],
    ["She would do best as the only pet, though with slow introductions she can live with another dog.", "selective"],
  ];
  for (const [description, expected] of cases) {
    assert.equal(field(description, "dogs").value, expected, description);
  }
});

test("contradictory cat behavior and cat-housing exclusion stays ambiguous", () => {
  const decision = field("Cats: Good with cats, but he is allergic to them. Cats are a hard pass.", "cats");
  assert.equal(decision.status, "ambiguous");
  assert.equal(decision.value, null);
});

test("matching assigns proportional soft compatibility without changing hard filters", () => {
  assert.equal(bioCompatibilityRaw("yes"), 1);
  assert.equal(bioCompatibilityRaw("may_do_well"), 0.65);
  assert.equal(bioCompatibilityRaw("selective"), 0.4);
  assert.equal(bioCompatibilityRaw("only_dog"), 0.15);
  assert.equal(bioCompatibilityRaw("no"), 0);
  assert.equal(bioCompatibilityRaw("unknown"), null);
  assert.equal(bioCompatibilityRaw("older_children_only", { field: "good_with_kids", answer: ["under_3"] }), 0.15);
  assert.equal(bioCompatibilityRaw("older_children_only", { field: "good_with_kids", answer: ["13_plus"] }), 0.9);

  for (const value of ["may_do_well", "selective", "only_dog"]) {
    assert.deepEqual(
      getConfirmedIncompatibilities({ bio_good_with_dogs: value }, { pets_in_home: ["dogs"] }),
      [],
      value
    );
  }
  assert.equal(
    getConfirmedIncompatibilities({ good_with_dogs: false, bio_good_with_dogs: "yes" }, { pets_in_home: ["dogs"] })[0].code,
    "confirmed_dog_incompatibility"
  );
});

test("distinguishes universal, positive, and unknown child statements", () => {
  assert.equal(field("This dog needs a home with no children.", "children").value, "no");
  assert.equal(field("This dog is good with children.", "children").value, "yes");
  const untested = field("This dog is untested with children.", "children");
  assert.equal(untested.status, "ambiguous");
  assert.equal(untested.value, null);
});

test("structured evidence outranks contradictory biography evidence", () => {
  const dog = { good_with_cats: false, description: "She is good with cats." };
  const extraction = extractBiographyEvidence(dog);
  assert.equal(extraction.fields.cats.structuredConflict, true);
  assert.equal(extraction.fields.cats.blockedReason, "structured_source_precedence");
  const applied = applyBiographyEvidenceForSimulation(dog, extraction);
  assert.equal(applied.dog.good_with_cats, false);
  assert.equal(applied.dog.bio_good_with_cats, undefined);
});

test("deterministic evidence is provenance-labeled and biography negatives never create hard exclusions", () => {
  const original = { name: "Milo", description: "No cats. He is house trained." };
  const { dog, applied } = applyBiographyEvidenceForSimulation(original);
  assert.deepEqual(applied.sort(), ["cats", "potty_training"].sort());
  assert.equal(dog.ai_traits.good_with_cats.provenance, BIOGRAPHY_EVIDENCE_PROVENANCE);
  assert.equal(dog.bio_good_with_cats, "no");
  assert.equal(dog.good_with_cats, undefined);
  const answers = { size_preference: ["flexible"], pets_in_home: ["cats"], potty_requirement: "must_be_trained" };
  assert.deepEqual(getConfirmedIncompatibilities(dog, answers), []);
  assert.equal(computeRankedMatches([dog], answers).length, 1);
});

test("contradictory biography statements remain ambiguous", () => {
  const decision = field("The prior listing says good with cats, but the foster says no cats.", "cats");
  assert.equal(decision.status, "ambiguous");
  assert.equal(decision.value, null);
});

test("silence and breed descriptions remain unknown", () => {
  const extraction = extractBiographyEvidence({ breed: "Labrador Retriever", description: "A beautiful Labrador looking for a home." });
  for (const decision of Object.values(extraction.fields)) assert.equal(decision.status, "none");
});
