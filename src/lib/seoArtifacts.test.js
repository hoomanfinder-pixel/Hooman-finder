import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function locations(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

test("sitemaps contain only unique canonical public route shapes", async () => {
  const [mainXml, dogXml] = await Promise.all([
    readFile(new URL("../../public/sitemap.xml", import.meta.url), "utf8"),
    readFile(new URL("../../public/dog-sitemap.xml", import.meta.url), "utf8"),
  ]);
  const main = locations(mainXml);
  const dogs = locations(dogXml);

  assert.equal(new Set(main).size, main.length);
  assert.equal(new Set(dogs).size, dogs.length);
  assert.ok(main.includes("https://hoomanfinder.com/dogs"));
  assert.ok(main.includes("https://hoomanfinder.com/quiz"));
  assert.ok(main.includes("https://hoomanfinder.com/shelters/join"));
  assert.ok(main.some((url) => url.startsWith("https://hoomanfinder.com/shelter/")));
  assert.ok(dogs.length > 0);
  assert.ok(dogs.every((url) => /^https:\/\/hoomanfinder\.com\/dog\/[^/?#]+$/.test(url)));
  assert.ok(dogs.every((url) => main.includes(url)));
  assert.ok(main.every((url) => !url.includes("/results") && !url.includes("/saved")));
  assert.ok(main.every((url) => !url.includes("/dogs/") || url.includes("/shelters/")));
});
