import test from "node:test";
import assert from "node:assert/strict";

import {
  BIOGRAPHY_EVIDENCE_PROVENANCE,
  applyBiographyEvidenceForSimulation,
  extractBiographyEvidence,
} from "./biographyEvidence.js";
import { computeRankedMatches, getConfirmedIncompatibilities } from "./matchingLogic.js";

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
  const extraction = extractBiographyEvidence({ description: "A calm home with older children only." });
  assert.equal(extraction.fields.children.value, "older_children_only");
  assert.equal(extraction.fields.children.blockedReason, "unsupported_age_specific_child_mapping");
  const applied = applyBiographyEvidenceForSimulation({ description: "A calm home with older children only." }, extraction);
  assert.equal(applied.applied.includes("children"), false);
  assert.equal(applied.dog.bio_good_with_kids, undefined);
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
