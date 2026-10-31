import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_RESULT_FILTERS,
  getActiveQuizSessionId,
  loadResultFilters,
  loadQuizResponses,
  resetResultFilters,
  saveResultFilters,
  saveQuizResponses,
} from "./quizStorage.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function installBrowserStorage() {
  globalThis.window = {
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
  };
}

test("anonymous quiz answers are saved completely in session and local storage", async (t) => {
  installBrowserStorage();
  t.after(() => delete globalThis.window);

  const sessionId = "local-storage-test";
  const answers = {
    size_preference: ["medium"],
    age_preference: ["adult"],
    kids_in_home: ["no_children"],
  };

  const saved = await saveQuizResponses(sessionId, answers);
  const sessionKey = `hoomanFinder.quizResponses.session.v1:${sessionId}`;
  const localKey = `hoomanFinder.quizResponses.local.v1:${sessionId}`;

  assert.deepEqual(saved.answersById, answers);
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(sessionKey)), answers);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(localKey)), answers);
  assert.equal(window.sessionStorage.getItem("hoomanFinderActiveQuizSession"), sessionId);
  assert.equal(window.localStorage.getItem("hoomanFinderActiveQuizSession"), sessionId);
  assert.equal(getActiveQuizSessionId(), sessionId);
});

test("local storage restores quiz answers and repopulates session storage", async (t) => {
  installBrowserStorage();
  t.after(() => delete globalThis.window);

  const sessionId = "local-fallback-test";
  const answers = {
    pets_in_home: ["dogs"],
    allergy_sensitivity: "mild",
  };
  const sessionKey = `hoomanFinder.quizResponses.session.v1:${sessionId}`;
  const localKey = `hoomanFinder.quizResponses.local.v1:${sessionId}`;
  window.localStorage.setItem(localKey, JSON.stringify(answers));

  const loaded = await loadQuizResponses(sessionId);

  assert.deepEqual(loaded.answersById, {
    pets_in_home: ["dogs"],
    allergy_sensitivity: "mild_allergies",
  });
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(sessionKey)), answers);
});

test("all ten result filters persist and remain isolated by quiz session", (t) => {
  installBrowserStorage();
  t.after(() => delete globalThis.window);

  const filters = {
    rescueFilter: "e2e-org-1",
    stateFilter: "mi",
    ageFilter: "adult",
    sizeFilter: "Medium",
    energyFilter: "Moderate",
    hypoOnly: true,
    pottyOnly: true,
    kidsOnly: true,
    catsOnly: true,
    dogsOnly: true,
  };

  assert.deepEqual(saveResultFilters("filter-session-a", filters), {
    ...filters,
    stateFilter: "MI",
  });
  assert.deepEqual(loadResultFilters("filter-session-a"), {
    ...filters,
    stateFilter: "MI",
  });
  assert.deepEqual(loadResultFilters("filter-session-b"), DEFAULT_RESULT_FILTERS);
});

test("result filters restore locally, normalize invalid values, and repopulate session storage", (t) => {
  installBrowserStorage();
  t.after(() => delete globalThis.window);

  const sessionId = "filter-local-fallback";
  const sessionKey = `hoomanFinder.resultFilters.session.v1:${sessionId}`;
  const localKey = `hoomanFinder.resultFilters.local.v1:${sessionId}`;
  window.localStorage.setItem(localKey, JSON.stringify({
    rescueFilter: "e2e-org-1",
    stateFilter: "michigan",
    ageFilter: "invalid",
    sizeFilter: "Medium",
    energyFilter: "Moderate",
    kidsOnly: true,
    catsOnly: "true",
  }));

  const restored = loadResultFilters(sessionId);
  assert.deepEqual(restored, {
    ...DEFAULT_RESULT_FILTERS,
    rescueFilter: "e2e-org-1",
    sizeFilter: "Medium",
    energyFilter: "Moderate",
    kidsOnly: true,
  });
  assert.deepEqual(JSON.parse(window.sessionStorage.getItem(sessionKey)), restored);
});

test("resetting result filters never changes quiz answers", async (t) => {
  installBrowserStorage();
  t.after(() => delete globalThis.window);

  const sessionId = "filter-reset";
  const answers = {
    size_preference: ["medium"],
    kids_in_home: ["under_3", "3_5"],
  };
  await saveQuizResponses(sessionId, answers);
  saveResultFilters(sessionId, {
    ...DEFAULT_RESULT_FILTERS,
    stateFilter: "MI",
    kidsOnly: true,
  });

  assert.deepEqual(resetResultFilters(sessionId), DEFAULT_RESULT_FILTERS);
  assert.deepEqual(loadResultFilters(sessionId), DEFAULT_RESULT_FILTERS);
  assert.deepEqual((await loadQuizResponses(sessionId)).answersById, answers);
});
