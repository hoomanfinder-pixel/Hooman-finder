// Generate public dog profile sitemap.
//
// Run:
//   npm run generate:dog-sitemap

require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SITE_URL = "https://hoomanfinder.com";
const SITEMAP_PATH = path.join(process.cwd(), "public", "sitemap.xml");
const DOG_SITEMAP_PATH = path.join(process.cwd(), "public", "dog-sitemap.xml");
const PLATFORM_STATS_PATH = path.join(
  process.cwd(),
  "src",
  "generated",
  "platform-stats.json"
);
const PAGE_SIZE = 1000;
const STATIC_ROUTES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/dogs", changefreq: "daily", priority: "0.9" },
  { path: "/quiz", changefreq: "monthly", priority: "0.8" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/contact", changefreq: "yearly", priority: "0.4" },
  { path: "/privacy", changefreq: "yearly", priority: "0.2" },
  { path: "/terms", changefreq: "yearly", priority: "0.2" },
  { path: "/shelters/join", changefreq: "monthly", priority: "0.4" },
];


function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function dogUrl(dog) {
  return `${SITE_URL}/dog/${encodeURIComponent(String(dog.id))}`;
}

function formatLastmod(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function buildUrlXml({ loc, lastmod, changefreq, priority }) {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : "",
    `    <changefreq>${escapeXml(changefreq)}</changefreq>`,
    `    <priority>${escapeXml(priority)}</priority>`,
    "  </url>",
  ].filter(Boolean).join("\n");
}

function dogEntries(dogs) {
  return dogs.map((dog) => ({
    loc: dogUrl(dog),
    lastmod: formatLastmod(
      dog.source_updated_at || dog.last_seen_at || dog.created_at
    ),
    changefreq: "daily",
    priority: "0.7",
  }));
}

function shelterEntries(dogs, shelterById) {
  const ids = new Set(dogs.map((dog) => dog.shelter_id).filter(Boolean));
  return Array.from(ids)
    .filter((id) => shelterById.has(id))
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map((id) => ({
      loc: `${SITE_URL}/shelter/${encodeURIComponent(String(id))}`,
      changefreq: "daily",
      priority: "0.6",
    }));
}

function buildXml(entries) {
  const urls = entries
    .map((dog) => {
      return buildUrlXml(dog);
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

function createSupabaseClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = anonKey || serviceRoleKey;
  const keyType = anonKey ? "anon" : "service_role";

  if (!supabaseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL.");
  }

  if (!key) {
    throw new Error("Missing VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return {
    keyType,
    supabase: createClient(supabaseUrl, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
  };
}

async function fetchDogRows(supabase) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("dogs")
      .select("*")
      .eq("adoptable", true)
      .in("availability_status", ["available", "active", "unknown"])
      .order("created_at", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (error) throw error;

    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

async function main() {
  const [{ filterPublicDogs }, { getDogSourceName }] = await Promise.all([
    import("../src/lib/dogVisibility.js"),
    import("../src/lib/dogSource.js"),
  ]);
  const { supabase, keyType } = createSupabaseClient();
  const rows = await fetchDogRows(supabase);
  const { data: shelters, error: shelterError } = await supabase
    .from("shelters")
    .select("id, name");
  if (shelterError) throw shelterError;
  const shelterById = new Map((shelters || []).map((shelter) => [shelter.id, shelter]));
  const joinedRows = rows.map((dog) => ({
    ...dog,
    shelters: shelterById.get(dog.shelter_id) || null,
  }));
  const dogs = filterPublicDogs(joinedRows)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const staticEntries = STATIC_ROUTES.map((route) => ({
    loc: `${SITE_URL}${route.path}`,
    changefreq: route.changefreq,
    priority: route.priority,
  }));
  const dogsOnly = dogEntries(dogs);
  const sheltersOnly = shelterEntries(dogs, shelterById);

  fs.writeFileSync(DOG_SITEMAP_PATH, buildXml(dogsOnly), "utf8");
  fs.writeFileSync(SITEMAP_PATH, buildXml([...staticEntries, ...sheltersOnly, ...dogsOnly]), "utf8");
  const publicShelters = new Set(
    dogs.map((dog) => getDogSourceName(dog, "").toLowerCase()).filter(Boolean)
  );
  fs.mkdirSync(path.dirname(PLATFORM_STATS_PATH), { recursive: true });
  fs.writeFileSync(
    PLATFORM_STATS_PATH,
    `${JSON.stringify(
      {
        version: 1,
        generated_at: new Date().toISOString(),
        public_dog_count: dogs.length,
        public_shelter_count: publicShelters.size,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(`Generated ${path.relative(process.cwd(), SITEMAP_PATH)}.`);
  console.log(`Generated ${path.relative(process.cwd(), DOG_SITEMAP_PATH)}.`);
  console.log(`Generated ${path.relative(process.cwd(), PLATFORM_STATS_PATH)}.`);
  console.log(`Supabase key used: ${keyType}.`);
  console.log(`Fetched ${rows.length} candidate dogs; included ${dogs.length} public dog URLs.`);
}

main().catch((error) => {
  console.error(`Could not generate dog sitemap: ${error.message}`);
  process.exit(1);
});
