import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { render } from "../dist/server/entry-server.js";
import { filterPublicDogs } from "../src/lib/dogVisibility.js";
import { normalizeDogLocation } from "../src/lib/dogProfileSeo.js";
import { PRERENDERED_ROUTES, routeSeo } from "../src/lib/siteSeo.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const distDir = path.resolve("dist");
const indexPath = path.join(distDir, "index.html");
const spaPath = path.join(distDir, "spa.html");
const serverPath = path.join(distDir, "server");
const rootPlaceholder = '<div id="root"></div>';
const shell = await readFile(indexPath, "utf8");
const stylesheetMatch = shell.match(
  /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i
);

if (!shell.includes(rootPlaceholder)) throw new Error("Could not find the Vite root placeholder.");
if (!stylesheetMatch || !stylesheetMatch[1].startsWith("/assets/")) {
  throw new Error("Could not find the generated Vite stylesheet.");
}

function replaceTag(html, pattern, replacement) {
  return pattern.test(html)
    ? html.replace(pattern, replacement)
    : html.replace("</head>", `    ${replacement}\n  </head>`);
}

function applyMetadata(html, pathname, metadata) {
  const canonical = `https://hoomanfinder.com${pathname === "/" ? "/" : pathname}`;
  let result = replaceTag(html, /<title>[\s\S]*?<\/title>/i, `<title>${metadata.title}</title>`);
  result = replaceTag(result, /<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/i,
    `<meta name="description" content="${metadata.description}" />`);
  result = replaceTag(result, /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i,
    `<link rel="canonical" href="${canonical}" />`);
  for (const property of ["og:title", "twitter:title"]) {
    const attribute = property.startsWith("og:") ? "property" : "name";
    result = replaceTag(result, new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${property}["'])[^>]*>`, "i"),
      `<meta ${attribute}="${property}" content="${metadata.title}" />`);
  }
  for (const property of ["og:description", "twitter:description"]) {
    const attribute = property.startsWith("og:") ? "property" : "name";
    result = replaceTag(result, new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${property}["'])[^>]*>`, "i"),
      `<meta ${attribute}="${property}" content="${metadata.description}" />`);
  }
  result = replaceTag(result, /<meta\b(?=[^>]*\bproperty=["']og:url["'])[^>]*>/i,
    `<meta property="og:url" content="${canonical}" />`);
  return result;
}

function dataScript(initialData) {
  if (!initialData) return "";
  const json = JSON.stringify(initialData).replace(/</g, "\\u003c");
  return `<script id="hooman-prerender-data" type="application/json">${json}</script>`;
}

function outputPath(pathname) {
  if (pathname === "/") return indexPath;
  return path.join(distDir, `${pathname.slice(1)}.html`);
}

function prerenderDocument(pathname, initialData = null, baseShell = shell, metadataOverride = null) {
  const metadata = metadataOverride || routeSeo(pathname);
  const content = render(pathname, initialData);
  let html = applyMetadata(baseShell, pathname, metadata);
  html = html.replace(
    rootPlaceholder,
    `<div id="root" data-prerendered-route="${pathname}">${content}</div>${dataScript(initialData)}`
  );
  return html;
}

async function loadCatalogData() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { dogs: [], shelters: [] };

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const [{ data: dogRows, error: dogError }, { data: shelters, error: shelterError }] =
      await Promise.all([
        supabase.from("dogs").select("*, shelters(id,name,city,state,website,apply_url,logo_url)")
          .eq("adoptable", true)
          .or("adoption_pending.is.null,adoption_pending.eq.false")
          .in("availability_status", ["available", "active", "unknown"])
          .order("created_at", { ascending: false }),
        supabase.from("shelters").select("*"),
      ]);
    if (dogError) throw dogError;
    if (shelterError) throw shelterError;
    return { dogs: filterPublicDogs(dogRows || []), shelters: shelters || [] };
  } catch (error) {
    console.warn(`Catalog prerender data unavailable: ${error.message}`);
    return { dogs: [], shelters: [] };
  }
}

await writeFile(spaPath, shell, "utf8");

const stylesheetPath = path.join(distDir, stylesheetMatch[1]);
const stylesheet = await readFile(stylesheetPath, "utf8");
const homepageShell = shell.replace(
  stylesheetMatch[0],
  `<style data-home-styles>${stylesheet.replace(/<\/style/gi, "<\\/style")}</style>`
);
const { dogs, shelters } = await loadCatalogData();

for (const pathname of PRERENDERED_ROUTES) {
  const initialData = pathname === "/dogs" ? { dogs: dogs.slice(0, 24) } : null;
  const target = outputPath(pathname);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(
    target,
    prerenderDocument(pathname, initialData, pathname === "/" ? homepageShell : shell),
    "utf8"
  );
}

const representedShelterIds = new Set(dogs.map((dog) => dog.shelter_id).filter(Boolean));
for (const shelter of shelters.filter((item) => representedShelterIds.has(item.id))) {
  const pathname = `/shelter/${shelter.id}`;
  const target = path.join(distDir, `${pathname.slice(1)}.html`);
  const shelterDogs = dogs.filter((dog) => dog.shelter_id === shelter.id);
  const shelterLocation = normalizeDogLocation(
    [shelter.city, shelter.state].filter(Boolean).join(", "),
  );
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(
    target,
    prerenderDocument(
      pathname,
      { shelterPage: { shelter: { ...shelter }, dogs: shelterDogs } },
      shell,
      {
        title: `${shelter.name} Dogs for Adoption${shelterLocation ? ` in ${shelterLocation}` : ""} | Hooman Finder`,
        description: `View current adoptable dogs from ${shelter.name}${shelterLocation ? ` in ${shelterLocation}` : ""}, with confirmed profile details and official adoption links.`,
      }
    ),
    "utf8"
  );
}

await rm(serverPath, { recursive: true, force: true });
console.log(`Prerendered ${PRERENDERED_ROUTES.length} core routes and ${representedShelterIds.size} shelter routes.`);
