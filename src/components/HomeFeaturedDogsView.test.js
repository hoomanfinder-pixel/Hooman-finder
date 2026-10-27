import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import HomeFeaturedDogsView, {
  getHomepageFeaturedDogsViewState,
} from "./HomeFeaturedDogsView.js";

function renderStatus({ count = 0, loading = false, failed = false }, children = null) {
  const state = getHomepageFeaturedDogsViewState({ count, loading, failed });
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(HomeFeaturedDogsView, { state }, children)
    )
  );
}

test("homepage featured dogs show an accessible loading state while the request is pending", () => {
  const html = renderStatus({ loading: true });

  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Loading featured dogs/);
  assert.doesNotMatch(html, /check back soon/i);
  assert.doesNotMatch(html, /could not load dogs/i);
});

test("successful featured results render the dogs instead of an empty or error message", () => {
  const html = renderStatus(
    { count: 1 },
    React.createElement("article", null, "Featured dog")
  );

  assert.match(html, /Featured dog/);
  assert.doesNotMatch(html, /check back soon/i);
  assert.doesNotMatch(html, /could not load dogs/i);
});

test("successful empty results show the check-back message only after loading completes", () => {
  const html = renderStatus({ loading: false, failed: false, count: 0 });

  assert.match(html, /New adoptable dogs are added regularly/);
  assert.match(html, /href="\/dogs"/);
  assert.doesNotMatch(html, /Loading featured dogs/);
  assert.doesNotMatch(html, /could not load dogs/i);
});

test("fetch errors show an error message rather than implying the inventory is empty", () => {
  const html = renderStatus({ loading: false, failed: true, count: 0 });

  assert.match(html, /We could not load dogs right now/);
  assert.match(html, /href="\/dogs"/);
  assert.doesNotMatch(html, /New adoptable dogs are added regularly/);
  assert.doesNotMatch(html, /Loading featured dogs/);
});
