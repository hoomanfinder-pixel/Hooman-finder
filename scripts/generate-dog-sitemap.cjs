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
const OUTPUT_PATH = path.join(process.cwd(), "public", "dog-sitemap.xml");
const PAGE_SIZE = 1000;

const DOG_SELECT = [
  "id",
  "adoptable",
  "adoption_pending",
  "urgency_level",
  "availability_status",
  "rescuegroups_id",
  "rescuegroups_org_id",
  "source",
  "external_id",
  "source_url",
  "adoption_url",
  "created_at",
].join(", ");

const ACTIVE_STATUSES = new Set(["active", "available", "unknown"]);
const VERIFIED_CONFIDENCE = new Set(["current", "trusted", "verified"]);
const TRUSTED_EXTERNAL_ID_SOURCES = new Set(["rescuegroups"]);
const TRUSTED_LISTING_HOSTS = [
  "rescuegroups.org",
  "petfinder.com",
  "adoptapet.com",
  "shelterluv.com",
  "petango.com",
];

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function hasReliableUrl(value) {
  const url = clean(value);

  if (!url.startsWith("https://")) return false;

  try {
    const { hostname } = new URL(url);
    return TRUSTED_LISTING_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

function hasRescueGroupsIdentity(dog) {
  return Boolean(clean(dog?.rescuegroups_id) || clean(dog?.rescuegroups_org_id));
}

function hasTrustedSyncedSource(dog) {
  return (
    hasRescueGroupsIdentity(dog) ||
    (TRUSTED_EXTERNAL_ID_SOURCES.has(lower(dog?.source)) && Boolean(clean(dog?.external_id)))
  );
}

function hasVerifiedListingSource(dog) {
  const confidence = lower(dog?.source_confidence);
  const verified =
    dog?.verified === true ||
    dog?.availability_verified === true ||
    VERIFIED_CONFIDENCE.has(confidence);

  return verified && (hasReliableUrl(dog?.source_url) || hasReliableUrl(dog?.adoption_url));
}

function isPubliclyVisibleDog(dog) {
  if (!dog) return false;
  if (dog.adoptable !== true) return false;
  if (dog.adoption_pending === true) return false;
  if (lower(dog.urgency_level) === "adopted") return false;
  if (!ACTIVE_STATUSES.has(lower(dog.availability_status))) return false;

  return hasTrustedSyncedSource(dog) || hasVerifiedListingSource(dog);
}

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

function buildXml(dogs) {
  const urls = dogs
    .map((dog) => {
      const lastmod = formatLastmod(dog.updated_at || dog.created_at);
      return [
        "  <url>",
        `    <loc>${escapeXml(dogUrl(dog))}</loc>`,
        lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : "",
        "    <changefreq>daily</changefreq>",
        "    <priority>0.7</priority>",
        "  </url>",
      ].filter(Boolean).join("\n");
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
      .select(DOG_SELECT)
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
  const { supabase, keyType } = createSupabaseClient();
  const rows = await fetchDogRows(supabase);
  const dogs = rows
    .filter(isPubliclyVisibleDog)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  fs.writeFileSync(OUTPUT_PATH, buildXml(dogs), "utf8");

  console.log(`Generated ${path.relative(process.cwd(), OUTPUT_PATH)}.`);
  console.log(`Supabase key used: ${keyType}.`);
  console.log(`Fetched ${rows.length} candidate dogs; included ${dogs.length} public dog URLs.`);
}

main().catch((error) => {
  console.error(`Could not generate dog sitemap: ${error.message}`);
  process.exit(1);
});
