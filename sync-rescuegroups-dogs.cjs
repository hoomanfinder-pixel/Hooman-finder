// sync-rescuegroups-dogs.cjs

console.log("SYNC FILE STARTED");

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");
const { RESCUES } = require("./rescuegroups-rescues.cjs");
const {
  DACC_ADOPT_URL,
  DACC_RESCUEGROUPS_ORG_ID,
  DACC_WEBSITE,
  attachShelterIdsToDogs,
} = require("./scripts/rescuegroups-shelter-utils.cjs");

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
  if (!value) return null;

  const text = String(value).trim().toLowerCase();

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

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
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

function getPicturesForAnimal(animal, included) {
  const pictureRefs =
    getRelationshipData(animal, "pictures") ||
    getRelationshipData(animal, "picture") ||
    getRelationshipData(animal, "photos") ||
    getRelationshipData(animal, "images") ||
    [];

  const refs = Array.isArray(pictureRefs) ? pictureRefs : [pictureRefs];

  return refs
    .map((ref, relationshipIndex) => {
      const picture =
        findIncludedResource(included, "pictures", ref?.id) ||
        findIncludedResource(included, "photos", ref?.id) ||
        null;

      return picture ? { picture, relationshipIndex } : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aOrder = hasSourceValue(a.picture?.attributes || {}, "order")
        ? Number(a.picture.attributes.order)
        : Number.NaN;
      const bOrder = hasSourceValue(b.picture?.attributes || {}, "order")
        ? Number(b.picture.attributes.order)
        : Number.NaN;
      const safeAOrder = Number.isFinite(aOrder) ? aOrder : a.relationshipIndex + 1;
      const safeBOrder = Number.isFinite(bOrder) ? bOrder : b.relationshipIndex + 1;
      return safeAOrder - safeBOrder || a.relationshipIndex - b.relationshipIndex;
    })
    .map(({ picture }) => picture);
}

function getPictureUrl(picture) {
  const attrs = picture?.attributes || {};

  return (
    clean(attrs.urlSecureFullsize) ||
    clean(attrs.urlFullsize) ||
    clean(attrs.urlSecureLarge) ||
    clean(attrs.urlLarge) ||
    clean(attrs.large?.url || attrs.large) ||
    clean(attrs.original?.url || attrs.original) ||
    clean(attrs.medium?.url || attrs.medium) ||
    clean(attrs.small?.url || attrs.small) ||
    clean(attrs.url)
  );
}

function getPhotoUrls(animal, included) {
  const urls = getPicturesForAnimal(animal, included)
    .map(getPictureUrl)
    .filter(Boolean);

  if (urls.length === 0) {
    const fallbackUrl =
      clean(animal?.attributes?.pictureUrl) ||
      clean(animal?.attributes?.imageUrl) ||
      clean(animal?.attributes?.photoUrl) ||
      clean(animal?.attributes?.pictureThumbnailUrl);

    if (fallbackUrl) urls.push(fallbackUrl);
  }

  return [...new Set(urls)];
}

function hasSourceValue(attrs, key) {
  if (!Object.prototype.hasOwnProperty.call(attrs, key)) return false;
  const value = attrs[key];
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

function normalizeQualities(value) {
  const values = Array.isArray(value) ? value : String(value).split(/[,;|]/);
  const cleaned = values.map(clean).filter(Boolean);
  return [...new Set(cleaned)];
}

function addSourceField(
  row,
  attrs,
  apiField,
  databaseField,
  normalize = (value) => value
) {
  if (!hasSourceValue(attrs, apiField)) return;
  const value = normalize(attrs[apiField]);
  if (value === null || value === undefined) return;
  if (typeof value === "string" && value.trim() === "") return;
  if (Array.isArray(value) && value.length === 0) return;
  row[databaseField] = value;
}

function getAdoptionUrl(animal) {
  const attrs = animal?.attributes || {};
  return (
    attrs.url ||
    attrs.webpageUrl ||
    attrs.animalUrl ||
    attrs.adoptionUrl ||
    attrs.link ||
    (animal?.id
      ? `https://www.rescuegroups.org/animals/detail?AnimalID=${animal.id}`
      : null)
  );
}

function getPublicListingUrl(animal, orgId) {
  if (String(orgId || "") === DACC_RESCUEGROUPS_ORG_ID) {
    return DACC_ADOPT_URL;
  }

  return getAdoptionUrl(animal);
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

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function rescueMatchesDog(dog, rescue) {
  if (rescue.rescueGroupsOrgId) {
    return String(dog.rescuegroups_org_id || "") === String(rescue.rescueGroupsOrgId);
  }

  return rescueNameMatches(dog.shelter_name, rescue.name);
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
  const adoptionUrl = getPublicListingUrl(animal, orgId);
  const photoUrls = getPhotoUrls(animal, included);
  const photoUrl = photoUrls[0] || null;
  const now = new Date().toISOString();

  const city = attrs.locationCity || orgAttrs.city || rescue.city || null;
  const state = attrs.locationState || orgAttrs.state || rescue.state || "MI";

  const adoptableFromName = inferAdoptableFromName(name);
  const adoptionPending = hasSourceValue(attrs, "isAdoptionPending")
    ? attrs.isAdoptionPending === true
    : inferAdoptionPending(name);

  const row = {
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
    description:
      cleanText(attrs.descriptionText) ||
      cleanText(attrs.descriptionHtml) ||
      cleanText(attrs.description),

    photo_url: photoUrl,
    photo_urls: photoUrls,

    adoptable: adoptableFromName,
    adoption_pending: adoptionPending,
    urgency_level: inferUrgencyFromName(name),

    source_url: adoptionUrl,
    adoption_url: adoptionUrl,

    shelter_name: orgAttrs.name || rescue.name,
    shelter_website:
      String(orgId || "") === DACC_RESCUEGROUPS_ORG_ID
        ? DACC_WEBSITE
        : orgAttrs.url || orgAttrs.website || null,
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

  addSourceField(row, attrs, "isDogsOk", "good_with_dogs");
  addSourceField(row, attrs, "isCatsOk", "good_with_cats");
  addSourceField(row, attrs, "isKidsOk", "good_with_kids");
  addSourceField(row, attrs, "isHousetrained", "potty_trained");
  addSourceField(row, attrs, "energyLevel", "energy_level", normalizeEnergyLevel);
  addSourceField(row, attrs, "activityLevel", "activity_level", normalizeActivityLevel);
  addSourceField(row, attrs, "groomingNeeds", "grooming_level", normalizeGroomingLevel);
  addSourceField(row, attrs, "sheddingLevel", "shedding_level", normalizeSheddingLevel);
  addSourceField(row, attrs, "vocalLevel", "barking_level", normalizeBarkingLevel);
  addSourceField(row, attrs, "qualities", "qualities", normalizeQualities);
  addSourceField(row, attrs, "exerciseNeeds", "exercise_needs", clean);
  addSourceField(row, attrs, "obedienceTraining", "obedience_training", clean);
  addSourceField(row, attrs, "ownerExperience", "owner_experience", clean);
  addSourceField(row, attrs, "isYardRequired", "yard_required");
  addSourceField(row, attrs, "fenceNeeds", "fence_needs", clean);
  addSourceField(row, attrs, "adultSexesOk", "adult_sexes_ok", clean);
  addSourceField(row, attrs, "newPeopleReaction", "new_people_reaction", clean);

  return row;
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
  const orgFilter = rescue.rescueGroupsOrgId
    ? {
        fieldName: "orgs.id",
        operation: "equals",
        criteria: String(rescue.rescueGroupsOrgId),
      }
    : {
        fieldName: "orgs.name",
        operation: "contains",
        criteria: rescue.name,
      };

  return {
    data: {
      filters: [orgFilter],
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
        return rescueMatchesDog(dog, rescue);
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
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  console.log(`Inserting/updating ${dogs.length} dogs in Supabase...`);

  const rescueGroupsIds = dogs.map((dog) => dog.rescuegroups_id);
  const { data: existingDogs, error: findError } = await supabase
    .from("dogs")
    .select("id, rescuegroups_id, external_id, description")
    .in("rescuegroups_id", rescueGroupsIds);

  if (findError) {
    throw new Error(`Supabase existing dog lookup error: ${findError.message}`);
  }

  const { data: existingByExternalId, error: externalIdFindError } = await supabase
    .from("dogs")
    .select("id, rescuegroups_id, external_id, description")
    .eq("source", "rescuegroups")
    .in("external_id", rescueGroupsIds);

  if (externalIdFindError) {
    throw new Error(
      `Supabase existing dog external_id lookup error: ${externalIdFindError.message}`
    );
  }

  const existingByRescueGroupsId = new Map(
    (existingDogs || []).map((dog) => [String(dog.rescuegroups_id), dog])
  );

  for (const dog of existingByExternalId || []) {
    if (dog.external_id && !existingByRescueGroupsId.has(String(dog.external_id))) {
      existingByRescueGroupsId.set(String(dog.external_id), dog);
    }
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const dog of dogs) {
    const existingDog = existingByRescueGroupsId.get(String(dog.rescuegroups_id));

    try {
      if (existingDog) {
        const updateRow = { ...dog };
        if (updateRow.energy_level === null || updateRow.energy_level === undefined) {
          delete updateRow.energy_level;
        }
        delete updateRow.urgency_level;
        delete updateRow.imported_status;

        if (hasText(existingDog.description)) {
          delete updateRow.description;
        }

        if (!updateRow.shelter_id) {
          delete updateRow.shelter_id;
        }

        const { error } = await supabase
          .from("dogs")
          .update(updateRow)
          .eq("id", existingDog.id);

        if (error) {
          throw error;
        }

        updated += 1;
      } else {
        const { error } = await supabase.from("dogs").insert(dog);

        if (error) {
          throw error;
        }

        inserted += 1;
      }
    } catch (error) {
      skipped += 1;
      console.error(`Could not sync ${dog.name}: ${error.message}`);
    }
  }

  console.log(
    `Upsert complete. Inserted ${inserted}. Updated ${updated}. Skipped ${skipped}.`
  );

  return { inserted, updated, skipped };
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
    .eq("source", "rescuegroups")
    .eq("adoptable", true)
    .not("rescuegroups_id", "in", `(${quotedIds})`);

  if (rescue.supabaseShelterId) {
    query = query.eq("shelter_id", rescue.supabaseShelterId);
  } else if (rescue.rescueGroupsOrgId) {
    query = query.eq("rescuegroups_org_id", String(rescue.rescueGroupsOrgId));
  } else {
    console.log(
      `Skipping unavailable update for ${rescue.name}: missing shelter and RescueGroups org IDs.`
    );
    return;
  }

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
      if (!rescue.supabaseShelterId && !rescue.rescueGroupsOrgId) {
        console.log(`Skipping ${rescue.name}: missing shelter and RescueGroups org IDs.`);
        continue;
      }

      const dogs = await fetchDogsForRescue(rescue);

      await attachShelterIdsToDogs(supabase, dogs);

      const syncResult = await upsertDogs(dogs);

      const seenRescueGroupsIds = dogs.map((dog) => dog.rescuegroups_id);

      await markMissingDogsUnavailableForRescue(rescue, seenRescueGroupsIds);

      totalUpserted += syncResult.inserted + syncResult.updated;
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
