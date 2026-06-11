/* eslint-disable no-console */

/**
 * Controlled RescueGroups import for Detroit Animal Care and Control.
 * BOOTSTRAP/MANUAL IMPORTER ONLY.
 *
 * Use sync-rescuegroups-dogs.cjs via `npm run sync:rescuegroups` for the daily
 * accurate refresh path. That sync marks missing dogs unavailable.
 *
 * Defaults to preview mode. Add --confirm to write to Supabase.
 * This script does not run SQL, delete dogs, scrape other sites, or mark missing
 * dogs unavailable.
 */

require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const {
  DACC_ADOPT_URL,
  DACC_WEBSITE,
  attachShelterIdsToDogs,
} = require("./rescuegroups-shelter-utils.cjs");

const RESCUEGROUPS_API_URL =
  "https://api.rescuegroups.org/v5/public/animals/search/available/dogs";

const DACC_ORG_ID = "8883";
const DACC_ORG_NAME = "Detroit Animal Care and Control";
const DACC_CITY = "Detroit";
const DACC_STATE = "MI";
const PAGE_LIMIT = 100;
const MAX_PAGES = 5;
const API_TIMEOUT_MS = 30000;

const CONFIRMED = process.argv.includes("--confirm");

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeApiKey(value) {
  return String(value || "")
    .trim()
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "");
}

function cleanText(value) {
  const text = clean(value);
  if (!text) return null;

  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeState(value) {
  const text = clean(value);
  return text ? text.toUpperCase() : null;
}

function attr(item, key) {
  return item?.attributes?.[key] ?? null;
}

function relationshipData(item, name) {
  return item?.relationships?.[name]?.data || null;
}

function relationshipId(item, name) {
  const data = relationshipData(item, name);
  if (Array.isArray(data)) return data[0]?.id || null;
  return data?.id || null;
}

function findIncluded(included, type, id) {
  if (!id) return null;
  return included.find((item) => item.type === type && String(item.id) === String(id)) || null;
}

function findOrgForAnimal(animal, included) {
  const orgId =
    relationshipId(animal, "orgs") ||
    relationshipId(animal, "org") ||
    relationshipId(animal, "organizations") ||
    relationshipId(animal, "organization");

  return (
    findIncluded(included, "orgs", orgId) ||
    findIncluded(included, "organizations", orgId) ||
    null
  );
}

function findPicturesForAnimal(animal, included) {
  const pictureRefs =
    relationshipData(animal, "pictures") ||
    relationshipData(animal, "picture") ||
    relationshipData(animal, "photos") ||
    relationshipData(animal, "images") ||
    [];

  const refs = Array.isArray(pictureRefs) ? pictureRefs : [pictureRefs];

  return refs
    .map((ref) => {
      return (
        findIncluded(included, "pictures", ref?.id) ||
        findIncluded(included, "photos", ref?.id) ||
        null
      );
    })
    .filter(Boolean);
}

function pickPhotoUrl(animal, included) {
  const pictures = findPicturesForAnimal(animal, included);

  for (const picture of pictures) {
    const url =
      clean(attr(picture, "urlSecureFullsize")) ||
      clean(attr(picture, "urlFullsize")) ||
      clean(attr(picture, "urlSecureLarge")) ||
      clean(attr(picture, "urlLarge")) ||
      clean(attr(picture, "large")?.url) ||
      clean(attr(picture, "original")?.url) ||
      clean(attr(picture, "medium")?.url) ||
      clean(attr(picture, "small")?.url) ||
      clean(attr(picture, "url"));

    if (url) return url;
  }

  return (
    clean(attr(animal, "pictureUrl")) ||
    clean(attr(animal, "imageUrl")) ||
    clean(attr(animal, "photoUrl")) ||
    clean(attr(animal, "pictureThumbnailUrl"))
  );
}

function getBreed(animal) {
  return (
    clean(attr(animal, "breedString")) ||
    clean(attr(animal, "breedPrimary")) ||
    clean(attr(animal, "primaryBreed")) ||
    clean(attr(animal, "breed")) ||
    clean(attr(animal, "breeds"))
  );
}

function getAgeText(animal) {
  return (
    clean(attr(animal, "ageString")) ||
    clean(attr(animal, "ageGroup")) ||
    clean(attr(animal, "age"))
  );
}

function getAgeYears(animal) {
  const rawYears = clean(attr(animal, "ageYears"));
  const years = Number(rawYears);
  if (rawYears !== null && Number.isFinite(years)) return years;

  const ageText = String(getAgeText(animal) || "").toLowerCase();
  const yearMatch = ageText.match(/(\d+)\s*year/);
  if (yearMatch) return Number(yearMatch[1]);

  if (ageText.includes("baby") || ageText.includes("puppy")) return 0;
  if (ageText.includes("month")) return 0;
  if (ageText.includes("young")) return 1;
  if (ageText.includes("adult")) return 3;
  if (ageText.includes("senior")) return 8;

  return null;
}

function normalizeSize(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("x-large") || text.includes("extra large")) return "X-Large";
  if (text.includes("large")) return "Large";
  if (text.includes("medium")) return "Medium";
  if (text.includes("small")) return "Small";
  return null;
}

function isPending(animal) {
  const values = [
    attr(animal, "name"),
    attr(animal, "status"),
    attr(animal, "statusName"),
    attr(animal, "statusesName"),
  ];

  return values.some((value) => String(value || "").toLowerCase().includes("pending"));
}

function isAvailable(animal) {
  const pending = isPending(animal);
  const statuses = [
    attr(animal, "status"),
    attr(animal, "statusName"),
    attr(animal, "statusesName"),
  ]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);

  return !pending && statuses.every((status) => status.includes("available"));
}

function toIsoDate(value) {
  const text = clean(value);
  if (!text) return null;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapAnimalToDogRow(animal, included) {
  const org = findOrgForAnimal(animal, included);
  const orgAttrs = org?.attributes || {};
  const externalId = String(animal.id);
  const name = clean(attr(animal, "name")) || "Unnamed Dog";
  const now = new Date().toISOString();
  const city = clean(attr(animal, "locationCity")) || clean(orgAttrs.city) || DACC_CITY;
  const state =
    normalizeState(attr(animal, "locationState")) ||
    normalizeState(orgAttrs.state) ||
    DACC_STATE;

  return {
    source: "rescuegroups",
    external_id: externalId,
    rescuegroups_id: externalId,
    rescuegroups_org_id: DACC_ORG_ID,
    name,
    breed: getBreed(animal),
    age_text: getAgeText(animal),
    age_years: getAgeYears(animal),
    gender: clean(attr(animal, "sex")) || clean(attr(animal, "gender")),
    size: normalizeSize(
      attr(animal, "sizeGroup") || attr(animal, "sizeCurrent") || attr(animal, "size")
    ),
    description:
      cleanText(attr(animal, "descriptionText")) ||
      cleanText(attr(animal, "descriptionHtml")) ||
      cleanText(attr(animal, "description")),
    photo_url: pickPhotoUrl(animal, included),
    adoptable: true,
    adoption_pending: false,
    availability_status: "available",
    source_url: DACC_ADOPT_URL,
    adoption_url: DACC_ADOPT_URL,
    shelter_name: clean(orgAttrs.name) || DACC_ORG_NAME,
    shelter_website: DACC_WEBSITE,
    placement_type: "Shelter",
    placement_city: city,
    placement_state: state,
    placement_location: city && state ? `${city}, ${state}` : null,
    source_updated_at: toIsoDate(attr(animal, "updatedDate")),
    last_checked_at: now,
    last_seen_at: now,
    urgency_level: "Standard",
  };
}

function buildRequestBody(pageNumber) {
  return {
    data: {
      filters: [
        {
          fieldName: "orgs.id",
          operation: "equals",
          criteria: DACC_ORG_ID,
        },
        {
          fieldName: "statuses.name",
          operation: "equals",
          criteria: "Available",
        },
      ],
      sort: [
        {
          fieldName: "animals.updatedDate",
          direction: "desc",
        },
      ],
      fields: {
        animals: [
          "name",
          "descriptionText",
          "descriptionHtml",
          "description",
          "breedString",
          "breedPrimary",
          "primaryBreed",
          "breed",
          "breeds",
          "sizeGroup",
          "sizeCurrent",
          "size",
          "sex",
          "gender",
          "ageString",
          "ageGroup",
          "age",
          "ageYears",
          "url",
          "webpageUrl",
          "animalUrl",
          "adoptionUrl",
          "link",
          "updatedDate",
          "status",
          "statusName",
          "statusesName",
          "pictureUrl",
          "imageUrl",
          "photoUrl",
          "pictureThumbnailUrl",
        ],
        pictures: [
          "urlSecureFullsize",
          "urlFullsize",
          "urlSecureLarge",
          "urlLarge",
          "large",
          "original",
          "medium",
          "small",
          "url",
        ],
        orgs: ["name", "city", "state", "url", "website", "email"],
      },
      include: ["pictures", "orgs"],
      page: {
        limit: PAGE_LIMIT,
        offset: (pageNumber - 1) * PAGE_LIMIT,
      },
    },
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPage(apiKey, pageNumber) {
  const response = await fetchWithTimeout(
    RESCUEGROUPS_API_URL,
    {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify(buildRequestBody(pageNumber)),
    },
    API_TIMEOUT_MS
  );

  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `RescueGroups returned non-JSON response. Status ${response.status}. Body: ${text.slice(0, 500)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `RescueGroups API error. Status ${response.status}. Response: ${JSON.stringify(json, null, 2)}`
    );
  }

  return {
    animals: Array.isArray(json?.data) ? json.data : [],
    included: Array.isArray(json?.included) ? json.included : [],
    meta: json?.meta || {},
  };
}

async function fetchAllDogs(apiKey) {
  const allAnimals = [];
  const allIncluded = [];

  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const { animals, included, meta } = await fetchPage(apiKey, pageNumber);

    allAnimals.push(...animals);
    allIncluded.push(...included);

    const totalPages = Number(meta.pages || 1);
    if (animals.length < PAGE_LIMIT || pageNumber >= totalPages) break;
  }

  return { animals: allAnimals, included: allIncluded };
}

function uniqueDogs(dogs) {
  const seen = new Set();
  const unique = [];

  for (const dog of dogs) {
    if (!dog.rescuegroups_id || seen.has(dog.rescuegroups_id)) continue;
    seen.add(dog.rescuegroups_id);
    unique.push(dog);
  }

  return unique;
}

function createSummary() {
  return {
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    withoutPhotos: [],
    withoutSourceUrls: [],
    skippedReasons: [],
  };
}

function validateDogRow(dog) {
  if (!dog.rescuegroups_id) return "missing RescueGroups ID";
  if (!dog.name || dog.name === "Unnamed Dog") return "missing name";
  if (!dog.photo_url) return "missing photo";
  return null;
}

async function getExistingDogsByRescueGroupsId(supabase, rescueGroupsIds) {
  if (rescueGroupsIds.length === 0) return new Map();

  const { data: byRescueGroupsId, error: rescueGroupsError } = await supabase
    .from("dogs")
    .select("id, rescuegroups_id, external_id")
    .in("rescuegroups_id", rescueGroupsIds);

  if (rescueGroupsError) {
    throw new Error(`Could not look up existing DACC dogs: ${rescueGroupsError.message}`);
  }

  const { data: byExternalId, error: externalIdError } = await supabase
    .from("dogs")
    .select("id, rescuegroups_id, external_id")
    .eq("source", "rescuegroups")
    .in("external_id", rescueGroupsIds);

  if (externalIdError) {
    throw new Error(`Could not look up existing DACC dogs by external_id: ${externalIdError.message}`);
  }

  const existing = new Map();

  for (const dog of byRescueGroupsId || []) {
    if (dog.rescuegroups_id) {
      existing.set(String(dog.rescuegroups_id), dog);
    }
  }

  for (const dog of byExternalId || []) {
    if (dog.external_id && !existing.has(String(dog.external_id))) {
      existing.set(String(dog.external_id), dog);
    }
  }

  return existing;
}

async function updateExistingDog(supabase, existingDog, dogRow) {
  const safeUpdateRow = { ...dogRow };
  delete safeUpdateRow.urgency_level;

  const { error } = await supabase
    .from("dogs")
    .update(safeUpdateRow)
    .eq("id", existingDog.id);

  if (error) {
    throw new Error(`Could not update ${dogRow.name}: ${error.message}`);
  }
}

async function insertNewDog(supabase, dogRow) {
  const { error } = await supabase.from("dogs").insert(dogRow);

  if (error) {
    throw new Error(`Could not insert ${dogRow.name}: ${error.message}`);
  }
}

function printSummary(summary, mode) {
  console.log("");
  console.log("============================================================");
  console.log(`${mode} - DACC RescueGroups import summary`);
  console.log("============================================================");
  console.log(`Fetched count: ${summary.fetched}`);
  console.log(`Inserted count: ${summary.inserted}`);
  console.log(`Updated count: ${summary.updated}`);
  console.log(`Skipped count: ${summary.skipped}`);
  console.log("");
  console.log(
    `Dogs without photos: ${
      summary.withoutPhotos.length
        ? summary.withoutPhotos.map((dog) => `${dog.name} (${dog.id})`).join(", ")
        : "none"
    }`
  );
  console.log(
    `Dogs without source URLs: ${
      summary.withoutSourceUrls.length
        ? summary.withoutSourceUrls.map((dog) => `${dog.name} (${dog.id})`).join(", ")
        : "none"
    }`
  );

  if (summary.skippedReasons.length) {
    console.log("");
    console.log("Skipped:");
    summary.skippedReasons.forEach((item) => {
      console.log(`- ${item.name} (${item.id || "no id"}): ${item.reason}`);
    });
  }

  console.log("============================================================");
}

async function main() {
  const rawApiKey = process.env.RESCUEGROUPS_API_KEY;
  const apiKey = normalizeApiKey(rawApiKey);

  if (!apiKey) {
    throw new Error("Missing RESCUEGROUPS_API_KEY in the environment or .env.local.");
  }

  console.log("Starting controlled DACC RescueGroups import.");
  console.log(`Mode: ${CONFIRMED ? "CONFIRMED WRITE" : "PREVIEW ONLY"}`);
  console.log(`RescueGroups org ID: ${DACC_ORG_ID}`);

  const { animals, included } = await fetchAllDogs(apiKey);
  const summary = createSummary();
  summary.fetched = animals.length;

  const mappedDogs = uniqueDogs(
    animals.filter(isAvailable).map((animal) => mapAnimalToDogRow(animal, included))
  );

  for (const dog of mappedDogs) {
    if (!dog.photo_url) {
      summary.withoutPhotos.push({ id: dog.rescuegroups_id, name: dog.name });
    }

    if (!dog.source_url) {
      summary.withoutSourceUrls.push({ id: dog.rescuegroups_id, name: dog.name });
    }
  }

  const candidateDogs = [];

  for (const dog of mappedDogs) {
    const skipReason = validateDogRow(dog);

    if (skipReason) {
      summary.skipped += 1;
      summary.skippedReasons.push({
        id: dog.rescuegroups_id,
        name: dog.name,
        reason: skipReason,
      });
      continue;
    }

    candidateDogs.push(dog);
  }

  if (!CONFIRMED) {
    summary.skipped += candidateDogs.length;
    summary.skippedReasons.push({
      id: "preview",
      name: "All valid DACC dogs",
      reason: "preview mode only; rerun with --confirm to write",
    });
    printSummary(summary, "PREVIEW ONLY");
    console.log("");
    console.log("No Supabase client was created. No database writes were attempted.");
    console.log("To write: npm run import:rescuegroups:dacc -- --confirm");
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL in the environment or .env.local.");
  }

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in the environment or .env.local.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const existingDogs = await getExistingDogsByRescueGroupsId(
    supabase,
    candidateDogs.map((dog) => dog.rescuegroups_id)
  );

  await attachShelterIdsToDogs(supabase, candidateDogs);

  for (const dog of candidateDogs) {
    const existingDog = existingDogs.get(dog.rescuegroups_id);

    try {
      if (existingDog) {
        await updateExistingDog(supabase, existingDog, dog);
        summary.updated += 1;
      } else {
        await insertNewDog(supabase, dog);
        summary.inserted += 1;
      }
    } catch (error) {
      summary.skipped += 1;
      summary.skippedReasons.push({
        id: dog.rescuegroups_id,
        name: dog.name,
        reason: error.message,
      });
    }
  }

  printSummary(summary, "CONFIRMED WRITE");
}

main().catch((error) => {
  console.error("");
  console.error("DACC RescueGroups import failed safely.");
  console.error(error?.message || error);
  process.exit(1);
});
