// sync-rescuegroups-dogs.cjs

console.log("SYNC FILE STARTED");

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");
const { RESCUES } = require("./rescuegroups-rescues.cjs");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESCUEGROUPS_API_KEY = process.env.RESCUEGROUPS_API_KEY;

const RESCUEGROUPS_API_URL =
  "https://api.rescuegroups.org/v5/public/animals/search/available/dogs";

const API_TIMEOUT_MS = 30000;
const PAGE_LIMIT = 100;
const MAX_PAGES = 5;

if (!SUPABASE_URL) {
  throw new Error("Missing VITE_SUPABASE_URL in .env.local");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

if (!RESCUEGROUPS_API_KEY) {
  throw new Error("Missing RESCUEGROUPS_API_KEY in .env.local");
}

console.log("Environment variables loaded.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function cleanText(value) {
  if (!value) return null;

  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSize(value) {
  if (!value) return null;

  const text = String(value).toLowerCase();

  if (text.includes("small")) return "Small";
  if (text.includes("medium")) return "Medium";
  if (text.includes("extra") || text.includes("x-large") || text.includes("xlarge")) {
    return "Extra Large";
  }
  if (text.includes("large")) return "Large";

  return null;
}

function normalizeEnergyLevel(value) {
  if (!value) return "Moderate";

  const text = String(value).toLowerCase();

  if (text.includes("high")) return "High";
  if (text.includes("low")) return "Low";
  if (text.includes("medium") || text.includes("moderate")) return "Moderate";

  return "Moderate";
}

function inferAdoptionPending(name) {
  const text = String(name || "").toLowerCase();
  return text.includes("pending");
}

function inferAdoptableFromName(name) {
  const text = String(name || "").toLowerCase();

  if (text.includes("adopted")) return false;

  return true;
}

function inferUrgencyFromName(name) {
  const text = String(name || "").toLowerCase();

  if (text.includes("adopted")) return "Adopted";

  return "Standard";
}

function getRelationshipData(animal, relationshipName) {
  return animal?.relationships?.[relationshipName]?.data || null;
}

function getRelationshipId(animal, relationshipName) {
  const data = getRelationshipData(animal, relationshipName);

  if (Array.isArray(data)) {
    return data[0]?.id || null;
  }

  return data?.id || null;
}

function findIncludedResource(included, type, id) {
  if (!Array.isArray(included) || !id) return null;

  return (
    included.find(
      (item) => item.type === type && String(item.id) === String(id)
    ) || null
  );
}

function getOrgForAnimal(animal, included) {
  const orgId =
    getRelationshipId(animal, "orgs") ||
    getRelationshipId(animal, "org") ||
    getRelationshipId(animal, "organization");

  if (!orgId) return null;

  return (
    findIncludedResource(included, "orgs", orgId) ||
    findIncludedResource(included, "organizations", orgId) ||
    null
  );
}

function getPictureForAnimal(animal, included) {
  const pictures = getRelationshipData(animal, "pictures");

  if (!Array.isArray(pictures) || pictures.length === 0) {
    return null;
  }

  const firstPictureId = pictures[0]?.id;

  return (
    findIncludedResource(included, "pictures", firstPictureId) ||
    findIncludedResource(included, "photos", firstPictureId) ||
    null
  );
}

function getPrimaryPhoto(animal, included) {
  const picture = getPictureForAnimal(animal, included);
  const attrs = picture?.attributes || {};

  return (
    attrs.large?.url ||
    attrs.original?.url ||
    attrs.medium?.url ||
    attrs.small?.url ||
    attrs.url ||
    null
  );
}

function getAdoptionUrl(animal) {
  const attrs = animal?.attributes || {};
  return attrs.url || attrs.webpageUrl || attrs.link || null;
}

function getBreed(attrs) {
  return (
    attrs.breedString ||
    attrs.breedPrimary ||
    attrs.primaryBreed ||
    attrs.breed ||
    attrs.breeds ||
    null
  );
}

function getAgeText(attrs) {
  return attrs.ageString || attrs.ageGroup || attrs.age || null;
}

function getAgeYears(attrs) {
  if (typeof attrs.ageYears === "number") {
    return attrs.ageYears;
  }

  const ageText = getAgeText(attrs);
  if (!ageText) return null;

  const text = String(ageText).toLowerCase();

  if (text.includes("baby") || text.includes("puppy")) return 0;
  if (text.includes("young")) return 1;
  if (text.includes("adult")) return 3;
  if (text.includes("senior")) return 8;

  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function rescueNameMatches(apiOrgName, targetRescueName) {
  if (!apiOrgName || !targetRescueName) return false;

  const apiName = normalizeName(apiOrgName);
  const targetName = normalizeName(targetRescueName);

  return apiName.includes(targetName) || targetName.includes(apiName);
}

function mapAnimalToDogRow(animal, included, rescue) {
  const attrs = animal.attributes || {};
  const org = getOrgForAnimal(animal, included);
  const orgAttrs = org?.attributes || {};

  const externalId = String(animal.id);
  const orgId = org
    ? String(org.id)
    : rescue.rescueGroupsOrgId
      ? String(rescue.rescueGroupsOrgId)
      : null;

  const name = attrs.name || "Unnamed Dog";
  const adoptionUrl = getAdoptionUrl(animal);
  const photoUrl = getPrimaryPhoto(animal, included);
  const now = new Date().toISOString();

  const city = attrs.locationCity || orgAttrs.city || rescue.city || null;
  const state = attrs.locationState || orgAttrs.state || rescue.state || "MI";

  const adoptableFromName = inferAdoptableFromName(name);
  const adoptionPendingFromName = inferAdoptionPending(name);

  return {
    source: "rescuegroups",
    external_id: externalId,

    rescuegroups_id: externalId,
    rescuegroups_org_id: orgId,

    name,
    breed: getBreed(attrs),
    age_text: getAgeText(attrs),
    age_years: getAgeYears(attrs),
    gender: attrs.sex || attrs.gender || null,

    size: normalizeSize(attrs.sizeGroup || attrs.sizeCurrent || attrs.size),
    energy_level: normalizeEnergyLevel(attrs.energyLevel || attrs.activityLevel),
    activity_level: attrs.activityLevel || null,

    description:
      cleanText(attrs.descriptionText) ||
      cleanText(attrs.descriptionHtml) ||
      cleanText(attrs.description) ||
      `${name} is available through ${rescue.name}.`,

    photo_url: photoUrl,

    adoptable: adoptableFromName,
    adoption_pending: adoptionPendingFromName,
    urgency_level: inferUrgencyFromName(name),

    source_url: adoptionUrl,
    adoption_url: adoptionUrl,

    shelter_name: orgAttrs.name || rescue.name,
    shelter_website: orgAttrs.url || orgAttrs.website || null,
    shelter_id: rescue.supabaseShelterId,

    placement_type: "Shelter",
    placement_city: city,
    placement_state: state,
    placement_location: city && state ? `${city}, ${state}` : state,

    availability_status: adoptableFromName ? "available" : "unavailable",
    unavailable_reason: adoptableFromName ? null : "Name indicates adopted",

    imported_status: "visible",

    source_updated_at: attrs.updatedDate
      ? new Date(attrs.updatedDate).toISOString()
      : null,

    last_checked_at: now,
    last_seen_at: now,
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildRequestBody(rescue, pageNumber) {
  return {
    data: {
      filters: [
        {
          fieldName: "orgs.name",
          operation: "contains",
          criteria: rescue.name,
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
          "sex",
          "ageString",
          "ageGroup",
          "ageYears",
          "url",
          "updatedDate",
        ],
        pictures: ["large", "original", "medium", "small", "url"],
        orgs: ["name", "city", "state", "url", "website"],
      },
      include: ["pictures", "orgs"],
      page: {
        limit: PAGE_LIMIT,
        offset: (pageNumber - 1) * PAGE_LIMIT,
      },
    },
  };
}

async function fetchOnePageForRescue(rescue, pageNumber) {
  console.log(`Calling RescueGroups API page ${pageNumber}...`);

  const response = await fetchWithTimeout(
    RESCUEGROUPS_API_URL,
    {
      method: "POST",
      headers: {
        Authorization: RESCUEGROUPS_API_KEY,
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify(buildRequestBody(rescue, pageNumber)),
    },
    API_TIMEOUT_MS
  );

  console.log(`RescueGroups response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `RescueGroups API error for ${rescue.name}: ${response.status} ${errorText}`
    );
  }

  const json = await response.json();

  const animals = Array.isArray(json.data) ? json.data : [];
  const included = Array.isArray(json.included) ? json.included : [];

  return { animals, included };
}

async function fetchDogsForRescue(rescue) {
  console.log("");
  console.log(`Fetching dogs for: ${rescue.name}`);

  const allMappedDogs = [];
  const seenIds = new Set();

  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const { animals, included } = await fetchOnePageForRescue(rescue, pageNumber);

    console.log(`Raw API animals returned on page ${pageNumber}: ${animals.length}`);

    const mappedDogsForPage = animals
      .map((animal) => mapAnimalToDogRow(animal, included, rescue))
      .filter((dog) => {
        if (!dog.name || !dog.photo_url) return false;
        return rescueNameMatches(dog.shelter_name, rescue.name);
      });

    for (const dog of mappedDogsForPage) {
      if (!seenIds.has(dog.rescuegroups_id)) {
        seenIds.add(dog.rescuegroups_id);
        allMappedDogs.push(dog);
      }
    }

    if (animals.length < PAGE_LIMIT) {
      break;
    }
  }

  console.log(
    `Usable dogs after filtering for ${rescue.name}: ${allMappedDogs.length}`
  );

  if (allMappedDogs.length > 0) {
    console.log(
      "Dogs found:",
      allMappedDogs.map((dog) => dog.name).join(", ")
    );
  }

  return allMappedDogs;
}

async function upsertDogs(dogs) {
  if (dogs.length === 0) {
    console.log("No dogs to insert/update.");
    return;
  }

  console.log(`Inserting/updating ${dogs.length} dogs in Supabase...`);

  const { error } = await supabase.from("dogs").upsert(dogs, {
    onConflict: "rescuegroups_id",
  });

  if (error) {
    throw new Error(`Supabase upsert error: ${error.message}`);
  }

  console.log(`Upsert complete: ${dogs.length} dogs.`);
}

async function markMissingDogsUnavailableForRescue(rescue, seenRescueGroupsIds) {
  if (seenRescueGroupsIds.length === 0) {
    console.log(
      `No dogs seen for ${rescue.name}. Skipping unavailable update so we do not accidentally hide dogs.`
    );
    return;
  }

  console.log(`Checking for dogs no longer returned by ${rescue.name}...`);

  const quotedIds = seenRescueGroupsIds.map((id) => `"${id}"`).join(",");

  let query = supabase
    .from("dogs")
    .update({
      adoptable: false,
      availability_status: "unavailable",
      unavailable_reason: "No longer returned by RescueGroups API",
      last_checked_at: new Date().toISOString(),
    })
    .eq("shelter_id", rescue.supabaseShelterId)
    .eq("adoptable", true)
    .not("rescuegroups_id", "in", `(${quotedIds})`);

  const { error } = await query;

  if (error) {
    throw new Error(`Supabase unavailable update error: ${error.message}`);
  }

  console.log(`Availability check complete for ${rescue.name}.`);
}

async function main() {
  console.log("Starting Hooman Finder RescueGroups sync...");

  const enabledRescues = RESCUES.filter((rescue) => rescue.enabled !== false);

  console.log(`Enabled rescues: ${enabledRescues.length}`);

  let totalUpserted = 0;

  for (const rescue of enabledRescues) {
    try {
      if (!rescue.supabaseShelterId) {
        console.log(`Skipping ${rescue.name}: missing supabaseShelterId.`);
        continue;
      }

      const dogs = await fetchDogsForRescue(rescue);

      await upsertDogs(dogs);

      const seenRescueGroupsIds = dogs.map((dog) => dog.rescuegroups_id);

      await markMissingDogsUnavailableForRescue(rescue, seenRescueGroupsIds);

      totalUpserted += dogs.length;
    } catch (error) {
      console.error(`Error syncing ${rescue.name}: ${error.message}`);
    }
  }

  console.log("");
  console.log(`Sync complete. Total dogs inserted/updated: ${totalUpserted}`);
}

main().catch((error) => {
  console.error("Fatal sync error:", error);
  process.exit(1);
});