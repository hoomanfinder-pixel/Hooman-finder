import test from "node:test";
import assert from "node:assert/strict";

import {
  DOG_CARD_BATCH_SIZE,
  getNextVisibleDogCount,
  getVisibleDogItems,
  INITIAL_DOG_CARD_COUNT,
} from "./incrementalDogRendering.js";

test("dog cards render in bounded batches without changing the full collection", () => {
  const dogs = Array.from({ length: 1109 }, (_, index) => ({ id: `dog-${index}` }));
  const initial = getVisibleDogItems(dogs, INITIAL_DOG_CARD_COUNT);
  const nextCount = getNextVisibleDogCount(initial.length, dogs.length);
  const next = getVisibleDogItems(dogs, nextCount);

  assert.equal(dogs.length, 1109);
  assert.equal(initial.length, INITIAL_DOG_CARD_COUNT);
  assert.equal(next.length, INITIAL_DOG_CARD_COUNT + DOG_CARD_BATCH_SIZE);
  assert.equal(next.at(-1).id, `dog-${next.length - 1}`);
});

test("the final incremental batch stops at the available result count", () => {
  assert.equal(getNextVisibleDogCount(1090, 1109), 1109);
  assert.equal(getVisibleDogItems([1, 2, 3], 24).length, 3);
});
