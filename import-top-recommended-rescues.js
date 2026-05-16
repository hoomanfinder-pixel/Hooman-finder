// import-top-recommended-rescues.js
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESCUEGROUPS_API_KEY = process.env.RESCUEGROUPS_API_KEY;

const RESCUEGROUPS_BASE_URL = "https://api.rescuegroups.org/v5/public";

const TARGET_RESCUES = [
  {
    orgId: "6454",
    name: "Project Hope Animal Rescue",
    city: "Coldwater",
    state: "MI",
    website: "http://projecthoperescue.org",
    applyUrl: "http://projecthoperescue.org",
  },
  {
    orgId: "6843",
    name: "Saving Tails Animal Rescue",
    city: "Frankenmuth",
    state: "MI",
    website: "http://savingtailsanimalrescue.org",
    applyUrl: "http://savingtailsanimalrescue.org",
  },
  {
    orgId: "6172",
    name: "Canine Companions Rescue Center",
    city: "Clarkston",
    state: "MI",
    website: "http://www.ccrcdogs.com",
    applyUrl: "http://www.ccrcdogs.com",
  },
  {
    orgId: "5470",
    name: "LUVUMALL ANIMAL RESCUE",
    city: "Marine City",
    state: "MI",
    website: "http://www.luvumallanimalrescue.com",
    applyUrl: "http://www.luvumallanimalrescue.com",
  },
];

const IMPORT_LIMIT_PER_RESCUE = 75;
const DEFAULT_PLACEMENT_TYPE = "Shelter";

if (!SUPABASE_URL) {
  console.error("Missing VITE_SUPABASE_URL in .env.local");
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

if (!RESCUEGROUPS_API_KEY) {
  console.error("Missing RESCUEGROUPS_API_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeState(value) {
  const text = clean(value);
  return text ? text.toUpperCase() : null;
}

function attr(item, key) {
  return item?.attributes?.[key] ?? null;
}

function relationshipId(item, name) {
  const rel = item?.relationships?.[name]?.data;
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0]?.id || null;
  return rel?.id || null;
}

function findIncluded(included, type, id) {
  if (!id) return null;

  return (
    included.find(
      (item) => item.type === type && String(item.id) === String(id)
    ) || null
  );
}

function findOrgForAnimal(animal, included) {
  const possibleRelationshipNames = [
    "orgs",
    "org",
    "organization",
    "organizations",
  ];

  for (const relName of possibleRelationshipNames) {
    const orgId = relationshipId(animal, relName);
    if (!orgId) continue;

    const possibleTypes = ["orgs", "org", "organization", "organizations"];

    for (const type of possibleTypes) {
      const org = findIncluded(included, type, orgId);
      if (org) return org;
    }
  }

  return null;
}

function pickPhotoUrl(animal, included) {
  const pictureId =
    relationshipId(animal, "pictures") ||
    relationshipId(animal, "picture") ||
    relationshipId(animal, "images") ||
    relationshipId(animal, "image");

  const picture =
    findIncluded(included, "pictures", pictureId) ||
    findIncluded(included, "picture", pictureId) ||
    included.find((item) => ["pictures", "picture"].includes(item.type));

  if (picture) {
    const bestIncludedPhoto =
      clean(attr(picture, "urlSecureFullsize")) ||
      clean(attr(picture, "urlFullsize")) ||
      clean(attr(picture, "urlSecureLarge")) ||
      clean(attr(picture, "urlLarge")) ||
      clean(attr(picture, "urlSecureThumbnail")) ||
      clean(attr(picture, "urlThumbnail")) ||
      clean(attr(picture, "url"));

    if (bestIncludedPhoto) return bestIncludedPhoto;
  }

  return (
    clean(attr(animal, "pictureUrl")) ||
    clean(attr(animal, "imageUrl")) ||
    clean(attr(animal, "photoUrl")) ||
    clean(attr(animal, "pictureThumbnailUrl"))
  );
}

function normalizeSize(animal) {
  const sizeText = String(
    attr(animal, "size") ||
      attr(animal, "sizeGroup") ||
      attr(animal, "animalSize") ||
      ""
  ).toLowerCase();

  if (sizeText.includes("x-large") || sizeText.includes("extra large")) {
    return "X-Large";
  }

  if (sizeText.includes("large")) return "Large";
  if (sizeText.includes("medium")) return "Medium";
  if (sizeText.includes("small")) return "Small";

  const weight = Number(attr(animal, "weight"));

  if (Number.isFinite(weight)) {
    if (weight < 25) return "Small";
    if (weight < 50) return "Medium";
    if (weight < 80) return "Large";
    return "X-Large";
  }

  return "Medium";
}

function normalizeEnergy(animal) {
  const text = String(
    attr(animal, "energyLevel") ||
      attr(animal, "activityLevel") ||
      attr(animal, "exerciseNeeds") ||
      ""
  ).toLowerCase();

  if (text.includes("high")) return "High";
  if (text.includes("moderate") || text.includes("medium")) return "Moderate";
  if (text.includes("low")) return "Low";

  return "Moderate";
}

function normalizeAgeYears(animal) {
  const years = Number(attr(animal, "ageYears"));

  if (Number.isFinite(years)) return years;

  const ageText = String(
    attr(animal, "ageString") ||
      attr(animal, "ageGroup") ||
      attr(animal, "age") ||
      ""
  ).toLowerCase();

  const yearMatch = ageText.match(/(\d+)\s*year/);
  if (yearMatch) return Number(yearMatch[1]);

  if (ageText.includes("puppy") || ageText.includes("baby")) return 0;
  if (ageText.includes("young")) return 1;
  if (ageText.includes("adult")) return 3;
  if (ageText.includes("senior")) return 8;

  return null;
}

function normalizeBool(value) {
  if (value === true || value === false) return value;

  const text = String(value || "").toLowerCase().trim();

  if (["yes", "true", "1", "good"].includes(text)) return true;
  if (["no", "false", "0"].includes(text)) return false;

  return null;
}

function stripHtml(html) {
  const text = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text || "";
}

function isAdoptionPending(animal) {
  const name = String(attr(animal, "name") || "").toLowerCase();
  const status = String(attr(animal, "status") || "").toLowerCase();
  const statusName = String(attr(animal, "statusName") || "").toLowerCase();

  return (
    name.includes("adoption pending") ||
    name.includes("pending adoption") ||
    status.includes("pending") ||
    statusName.includes("pending")
  );
}

function getApplyUrl(animal, rescue, orgWebsite) {
  const animalId = clean(animal?.id);

  return (
    clean(attr(animal, "url")) ||
    clean(attr(animal, "animalUrl")) ||
    clean(attr(animal, "adoptionUrl")) ||
    clean(attr(animal, "link")) ||
    orgWebsite ||
    rescue.applyUrl ||
    rescue.website ||
    (animalId
      ? `https://www.rescuegroups.org/animals/detail?AnimalID=${animalId}`
      : null)
  );
}

function normalizeDogRow(animal, org, included, rescue) {
  const animalId = clean(animal?.id);
  const name = clean(attr(animal, "name")) || "Unnamed dog";
  const pending = isAdoptionPending(animal);

  const breed =
    clean(attr(animal, "breedString")) ||
    clean(attr(animal, "breedPrimary")) ||
    clean(attr(animal, "breed")) ||
    "Mixed breed";

  const rawDescription =
    clean(attr(animal, "descriptionHtml")) ||
    clean(attr(animal, "descriptionText")) ||
    clean(attr(animal, "description")) ||
    "";

  const orgName =
    clean(attr(org, "name")) ||
    clean(attr(org, "orgName")) ||
    rescue.name;

  const orgWebsite =
    clean(attr(org, "url")) ||
    clean(attr(org, "website")) ||
    clean(attr(org, "adoptionUrl")) ||
    rescue.website;

  const city =
    clean(attr(animal, "locationCity")) ||
    clean(attr(animal, "animalLocationCity")) ||
    clean(attr(animal, "city")) ||
    clean(attr(org, "city")) ||
    clean(attr(org, "orgCity")) ||
    rescue.city;

  const state =
    normalizeState(attr(animal, "locationState")) ||
    normalizeState(attr(animal, "animalLocationState")) ||
    normalizeState(attr(animal, "state")) ||
    normalizeState(attr(org, "state")) ||
    normalizeState(attr(org, "orgState")) ||
    rescue.state;

  const sourceUrl = getApplyUrl(animal, rescue, orgWebsite);

  const now = new Date().toISOString();

  return {
    shelter_id: rescue.shelterId,

    rescuegroups_id: animalId,
    rescuegroups_org_id: rescue.orgId,

    source: "rescuegroups",
    external_id: animalId,
    source_url: sourceUrl,
    adoption_url: sourceUrl,

    name,
    breed,
    gender: clean(attr(animal, "sex")) || clean(attr(animal, "gender")),

    age_years: normalizeAgeYears(animal),
    age_text:
      clean(attr(animal, "ageString")) ||
      clean(attr(animal, "ageGroup")) ||
      clean(attr(animal, "age")),

    size: normalizeSize(animal),
    energy_level: normalizeEnergy(animal),
    activity_level:
      clean(attr(animal, "activityLevel")) ||
      clean(attr(animal, "exerciseNeeds")) ||
      null,

    description: stripHtml(rawDescription),
    photo_url: pickPhotoUrl(animal, included),

    adoptable: !pending,
    adoption_pending: pending,
    availability_status: pending ? "pending" : "available",
    last_checked_at: now,
    last_seen_at: now,

    placement_type: DEFAULT_PLACEMENT_TYPE,
    placement_city: city,
    placement_state: state,
    placement_location: city && state ? `${city}, ${state}` : null,

    source_updated_at:
      clean(attr(animal, "updatedDate")) ||
      clean(attr(animal, "updatedAt")) ||
      now,

    shelter_name: orgName,
    shelter_website: orgWebsite,

    urgency_level: pending ? "Adopted" : "Standard",

    good_with_kids: normalizeBool(attr(animal, "isGoodWithChildren")),
    good_with_cats: normalizeBool(attr(animal, "isGoodWithCats")),
    good_with_dogs: normalizeBool(attr(animal, "isGoodWithDogs")),
    potty_trained: normalizeBool(attr(animal, "isHousetrained")),

    hypoallergenic: false,
  };
}

async function ensureShelterForRescue(rescue) {
  const { data: existingShelters, error: findError } = await supabase
    .from("shelters")
    .select("id, name")
    .eq("rescuegroups_org_id", rescue.orgId)
    .limit(1);

  if (findError) {
    throw new Error(
      `Could not look up shelter for ${rescue.name}: ${findError.message}`
    );
  }

  const existingShelter = existingShelters?.[0];

  if (existingShelter?.id) {
    const { error: updateError } = await supabase
      .from("shelters")
      .update({
        name: rescue.name,
        rescuegroups_org_id: rescue.orgId,
        city: rescue.city,
        state: rescue.state,
        website: rescue.website,
        apply_url: rescue.applyUrl || rescue.website,
        verified: true,
      })
      .eq("id", existingShelter.id);

    if (updateError) {
      throw new Error(
        `Could not update shelter for ${rescue.name}: ${updateError.message}`
      );
    }

    return existingShelter.id;
  }

  const { data: newShelter, error: insertError } = await supabase
    .from("shelters")
    .insert({
      name: rescue.name,
      rescuegroups_org_id: rescue.orgId,
      city: rescue.city,
      state: rescue.state,
      website: rescue.website,
      apply_url: rescue.applyUrl || rescue.website,
      verified: true,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(
      `Could not create shelter for ${rescue.name}: ${insertError.message}`
    );
  }

  return newShelter.id;
}

async function fetchDogsForRescueWithFilter(rescue, fieldName) {
  const url = `${RESCUEGROUPS_BASE_URL}/animals/search/available?include=orgs,pictures&limit=100`;

  const body = {
    data: {
      filters: [
        {
          fieldName: "species.singular",
          operation: "equals",
          criteria: "Dog",
        },
        {
          fieldName: "statuses.name",
          operation: "equals",
          criteria: "Available",
        },
        {
          fieldName,
          operation: "equals",
          criteria: rescue.orgId,
        },
      ],
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: RESCUEGROUPS_API_KEY,
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify(body),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(
      `Filter ${fieldName} failed for ${rescue.name} with status ${
        response.status
      }: ${JSON.stringify(json)}`
    );
  }

  return {
    animals: Array.isArray(json.data) ? json.data : [],
    included: Array.isArray(json.included) ? json.included : [],
  };
}

async function fetchDogsForRescue(rescue) {
  const possibleOrgFilterFields = [
    "orgs.id",
    "org.id",
    "organizations.id",
    "organization.id",
    "animalOrgID",
    "animalOrgId",
  ];

  let lastError = null;

  for (const fieldName of possibleOrgFilterFields) {
    try {
      console.log(`Trying ${rescue.name} org filter: ${fieldName}`);

      const result = await fetchDogsForRescueWithFilter(rescue, fieldName);

      console.log(
        `Filter ${fieldName} returned ${result.animals.length} dogs for ${rescue.name}.`
      );

      if (result.animals.length > 0) {
        return result;
      }
    } catch (error) {
      lastError = error;
      console.log(`Filter ${fieldName} did not work. Trying next option...`);
    }
  }

  throw new Error(
    `Could not fetch dogs for ${rescue.name}. Last error: ${
      lastError?.message || "Unknown error"
    }`
  );
}

async function findExistingDog(dogRow) {
  if (dogRow.rescuegroups_id) {
    const { data, error } = await supabase
      .from("dogs")
      .select("id, name")
      .eq("rescuegroups_id", dogRow.rescuegroups_id)
      .maybeSingle();

    if (!error && data?.id) return data;
  }

  if (dogRow.external_id) {
    const { data, error } = await supabase
      .from("dogs")
      .select("id, name")
      .eq("source", "rescuegroups")
      .eq("external_id", dogRow.external_id)
      .maybeSingle();

    if (!error && data?.id) return data;
  }

  return null;
}

async function updateExistingDog(existingDog, dogRow) {
  const { error } = await supabase
    .from("dogs")
    .update(dogRow)
    .eq("id", existingDog.id);

  if (error) {
    throw new Error(`Could not update ${dogRow.name}: ${error.message}`);
  }
}

async function insertNewDog(dogRow) {
  const { error } = await supabase.from("dogs").insert(dogRow);

  if (error) {
    throw new Error(`Could not insert ${dogRow.name}: ${error.message}`);
  }
}

async function importRescueDogs(rescue) {
  console.log("");
  console.log("==========================================");
  console.log(`Importing ${rescue.name} (${rescue.orgId})`);
  console.log("==========================================");

  rescue.shelterId = await ensureShelterForRescue(rescue);
  console.log(`Using shelter_id ${rescue.shelterId} for ${rescue.name}.`);

  const { animals, included } = await fetchDogsForRescue(rescue);

  console.log(`Fetched ${animals.length} dogs from RescueGroups.`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const animal of animals) {
    if (inserted + updated >= IMPORT_LIMIT_PER_RESCUE) break;

    const org = findOrgForAnimal(animal, included);
    const dogRow = normalizeDogRow(animal, org, included, rescue);

    if (!dogRow.shelter_id) {
      console.log(`Skipping ${dogRow.name}: missing shelter_id.`);
      skipped += 1;
      continue;
    }

    if (!dogRow.rescuegroups_id) {
      console.log(`Skipping ${dogRow.name}: missing RescueGroups ID.`);
      skipped += 1;
      continue;
    }

    if (!dogRow.name || dogRow.name === "Unnamed dog") {
      console.log("Skipping dog with missing name.");
      skipped += 1;
      continue;
    }

    if (!dogRow.photo_url) {
      console.log(`Skipping ${dogRow.name}: missing photo.`);
      skipped += 1;
      continue;
    }

    const existingDog = await findExistingDog(dogRow);

    try {
      if (existingDog) {
        await updateExistingDog(existingDog, dogRow);
        console.log(`Updated ${dogRow.name}.`);
        updated += 1;
      } else {
        await insertNewDog(dogRow);
        console.log(`Imported ${dogRow.name}.`);
        inserted += 1;
      }
    } catch (error) {
      console.error(error.message);
      skipped += 1;
    }
  }

  console.log(
    `Done with ${rescue.name}. Inserted ${inserted}. Updated ${updated}. Skipped ${skipped}.`
  );

  return { inserted, updated, skipped };
}

async function importTopRecommendedRescues() {
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const rescue of TARGET_RESCUES) {
    const result = await importRescueDogs(rescue);

    totalInserted += result.inserted;
    totalUpdated += result.updated;
    totalSkipped += result.skipped;
  }

  console.log("");
  console.log("==========================================");
  console.log("All top recommended rescues done.");
  console.log(`Total inserted: ${totalInserted}`);
  console.log(`Total updated: ${totalUpdated}`);
  console.log(`Total skipped: ${totalSkipped}`);
  console.log("==========================================");
}

importTopRecommendedRescues().catch((error) => {
  console.error("Import failed:");
  console.error(error);
  process.exit(1);
});