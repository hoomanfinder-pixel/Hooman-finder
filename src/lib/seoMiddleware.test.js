import test from "node:test";
import assert from "node:assert/strict";

import middleware from "../../middleware.js";

const SHELL = `<!doctype html><html><head><title>Home</title><meta name="description" content="Home" /><link rel="canonical" href="https://hoomanfinder.com/" /></head><body><div id="root"></div></body></html>`;
const originalFetch = globalThis.fetch;

globalThis.process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
globalThis.process.env.VITE_SUPABASE_ANON_KEY = "test-key";

function withFetch(handler, run) {
  globalThis.fetch = handler;
  return Promise.resolve(run()).finally(() => {
    globalThis.fetch = originalFetch;
  });
}

function shellResponse() {
  return new Response(SHELL, { status: 200, headers: { "content-type": "text/html" } });
}

test("legacy dog aliases and trailing slashes permanently redirect", async () => {
  const alias = await middleware(new Request("https://hoomanfinder.com/dogs/dog-123?from=dogs"));
  assert.equal(alias.status, 308);
  assert.equal(alias.headers.get("location"), "https://hoomanfinder.com/dog/dog-123?from=dogs");

  const trailing = await middleware(new Request("https://hoomanfinder.com/dog/dog-123/"));
  assert.equal(trailing.status, 308);
  assert.equal(trailing.headers.get("location"), "https://hoomanfinder.com/dog/dog-123");
});

test("unknown routes return a meaningful noindexed 404", async () => {
  await withFetch(async () => shellResponse(), async () => {
    const response = await middleware(new Request("https://hoomanfinder.com/not-real"));
    const html = await response.text();
    assert.equal(response.status, 404);
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
    assert.match(html, /<h1>Page not found<\/h1>/);
    assert.match(html, /href="\/dogs"/);
  });
});

test("nonexistent dogs return 404 while unavailable dogs remain 200 noindex", async () => {
  await withFetch(async (input) => {
    const url = String(input);
    if (url.includes("/spa.html")) return shellResponse();
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }, async () => {
    const missing = await middleware(new Request("https://hoomanfinder.com/dog/missing"));
    assert.equal(missing.status, 404);
  });

  const unavailable = {
    id: "old-dog",
    name: "Old Dog",
    adoptable: false,
    adoption_pending: false,
    availability_status: "unavailable",
    rescuegroups_id: "rg-old",
  };
  await withFetch(async (input) => {
    const url = String(input);
    if (url.includes("/spa.html")) return shellResponse();
    return Response.json([unavailable]);
  }, async () => {
    const response = await middleware(new Request("https://hoomanfinder.com/dog/old-dog"));
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /noindex, nofollow/);
    assert.doesNotMatch(html, /data-dog-profile-snapshot/);
  });
});

test("personalized quiz and private app states expose raw noindex", async () => {
  await withFetch(async () => shellResponse(), async () => {
    for (const path of ["/quiz?session=abc", "/results?session=abc", "/saved"]) {
      const response = await middleware(new Request(`https://hoomanfinder.com${path}`));
      assert.equal(response.status, 200);
      assert.match(await response.text(), /noindex, nofollow/);
    }
  });
});

test("shelter responses have self-canonical metadata and crawlable dog links", async () => {
  const shelter = {
    id: "shelter-123",
    name: "Detroit Dog Rescue",
    city: "Detroit",
    state: "mi",
    website: "https://rescue.example.org",
  };
  const dog = {
    id: "dog-123",
    name: "Mabel",
    breed: "Labrador Retriever",
    shelter_id: shelter.id,
    adoptable: true,
    adoption_pending: false,
    availability_status: "available",
    urgency_level: "Standard",
    rescuegroups_id: "rg-123",
  };

  await withFetch(async (input) => {
    const url = String(input);
    if (url.includes("/spa.html")) return shellResponse();
    if (url.includes("/rest/v1/shelters")) return Response.json([shelter]);
    if (url.includes("/rest/v1/dogs")) return Response.json([dog]);
    throw new Error(`Unexpected URL: ${url}`);
  }, async () => {
    const response = await middleware(
      new Request("https://hoomanfinder.com/shelter/shelter-123")
    );
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<title>Detroit Dog Rescue Dogs for Adoption in Detroit, MI/);
    assert.match(html, /rel="canonical" href="https:\/\/hoomanfinder.com\/shelter\/shelter-123"/);
    assert.match(html, /<h1>Detroit Dog Rescue<\/h1>/);
    assert.match(html, /href="\/dog\/dog-123">Mabel<\/a>/);
  });
});
