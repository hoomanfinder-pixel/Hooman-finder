import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PRERENDERED_ROUTES, routeSeo } from "../src/lib/siteSeo.js";

const distDir = path.resolve("dist");

function fileForRoute(route) {
  return route === "/" ? path.join(distDir, "index.html") : path.join(distDir, `${route.slice(1)}.html`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateJsonLd(html, label) {
  const scripts = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  assert(scripts.length > 0, `${label} has no JSON-LD.`);
  for (const [, json] of scripts) JSON.parse(json);
}

for (const route of PRERENDERED_ROUTES) {
  const html = await readFile(fileForRoute(route), "utf8");
  const metadata = routeSeo(route);
  const canonical = `https://hoomanfinder.com${route === "/" ? "/" : route}`;
  assert(html.includes(`<title>${metadata.title}</title>`), `${route} title mismatch.`);
  assert(html.includes(`rel="canonical" href="${canonical}"`), `${route} canonical mismatch.`);
  assert(/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(html), `${route} lacks a raw H1.`);
  assert(/<main\b/i.test(html), `${route} lacks meaningful raw main content.`);
  assert(/<a\b[^>]*href=/i.test(html), `${route} lacks crawlable raw links.`);
  assert(html.includes(`data-prerendered-route="${route}"`), `${route} hydration marker mismatch.`);
  validateJsonLd(html, route);
}

const dogsHtml = await readFile(fileForRoute("/dogs"), "utf8");
const prerenderData = dogsHtml.match(/<script id="hooman-prerender-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
const dogData = prerenderData ? JSON.parse(prerenderData).dogs || [] : [];
if (dogData.length > 0) {
  const dogLinks = [...dogsHtml.matchAll(/href="\/dog\//g)].length;
  assert(dogLinks >= dogData.length, "/dogs does not expose its prerendered dog links.");
}

const quizHtml = await readFile(fileForRoute("/quiz"), "utf8");
assert(!/<meta[^>]+name="robots"[^>]+noindex/i.test(quizHtml), "/quiz must remain indexable.");

const shelterDir = path.join(distDir, "shelter");
let shelterFiles = [];
try {
  shelterFiles = (await readdir(shelterDir)).filter((name) => name.endsWith(".html"));
} catch {
  shelterFiles = [];
}

for (const filename of shelterFiles) {
  const html = await readFile(path.join(shelterDir, filename), "utf8");
  const id = filename.replace(/\.html$/, "");
  assert(html.includes(`rel="canonical" href="https://hoomanfinder.com/shelter/${id}"`), `${filename} canonical mismatch.`);
  assert(/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(html), `${filename} lacks a raw H1.`);
  assert(/href="\/dog\//i.test(html), `${filename} lacks raw dog links.`);
  validateJsonLd(html, filename);
}

console.log(`Validated raw SEO output for ${PRERENDERED_ROUTES.length} core routes and ${shelterFiles.length} shelter routes.`);
