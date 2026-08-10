import test from "node:test";
import assert from "node:assert/strict";

import {
  GOOGLE_ANALYTICS_MEASUREMENT_ID,
  initializeGoogleAnalytics,
} from "./googleAnalytics.js";

function analyticsEnvironment(hostname) {
  const appendedScripts = [];
  const windowRef = { location: { hostname } };
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
