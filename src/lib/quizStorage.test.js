import test from "node:test";
import assert from "node:assert/strict";

import {
  getActiveQuizSessionId,
  loadQuizResponses,
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
