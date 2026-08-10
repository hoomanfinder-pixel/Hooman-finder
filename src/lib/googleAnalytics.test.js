import test from "node:test";
import assert from "node:assert/strict";

import {
  GOOGLE_ANALYTICS_EVENTS,
  GOOGLE_ANALYTICS_MEASUREMENT_ID,
  initializeGoogleAnalytics,
  trackAdoptionLinkClick,
  trackQuizComplete,
  trackQuizStart,
} from "./googleAnalytics.js";

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
}

function analyticsEnvironment(hostname) {
  const appendedScripts = [];
  const windowRef = { location: { hostname }, localStorage: new MemoryStorage() };
  const documentRef = {
    createElement(tagName) {
      return { tagName, dataset: {} };
    },
    head: {
      appendChild(script) {
        appendedScripts.push(script);
      },
    },
  };

  return { appendedScripts, documentRef, windowRef };
}

test("Google Analytics initializes once on the live site", () => {
  const environment = analyticsEnvironment("hoomanfinder.com");
  const now = new Date("2026-08-09T00:00:00.000Z");

  assert.equal(initializeGoogleAnalytics({ ...environment, now }), true);
  assert.equal(initializeGoogleAnalytics({ ...environment, now }), false);

  assert.equal(environment.appendedScripts.length, 1);
  assert.equal(environment.appendedScripts[0].async, true);
  assert.equal(
    environment.appendedScripts[0].src,
    `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}`
  );
  assert.equal(environment.windowRef.dataLayer.length, 2);
  assert.equal(environment.windowRef.dataLayer[0][0], "js");
  assert.equal(environment.windowRef.dataLayer[0][1], now);
  assert.equal(environment.windowRef.dataLayer[1][0], "config");
  assert.equal(environment.windowRef.dataLayer[1][1], GOOGLE_ANALYTICS_MEASUREMENT_ID);
});

test("Google Analytics stays disabled away from the live hostname", () => {
  for (const hostname of ["localhost", "127.0.0.1", "preview.vercel.app"]) {
    const environment = analyticsEnvironment(hostname);
    assert.equal(initializeGoogleAnalytics(environment), false);
    assert.deepEqual(environment.appendedScripts, []);
    assert.equal(environment.windowRef.dataLayer, undefined);
  }
});

test("quiz conversion events fire once per quiz session without event parameters", () => {
  const environment = analyticsEnvironment("hoomanfinder.com");
  initializeGoogleAnalytics(environment);

  assert.equal(trackQuizStart("quiz-session-1", environment), true);
  assert.equal(trackQuizStart("quiz-session-1", environment), false);
  assert.equal(trackQuizComplete("quiz-session-1", environment), true);
  assert.equal(trackQuizComplete("quiz-session-1", environment), false);

  const eventCalls = environment.windowRef.dataLayer.slice(2);
  assert.deepEqual(
    eventCalls.map((call) => Array.from(call)),
    [
      ["event", GOOGLE_ANALYTICS_EVENTS.QUIZ_START],
      ["event", GOOGLE_ANALYTICS_EVENTS.QUIZ_COMPLETE],
    ]
  );
});

test("quiz conversion deduplication survives a page refresh", () => {
  const localStorage = new MemoryStorage();
  const firstPage = analyticsEnvironment("hoomanfinder.com");
  firstPage.windowRef.localStorage = localStorage;
  initializeGoogleAnalytics(firstPage);
  assert.equal(trackQuizStart("quiz-session-1", firstPage), true);

  const refreshedPage = analyticsEnvironment("hoomanfinder.com");
  refreshedPage.windowRef.localStorage = localStorage;
  initializeGoogleAnalytics(refreshedPage);
  assert.equal(trackQuizStart("quiz-session-1", refreshedPage), false);
  assert.equal(refreshedPage.windowRef.dataLayer.length, 2);
});

test("adoption link clicks fire for each click and include no dog or user context", () => {
  const environment = analyticsEnvironment("www.hoomanfinder.com");
  initializeGoogleAnalytics(environment);

  assert.equal(trackAdoptionLinkClick(environment), true);
  assert.equal(trackAdoptionLinkClick(environment), true);

  const eventCalls = environment.windowRef.dataLayer.slice(2);
  assert.deepEqual(
    eventCalls.map((call) => Array.from(call)),
    [
      ["event", GOOGLE_ANALYTICS_EVENTS.ADOPTION_LINK_CLICK],
      ["event", GOOGLE_ANALYTICS_EVENTS.ADOPTION_LINK_CLICK],
    ]
  );
});

test("conversion tracking stays disabled when GA is not initialized", () => {
  const environment = analyticsEnvironment("hoomanfinder.com");

  assert.equal(trackQuizStart("quiz-session-1", environment), false);
  assert.equal(trackQuizComplete("quiz-session-1", environment), false);
  assert.equal(trackAdoptionLinkClick(environment), false);
  assert.equal(environment.windowRef.dataLayer, undefined);
});
