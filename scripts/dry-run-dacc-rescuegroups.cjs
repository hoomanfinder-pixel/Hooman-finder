/* eslint-disable no-console */

/**
 * DRY RUN ONLY: Preview Detroit Animal Care and Control dogs from RescueGroups.
 *
 * This script intentionally does not import dogs, connect to Supabase, run SQL,
 * or modify any database records. It only reads public RescueGroups API data and
 * prints a preview of fields that would map into the existing dogs table.
 */

require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { DACC_ADOPT_URL, DACC_WEBSITE } = require("./rescuegroups-shelter-utils.cjs");

const RESCUEGROUPS_API_URL =
  "https://api.rescuegroups.org/v5/public/animals/search/available/dogs";

const DACC_ORG_ID = "8883";
const DACC_ORG_NAME = "Detroit Animal Care and Control";
const PAGE_LIMIT = 100;
const MAX_PAGES = 5;
const API_TIMEOUT_MS = 30000;

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
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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

function getPictureCount(animal, included) {
  const pictures = findPicturesForAnimal(animal, included);
  if (pictures.length) return pictures.length;
  return pickPhotoUrl(animal, included) ? 1 : 0;
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
  return clean(attr(animal, "ageString")) || clean(attr(animal, "ageGroup")) || clean(attr(animal, "age"));
}

function parseAgeYearsFromText(ageText) {
  const text = String(ageText || "").toLowerCase().trim();
  if (!text) return null;

  // Unit-aware: a bare digit in age text (e.g. "9 Months") must never be
  // read as whole years. Each unit is matched explicitly and converted.
  const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*year/);
  const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*month/);
  const weekMatch = text.match(/(\d+(?:\.\d+)?)\s*week/);
  const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*day/);

  if (yearMatch || monthMatch || weekMatch || dayMatch) {
    const years = Number(yearMatch?.[1] || 0);
    const months = Number(monthMatch?.[1] || 0);
    const weeks = Number(weekMatch?.[1] || 0);
    const days = Number(dayMatch?.[1] || 0);
    return Math.round((years + months / 12 + weeks / 52 + days / 365) * 100) / 100;
  }

  if (text.includes("baby") || text.includes("puppy")) return 0;
  if (text.includes("young")) return 1;
  if (text.includes("adult")) return 3;
  if (text.includes("senior")) return 8;

  return null;
}

function getAgeYears(animal) {
  // Prefer a unit-aware parse of the human-readable age text: RescueGroups'
  // structured ageYears attribute has been observed stale/wrong even when
  // present, so it is only used when the text can't be parsed at all.
  const parsed = parseAgeYearsFromText(getAgeText(animal));
  if (parsed !== null) return parsed;

  const rawYears = clean(attr(animal, "ageYears"));
  const years = Number(rawYears);
  if (rawYears !== null && Number.isFinite(years)) return years;

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

function mapAnimalPreview(animal, included) {
  const org = findOrgForAnimal(animal, included);
  const orgAttrs = org?.attributes || {};
  const name = clean(attr(animal, "name")) || "Unnamed Dog";
  const photoUrl = pickPhotoUrl(animal, included);
  const adoptionUrl = DACC_ADOPT_URL;
  const updatedDate = clean(attr(animal, "updatedDate"));
  const nowPlaceholder = "<dry-run timestamp>";

  return {
    summary: {
      rescuegroups_id: String(animal.id),
      name,
      has_photo: Boolean(photoUrl),
      picture_count: getPictureCount(animal, included),
      has_source_url: Boolean(adoptionUrl),
      age_text: getAgeText(animal),
      breed: getBreed(animal),
      gender: clean(attr(animal, "sex")) || clean(attr(animal, "gender")),
      status:
        clean(attr(animal, "status")) ||
        clean(attr(animal, "statusName")) ||
        clean(attr(animal, "statusesName")) ||
        "Available",
      source_url: adoptionUrl,
    },
    wouldMapToDogsFields: {
      source: "rescuegroups",
      external_id: String(animal.id),
      rescuegroups_id: String(animal.id),
      rescuegroups_org_id: String(org?.id || DACC_ORG_ID),
      name,
      breed: getBreed(animal),
      age_text: getAgeText(animal),
      age_years: getAgeYears(animal),
      gender: clean(attr(animal, "sex")) || clean(attr(animal, "gender")),
      size: normalizeSize(attr(animal, "sizeGroup") || attr(animal, "sizeCurrent") || attr(animal, "size")),
      description:
        cleanText(attr(animal, "descriptionText")) ||
        cleanText(attr(animal, "descriptionHtml")) ||
        cleanText(attr(animal, "description")),
      photo_url: photoUrl,
      adoptable: true,
      adoption_pending: false,
      urgency_level: "Standard",
      availability_status: "available",
      source_url: adoptionUrl,
      adoption_url: adoptionUrl,
      shelter_name: clean(orgAttrs.name) || DACC_ORG_NAME,
      shelter_website: DACC_WEBSITE,
      placement_type: "Shelter",
      placement_city: clean(attr(animal, "locationCity")) || clean(orgAttrs.city) || "Detroit",
      placement_state: clean(attr(animal, "locationState")) || clean(orgAttrs.state) || "MI",
      source_updated_at: updatedDate ? new Date(updatedDate).toISOString() : null,
      last_checked_at: nowPlaceholder,
      last_seen_at: nowPlaceholder,
    },
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
          "breedString",
          "breedPrimary",
          "sizeGroup",
          "sizeCurrent",
          "sex",
          "gender",
          "ageString",
          "ageGroup",
          "ageYears",
          "url",
          "webpageUrl",
          "updatedDate",
          "status",
          "statusName",
          "pictureUrl",
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

  let json = null;
  const text = await response.text();

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

function printPreview({ animals, included, apiKeyWasNormalized }) {
  const org =
    included.find(
      (item) => item.type === "orgs" && String(item.id) === DACC_ORG_ID
    ) || null;
  const orgName = clean(org?.attributes?.name) || DACC_ORG_NAME;

  const mapped = animals.map((animal) => mapAnimalPreview(animal, included));
  const firstTen = mapped.slice(0, 10);

  console.log("============================================================");
  console.log("DRY RUN ONLY - Detroit Animal Care and Control RescueGroups");
  console.log("No Supabase client is created. No database writes are made.");
  console.log("============================================================");
  console.log("");
  console.log(`Organization: ${orgName}`);
  console.log(`RescueGroups org ID: ${DACC_ORG_ID}`);
  console.log(`Available dogs returned: ${animals.length}`);
  console.log(`API key normalized in memory: ${apiKeyWasNormalized ? "yes" : "no"}`);
  console.log("");

  console.log("First 10 dogs:");
  if (!firstTen.length) {
    console.log("  No dogs returned.");
  }

  firstTen.forEach(({ summary }, index) => {
    console.log(
      `  ${index + 1}. ${summary.name} ` +
        `(RG ${summary.rescuegroups_id}) | ` +
        `photo: ${summary.has_photo ? `yes (${summary.picture_count})` : "no"} | ` +
        `source URL: ${summary.has_source_url ? "yes" : "no"} | ` +
        `age: ${summary.age_text || "unknown"} | ` +
        `breed: ${summary.breed || "unknown"} | ` +
        `gender: ${summary.gender || "unknown"} | ` +
        `status: ${summary.status || "unknown"}`
    );
  });

  console.log("");
  console.log("Fields that would map into public.dogs for the first 10 dogs:");
  console.log(JSON.stringify(firstTen.map((item) => item.wouldMapToDogsFields), null, 2));
  console.log("");
  console.log("DRY RUN ONLY complete. No dogs were imported or modified.");
}

async function main() {
  const rawApiKey = process.env.RESCUEGROUPS_API_KEY;
  const apiKey = normalizeApiKey(rawApiKey);

  if (!apiKey) {
    throw new Error(
      "Missing RESCUEGROUPS_API_KEY. Add it to the environment or .env.local before running this dry run."
    );
  }

  const apiKeyWasNormalized = rawApiKey !== apiKey;
  const result = await fetchAllDogs(apiKey);

  printPreview({ ...result, apiKeyWasNormalized });
}

main().catch((error) => {
  console.error("");
  console.error("DRY RUN ONLY failed safely.");
  console.error(error?.message || error);
  console.error("No Supabase writes were attempted.");
  process.exit(1);
});
