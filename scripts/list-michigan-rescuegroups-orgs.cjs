/* eslint-disable no-console */

/**
 * List Michigan RescueGroups.org rescues/shelters with currently available dogs.
 *
 * Output:
 *   /exports/rescuegroups-michigan-orgs-with-available-dogs.csv
 *
 * Reads API key from .env.local.
 * Does NOT expose or hardcode your key.
 */

const fs = require("fs");
const path = require("path");

const API_BASE_URL = "https://api.rescuegroups.org/v5";
const OUTPUT_DIR = path.join(process.cwd(), "exports");
const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  "rescuegroups-michigan-orgs-with-available-dogs.csv"
);

const LIMIT = 250;

// These are the RescueGroups org IDs already in your Supabase dogs table.
const ALREADY_IMPORTED_ORG_IDS = new Set([
  "7921", // Happy Days Dog and Cat Rescue
  "8099", // Angels Among Us Pet Rescue
  "3182", // Last Day Dog Rescue
  "3910", // Naked K9 & Small Dog Rescue
  "10584", // Noah Project
  "1445", // The Buster Foundation Pit Bull Education and Rescue
]);

// These are already in your DB but have no RescueGroups org ID attached.
// The script can only flag them by fuzzy name match.
const ALREADY_IMPORTED_ORG_NAMES_WITHOUT_IDS = [
  "Together We Rescue Detroit Animals",
  "Capital Area Humane Society",
];

const API_KEY_ENV_NAMES = [
  "RESCUEGROUPS_API_KEY",
  "VITE_RESCUEGROUPS_API_KEY",
  "RESCUE_GROUPS_API_KEY",
  "RG_API_KEY",
  "VITE_RG_API_KEY",
];

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(envPath)) {
    throw new Error(
      `Could not find .env.local at ${envPath}. Run this from your project root.`
    );
  }

  const raw = fs.readFileSync(envPath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    // Strip surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getApiKey() {
  for (const envName of API_KEY_ENV_NAMES) {
    if (process.env[envName]) {
      return process.env[envName];
    }
  }

  throw new Error(
    `Could not find RescueGroups API key in .env.local. Tried: ${API_KEY_ENV_NAMES.join(
      ", "
    )}`
  );
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isFuzzyAlreadyImportedName(name) {
  const normalizedName = normalizeText(name);

  if (!normalizedName) return false;

  return ALREADY_IMPORTED_ORG_NAMES_WITHOUT_IDS.some((importedName) => {
    const normalizedImportedName = normalizeText(importedName);
    return (
      normalizedName.includes(normalizedImportedName) ||
      normalizedImportedName.includes(normalizedName)
    );
  });
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";

  const str = String(value);

  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

function toCsv(rows) {
  const headers = [
    "rank",
    "rescue_name",
    "rescuegroups_org_id",
    "city",
    "state",
    "website",
    "email_contact",
    "available_dogs_count",
    "sample_dog_names",
    "has_photos_count",
    "newest_updated_at",
    "newest_created_at",
    "already_imported",
    "notes",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row, index) =>
      headers
        .map((header) => {
          if (header === "rank") return csvEscape(index + 1);
          return csvEscape(row[header]);
        })
        .join(",")
    ),
  ];

  return `${lines.join("\n")}\n`;
}

function buildIncludedMap(included = []) {
  const map = new Map();

  for (const item of included || []) {
    if (!item || !item.type || !item.id) continue;
    map.set(`${item.type}:${item.id}`, item);
  }

  return map;
}

function getRelationshipItems(entity, relationshipName, includedMap) {
  const relationship = entity?.relationships?.[relationshipName]?.data;

  if (!relationship) return [];

  const refs = Array.isArray(relationship) ? relationship : [relationship];

  return refs
    .map((ref) => includedMap.get(`${ref.type}:${ref.id}`))
    .filter(Boolean);
}

function getFirstRelationshipItem(entity, relationshipName, includedMap) {
  return getRelationshipItems(entity, relationshipName, includedMap)[0] || null;
}

function getBestOrgForAnimal(animal, includedMap) {
  const org = getFirstRelationshipItem(animal, "orgs", includedMap);

  if (org) return org;

  // Fallback: sometimes relationship naming/shape can vary.
  const possibleOrgRelationships = ["org", "organization", "organizations"];

  for (const relName of possibleOrgRelationships) {
    const fallbackOrg = getFirstRelationshipItem(animal, relName, includedMap);
    if (fallbackOrg) return fallbackOrg;
  }

  return null;
}

function getBestLocationForAnimal(animal, includedMap) {
  const location = getFirstRelationshipItem(animal, "locations", includedMap);

  if (location) return location;

  const possibleLocationRelationships = ["location"];

  for (const relName of possibleLocationRelationships) {
    const fallbackLocation = getFirstRelationshipItem(
      animal,
      relName,
      includedMap
    );
    if (fallbackLocation) return fallbackLocation;
  }

  return null;
}

function getAnimalHasPhoto(animal, includedMap) {
  const attrs = animal.attributes || {};
  const pictureCount = Number(attrs.pictureCount || 0);

  if (pictureCount > 0) return true;
  if (attrs.pictureThumbnailUrl) return true;

  const pictures = getRelationshipItems(animal, "pictures", includedMap);
  return pictures.length > 0;
}

function getDateMax(existing, candidate) {
  if (!candidate) return existing || "";

  if (!existing) return candidate;

  const existingTime = Date.parse(existing);
  const candidateTime = Date.parse(candidate);

  if (Number.isNaN(candidateTime)) return existing;
  if (Number.isNaN(existingTime)) return candidate;

  return candidateTime > existingTime ? candidate : existing;
}

function getOrgKey(org, animal) {
  if (org?.id) return String(org.id);

  const animalAttrs = animal?.attributes || {};
  const fallback =
    animalAttrs.orgId ||
    animalAttrs.organizationId ||
    animalAttrs.rescuegroupsOrgId ||
    animalAttrs.rescueId ||
    "unknown-org";

  return String(fallback);
}

function getOrgNotes({ org, location, animalsMissingOrgCount }) {
  const notes = [];

  if (!org) notes.push("missing org relationship");
  if (org && !org.attributes?.email) notes.push("missing email");
  if (org && !org.attributes?.url) notes.push("missing website");

  const state = org?.attributes?.state || location?.attributes?.state;
  if (!state) notes.push("missing state");

  if (animalsMissingOrgCount > 0) {
    notes.push(`${animalsMissingOrgCount} animal(s) missing org data`);
  }

  return notes.join("; ");
}

async function rescueGroupsFetchJson(apiKey, url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
  });

  const text = await response.text();

  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `RescueGroups returned non-JSON response. Status ${response.status}. Body: ${text.slice(
        0,
        500
      )}`
    );
  }

  if (!response.ok) {
    const errorDetails = JSON.stringify(json, null, 2);
    throw new Error(
      `RescueGroups request failed. Status ${response.status}. URL: ${url}\n${errorDetails}`
    );
  }

  return json;
}

async function fetchAllAvailableDogs(apiKey) {
  const allAnimals = [];
  const allIncluded = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams({
      limit: String(LIMIT),
      page: String(page),
      include: "orgs,locations,pictures",
      sort: "-animals.updatedDate",
    });

    const url = `${API_BASE_URL}/public/animals/search/available/dogs/?${params.toString()}`;

    console.log(`Fetching available dogs page ${page}...`);

    const json = await rescueGroupsFetchJson(apiKey, url);

    const data = Array.isArray(json.data) ? json.data : [];
    const included = Array.isArray(json.included) ? json.included : [];

    allAnimals.push(...data);
    allIncluded.push(...included);

    totalPages = Number(json.meta?.pages || 1);

    console.log(
      `  got ${data.length} dogs | page ${json.meta?.pageReturned || page} of ${totalPages} | total matching ${
        json.meta?.count || "unknown"
      }`
    );

    page += 1;

    // Small pause to be polite to the API.
    await new Promise((resolve) => setTimeout(resolve, 150));
  } while (page <= totalPages);

  return {
    animals: allAnimals,
    included: allIncluded,
  };
}

function groupMichiganOrgs({ animals, included }) {
  const includedMap = buildIncludedMap(included);
  const orgGroups = new Map();

  for (const animal of animals) {
    const animalAttrs = animal.attributes || {};
    const org = getBestOrgForAnimal(animal, includedMap);
    const location = getBestLocationForAnimal(animal, includedMap);

    const orgAttrs = org?.attributes || {};
    const locationAttrs = location?.attributes || {};

    const orgState = orgAttrs.state || "";
    const locationState = locationAttrs.state || "";
    const isMichigan =
      String(orgState).toUpperCase() === "MI" ||
      String(locationState).toUpperCase() === "MI";

    if (!isMichigan) continue;

    const orgId = getOrgKey(org, animal);

    if (!orgGroups.has(orgId)) {
      const rescueName =
        orgAttrs.name ||
        animalAttrs.orgName ||
        animalAttrs.organizationName ||
        "Unknown RescueGroups Organization";

      const alreadyImported =
        ALREADY_IMPORTED_ORG_IDS.has(String(orgId)) ||
        isFuzzyAlreadyImportedName(rescueName);

      orgGroups.set(orgId, {
        rescue_name: rescueName,
        rescuegroups_org_id: org?.id || orgId || "",
        city: orgAttrs.city || locationAttrs.city || "",
        state: orgAttrs.state || locationAttrs.state || "",
        website: orgAttrs.url || orgAttrs.adoptionUrl || "",
        email_contact: orgAttrs.email || "",
        available_dogs_count: 0,
        sampleDogNamesArray: [],
        has_photos_count: 0,
        newest_updated_at: "",
        newest_created_at: "",
        already_imported: alreadyImported ? "true" : "false",
        missingOrgCount: 0,
        org,
        location,
      });
    }

    const group = orgGroups.get(orgId);

    group.available_dogs_count += 1;

    if (group.sampleDogNamesArray.length < 8 && animalAttrs.name) {
      group.sampleDogNamesArray.push(animalAttrs.name);
    }

    if (getAnimalHasPhoto(animal, includedMap)) {
      group.has_photos_count += 1;
    }

    group.newest_updated_at = getDateMax(
      group.newest_updated_at,
      animalAttrs.updatedDate
    );

    group.newest_created_at = getDateMax(
      group.newest_created_at,
      animalAttrs.createdDate
    );

    if (!org) {
      group.missingOrgCount += 1;
    }
  }

  return Array.from(orgGroups.values()).map((group) => ({
    rescue_name: group.rescue_name,
    rescuegroups_org_id: group.rescuegroups_org_id,
    city: group.city,
    state: group.state,
    website: group.website,
    email_contact: group.email_contact,
    available_dogs_count: group.available_dogs_count,
    sample_dog_names: group.sampleDogNamesArray.join(" | "),
    has_photos_count: group.has_photos_count,
    newest_updated_at: group.newest_updated_at,
    newest_created_at: group.newest_created_at,
    already_imported: group.already_imported,
    notes: getOrgNotes({
      org: group.org,
      location: group.location,
      animalsMissingOrgCount: group.missingOrgCount,
    }),
  }));
}

function rankRows(rows) {
  return rows.sort((a, b) => {
    const aMichigan = String(a.state).toUpperCase() === "MI" ? 1 : 0;
    const bMichigan = String(b.state).toUpperCase() === "MI" ? 1 : 0;

    if (bMichigan !== aMichigan) return bMichigan - aMichigan;

    if (b.available_dogs_count !== a.available_dogs_count) {
      return b.available_dogs_count - a.available_dogs_count;
    }

    const aNotImported = a.already_imported === "false" ? 1 : 0;
    const bNotImported = b.already_imported === "false" ? 1 : 0;

    if (bNotImported !== aNotImported) return bNotImported - aNotImported;

    if (b.has_photos_count !== a.has_photos_count) {
      return b.has_photos_count - a.has_photos_count;
    }

    return String(a.rescue_name).localeCompare(String(b.rescue_name));
  });
}

async function main() {
  loadEnvLocal();

  const apiKey = getApiKey();

  console.log("Starting RescueGroups Michigan org discovery...");
  console.log("API key loaded from .env.local. Key will not be printed.");

  const { animals, included } = await fetchAllAvailableDogs(apiKey);

  console.log(`Fetched ${animals.length} currently available dogs total.`);

  const michiganRows = rankRows(groupMichiganOrgs({ animals, included }));

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, toCsv(michiganRows), "utf8");

  console.log("");
  console.log(`Done. Found ${michiganRows.length} Michigan orgs with available dogs.`);
  console.log(`CSV saved to: ${OUTPUT_FILE}`);
  console.log("");

  console.table(
    michiganRows.slice(0, 20).map((row, index) => ({
      rank: index + 1,
      rescue_name: row.rescue_name,
      rescuegroups_org_id: row.rescuegroups_org_id,
      city: row.city,
      state: row.state,
      available_dogs_count: row.available_dogs_count,
      has_photos_count: row.has_photos_count,
      already_imported: row.already_imported,
    }))
  );
}

main().catch((error) => {
  console.error("");
  console.error("Script failed:");
  console.error(error.message);
  console.error("");
  process.exit(1);
});