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
const { resolveDogAvailability } = require("./dog-availability.cjs");
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

function hasSourceValue(item, key) {
  const attrs = item?.attributes || {};
  if (!Object.prototype.hasOwnProperty.call(attrs, key)) return false;
  const value = attrs[key];
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
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
    .map((ref, relationshipIndex) => {
      const picture =
        findIncluded(included, "pictures", ref?.id) ||
        findIncluded(included, "photos", ref?.id) ||
        null;

      return picture ? { picture, relationshipIndex } : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aOrder = hasSourceValue(a.picture, "order")
        ? Number(attr(a.picture, "order"))
        : Number.NaN;
      const bOrder = hasSourceValue(b.picture, "order")
        ? Number(attr(b.picture, "order"))
        : Number.NaN;
      const safeAOrder = Number.isFinite(aOrder) ? aOrder : a.relationshipIndex + 1;
      const safeBOrder = Number.isFinite(bOrder) ? bOrder : b.relationshipIndex + 1;
      return safeAOrder - safeBOrder || a.relationshipIndex - b.relationshipIndex;
    })
    .map(({ picture }) => picture);
}

function getPictureUrl(picture) {
  return (
    clean(attr(picture, "urlSecureFullsize")) ||
    clean(attr(picture, "urlFullsize")) ||
    clean(attr(picture, "urlSecureLarge")) ||
    clean(attr(picture, "urlLarge")) ||
    clean(attr(picture, "large")?.url || attr(picture, "large")) ||
    clean(attr(picture, "original")?.url || attr(picture, "original")) ||
    clean(attr(picture, "medium")?.url || attr(picture, "medium")) ||
    clean(attr(picture, "small")?.url || attr(picture, "small")) ||
    clean(attr(picture, "url"))
  );
}

function getPhotoUrls(animal, included) {
  const urls = findPicturesForAnimal(animal, included).map(getPictureUrl).filter(Boolean);

  if (urls.length === 0) {
    const fallbackUrl =
      clean(attr(animal, "pictureUrl")) ||
      clean(attr(animal, "imageUrl")) ||
      clean(attr(animal, "photoUrl")) ||
      clean(attr(animal, "pictureThumbnailUrl"));

    if (fallbackUrl) urls.push(fallbackUrl);
  }

  return [...new Set(urls)];
}

function normalizeEnergyLevel(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "high") return "High";
  if (text === "low") return "Low";
  if (text === "medium" || text === "moderate") return "Moderate";
  return null;
}

function normalizeActivityLevel(value) {
  const text = String(value || "").trim().toLowerCase();
  const allowedValues = {
    "slightly active": "Slightly Active",
    "moderately active": "Moderately Active",
    "highly active": "Highly Active",
  };
  return allowedValues[text] || null;
}

function normalizeGroomingLevel(value) {
  const text = String(value || "").trim().toLowerCase();
  const allowedValues = {
    "not required": "low",
    none: "low",
    low: "low",
    moderate: "moderate",
    medium: "moderate",
    high: "high",
  };
  return allowedValues[text] || null;
}

function normalizeSheddingLevel(value) {
  const text = String(value || "").trim().toLowerCase();
  const allowedValues = {
    none: "minimal",
    minimal: "minimal",
    low: "minimal",
    moderate: "moderate",
    medium: "moderate",
    high: "heavy",
    heavy: "heavy",
  };
  return allowedValues[text] || null;
}

function normalizeBarkingLevel(value) {
  const text = String(value || "").trim().toLowerCase();
  const allowedValues = {
    quiet: "Quiet",
    low: "Quiet",
    some: "Some",
    moderate: "Some",
  };
  return allowedValues[text] || null;
}

function normalizeQualities(value) {
  const values = Array.isArray(value) ? value : String(value).split(/[,;|]/);
  return [...new Set(values.map(clean).filter(Boolean))];
}

function addSourceField(
  row,
  animal,
  apiField,
  databaseField,
  normalize = (value) => value
) {
  if (!hasSourceValue(animal, apiField)) return;
  const value = normalize(animal.attributes[apiField]);
  if (value === null || value === undefined) return;
  if (typeof value === "string" && value.trim() === "") return;
  if (Array.isArray(value) && value.length === 0) return;
  row[databaseField] = value;
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

function isPending(animal) {
  if (hasSourceValue(animal, "isAdoptionPending")) {
    return attr(animal, "isAdoptionPending") === true;
  }

  const values = [
    attr(animal, "name"),
    attr(animal, "status"),
    attr(animal, "statusName"),
    attr(animal, "statusesName"),
  ];

  return values.some((value) => String(value || "").toLowerCase().includes("pending"));
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
  const photoUrls = getPhotoUrls(animal, included);
  const description =
    cleanText(attr(animal, "descriptionText")) ||
    cleanText(attr(animal, "descriptionHtml")) ||
    cleanText(attr(animal, "description"));
  const sourceStatus = [
    attr(animal, "status"),
    attr(animal, "statusName"),
    attr(animal, "statusesName"),
  ]
    .filter(Boolean)
    .join(" ");
  const availability = resolveDogAvailability({
    dog: { name, description },
    isAdoptionPending: isPending(animal),
    isCourtesyListing: attr(animal, "isCourtesyListing"),
    sourceStatus,
  });

  const row = {
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
    description,
    photo_url: photoUrls[0] || null,
    photo_urls: photoUrls,
    adoptable: availability.adoptable,
    adoption_pending: availability.adoptionPending,
    availability_status: availability.availabilityStatus,
    unavailable_reason: availability.unavailableReason,
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
    urgency_level: availability.urgencyLevel,
  };

  addSourceField(row, animal, "isDogsOk", "good_with_dogs");
  addSourceField(row, animal, "isCatsOk", "good_with_cats");
  addSourceField(row, animal, "isKidsOk", "good_with_kids");
  addSourceField(row, animal, "isHousetrained", "potty_trained");
  addSourceField(row, animal, "energyLevel", "energy_level", normalizeEnergyLevel);
  addSourceField(row, animal, "activityLevel", "activity_level", normalizeActivityLevel);
  addSourceField(row, animal, "groomingNeeds", "grooming_level", normalizeGroomingLevel);
  addSourceField(row, animal, "sheddingLevel", "shedding_level", normalizeSheddingLevel);
  addSourceField(row, animal, "vocalLevel", "barking_level", normalizeBarkingLevel);
  addSourceField(row, animal, "qualities", "qualities", normalizeQualities);
  addSourceField(row, animal, "exerciseNeeds", "exercise_needs", clean);
  addSourceField(row, animal, "obedienceTraining", "obedience_training", clean);
  addSourceField(row, animal, "ownerExperience", "owner_experience", clean);
  addSourceField(row, animal, "isYardRequired", "yard_required");
  addSourceField(row, animal, "fenceNeeds", "fence_needs", clean);
  addSourceField(row, animal, "adultSexesOk", "adult_sexes_ok", clean);
  addSourceField(row, animal, "newPeopleReaction", "new_people_reaction", clean);

  return row;
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
          "isDogsOk",
          "isCatsOk",
          "isKidsOk",
          "adultSexesOk",
          "isHousetrained",
          "activityLevel",
          "energyLevel",
          "exerciseNeeds",
          "obedienceTraining",
          "groomingNeeds",
          "sheddingLevel",
          "vocalLevel",
          "ownerExperience",
          "isYardRequired",
          "fenceNeeds",
          "newPeopleReaction",
          "qualities",
          "pictureCount",
          "isAdoptionPending",
          "isCourtesyListing",
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
          "order",
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
