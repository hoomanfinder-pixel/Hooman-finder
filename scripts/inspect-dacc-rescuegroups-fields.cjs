/* eslint-disable no-console */

/**
 * READ ONLY: Inspect raw RescueGroups fields for Detroit Animal Care and Control.
 *
 * This script does not create a Supabase client, run SQL, import dogs, or write
 * any data. It only reads RescueGroups public API data for org 8883.
 */

require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const RESCUEGROUPS_API_URL =
  "https://api.rescuegroups.org/v5/public/animals/search/available/dogs";

const DACC_ORG_ID = "8883";
const PAGE_LIMIT = 10;
const API_TIMEOUT_MS = 30000;
const PRINT_DOG_COUNT = 3;

const BIO_TRAIT_TERMS = [
  "activity",
  "attribute",
  "behavior",
  "bio",
  "cat",
  "child",
  "children",
  "compat",
  "description",
  "dog",
  "energy",
  "good",
  "house",
  "housetrain",
  "kid",
  "note",
  "potty",
  "quality",
  "special",
  "tag",
  "temper",
  "trait",
];

const FIELD_CANDIDATES = [
  "name",
  "description",
  "descriptionText",
  "descriptionHtml",
  "summary",
  "animalDescription",
  "animalGeneralAge",
  "animalBreed",
  "animalSex",
  "animalSizeCurrent",
  "animalEnergyLevel",
  "animalHousetrained",
  "animalGoodWithDogs",
  "animalGoodWithCats",
  "animalGoodWithKids",
  "qualities",
  "attributes",
  "tags",
  "specialNeeds",
  "activityLevel",
  "energyLevel",
  "exerciseNeeds",
  "isHousetrained",
  "isHouseTrained",
  "isGoodWithDogs",
  "isGoodWithCats",
  "isGoodWithChildren",
  "isKidsOk",
  "isCatsOk",
  "isDogsOk",
  "goodWithDogs",
  "goodWithCats",
  "goodWithKids",
  "goodWithChildren",
  "needsFoster",
  "size",
  "sizeGroup",
  "sizeCurrent",
  "breed",
  "breedString",
  "breedPrimary",
  "primaryBreed",
  "sex",
  "gender",
  "age",
  "ageString",
  "ageGroup",
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
];

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

function looksRelevant(keyPath) {
  const words = keyPath
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  return BIO_TRAIT_TERMS.some((term) => words.includes(term));
}

function previewValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10);
  }
  if (typeof value === "object") {
    return value;
  }
  return value;
}

function collectRelevantFields(value, prefix = "", out = []) {
  if (value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectRelevantFields(item, `${prefix}[${index}]`, out);
    });
    return out;
  }

  if (typeof value !== "object") {
    if (looksRelevant(prefix)) {
      const key = `${prefix}:${JSON.stringify(value)}`;
      if (!out.some((item) => item.key === key)) {
        out.push({ key, path: prefix, value: previewValue(value) });
      }
    }
    return out;
  }

  Object.entries(value).forEach(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (looksRelevant(path) && (child === null || typeof child !== "object")) {
      const keyForChild = `${path}:${JSON.stringify(child)}`;
      if (!out.some((item) => item.key === keyForChild)) {
        out.push({ key: keyForChild, path, value: previewValue(child) });
      }
    }

    collectRelevantFields(child, path, out);
  });

  return out;
}

function isMostlyTrackerPixel(path, value) {
  return (
    path.toLowerCase().includes("description") &&
    typeof value === "string" &&
    value.includes("tracker.rescuegroups.org") &&
    !value.replace(/<img[^>]*>/gi, "").trim()
  );
}

function usefulBioTraitFields(fields) {
  return fields.filter(({ path, value }) => !isMostlyTrackerPixel(path, value));
}

function relationshipData(item, name) {
  return item?.relationships?.[name]?.data || null;
}

function relationshipIds(item, name) {
  const data = relationshipData(item, name);
  if (!data) return [];
  const refs = Array.isArray(data) ? data : [data];
  return refs.map((ref) => ref?.id).filter(Boolean);
}

function findIncluded(included, type, id) {
  if (!id) return null;
  return included.find((item) => item.type === type && String(item.id) === String(id)) || null;
}

function includedForAnimal(animal, included) {
  const resources = [];

  Object.keys(animal.relationships || {}).forEach((relationshipName) => {
    relationshipIds(animal, relationshipName).forEach((id) => {
      const resource =
        findIncluded(included, relationshipName, id) ||
        findIncluded(included, `${relationshipName}s`, id) ||
        findIncluded(included, relationshipName.replace(/s$/, ""), id) ||
        included.find((item) => String(item.id) === String(id));

      if (resource) resources.push({ relationshipName, resource });
    });
  });

  return resources;
}

function buildRequestBody({ extendedFields }) {
  const data = {
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
    include: ["orgs", "pictures"],
    page: {
      limit: PAGE_LIMIT,
      offset: 0,
    },
  };

  if (extendedFields) {
    data.fields = {
      animals: FIELD_CANDIDATES,
      orgs: ["name", "city", "state", "url", "website", "email"],
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
    };
  }

  return { data };
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

async function fetchInspection(apiKey, { extendedFields }) {
  const response = await fetchWithTimeout(
    RESCUEGROUPS_API_URL,
    {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify(buildRequestBody({ extendedFields })),
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
    const details = JSON.stringify(json, null, 2);
    throw new Error(
      `RescueGroups inspection request failed. Status ${response.status}. Response: ${details}`
    );
  }

  return {
    animals: Array.isArray(json?.data) ? json.data : [],
    included: Array.isArray(json?.included) ? json.included : [],
    meta: json?.meta || {},
  };
}

function printDogInspection(animal, included, index) {
  const attrs = animal.attributes || {};
  const relationships = animal.relationships || {};
  const related = includedForAnimal(animal, included);
  const relevantAnimalFields = collectRelevantFields(attrs);
  const relevantIncludedFields = related.flatMap(({ relationshipName, resource }) => {
    if (["breeds", "colors", "locations", "orgs", "pictures", "species", "statuses"].includes(relationshipName)) {
      return [];
    }

    return collectRelevantFields(resource.attributes || {}, relationshipName);
  });
  const usefulAnimalFields = usefulBioTraitFields(relevantAnimalFields);
  const usefulIncludedFields = usefulBioTraitFields(relevantIncludedFields);

  console.log("");
  console.log("------------------------------------------------------------");
  console.log(`${index + 1}. ${clean(attrs.name) || "Unnamed Dog"} (RG ${animal.id})`);
  console.log("------------------------------------------------------------");
  console.log("Raw animal attribute keys:");
  console.log(Object.keys(attrs).sort().join(", ") || "(none)");
  console.log("");
  console.log("Raw animal relationship keys:");
  console.log(Object.keys(relationships).sort().join(", ") || "(none)");
  console.log("");
  console.log("Included resource types for this dog:");
  console.log(
    related
      .map(({ relationshipName, resource }) => `${relationshipName}:${resource.type}:${resource.id}`)
      .join(", ") || "(none)"
  );
  console.log("");
  console.log("Bio/trait-like animal fields found:");

  if (!relevantAnimalFields.length) {
    console.log("(none)");
  } else {
    console.log(JSON.stringify(relevantAnimalFields.map(({ path, value }) => ({ path, value })), null, 2));
    if (!usefulAnimalFields.length) {
      console.log("No useful dog bio/trait values found; fields above are empty or tracker-only.");
    }
  }

  console.log("");
  console.log("Bio/trait-like included-resource fields found:");

  if (!relevantIncludedFields.length) {
    console.log("(none)");
  } else {
    console.log(JSON.stringify(relevantIncludedFields.map(({ path, value }) => ({ path, value })), null, 2));
    if (!usefulIncludedFields.length) {
      console.log("No useful included-resource bio/trait values found.");
    }
  }
}

function summarizeFindings(animals, included) {
  const summary = new Map();

  animals.slice(0, PRINT_DOG_COUNT).forEach((animal) => {
    usefulBioTraitFields(collectRelevantFields(animal.attributes || {})).forEach(({ path, value }) => {
      if (!summary.has(path)) summary.set(path, []);
      summary.get(path).push({ id: animal.id, name: animal.attributes?.name, value });
    });

    includedForAnimal(animal, included).forEach(({ relationshipName, resource }) => {
      if (["breeds", "colors", "locations", "orgs", "pictures", "species", "statuses"].includes(relationshipName)) {
        return;
      }

      usefulBioTraitFields(collectRelevantFields(resource.attributes || {}, relationshipName)).forEach(({ path, value }) => {
        if (!summary.has(path)) summary.set(path, []);
        summary.get(path).push({ id: animal.id, name: animal.attributes?.name, value });
      });
    });
  });

  console.log("");
  console.log("============================================================");
  console.log("Readable summary of bio/trait-like fields");
  console.log("============================================================");

  if (!summary.size) {
    console.log(
      "No bio/trait-like fields were returned for the inspected DACC dogs via this RescueGroups endpoint."
    );
    return;
  }

  for (const [path, examples] of summary.entries()) {
    console.log("");
    console.log(path);
    examples.slice(0, 3).forEach((example) => {
      console.log(`- ${example.name || "Unnamed Dog"} (${example.id}): ${JSON.stringify(example.value)}`);
    });
  }
}

async function main() {
  const apiKey = normalizeApiKey(process.env.RESCUEGROUPS_API_KEY);

  if (!apiKey) {
    throw new Error("Missing RESCUEGROUPS_API_KEY in the environment or .env.local.");
  }

  console.log("READ ONLY - DACC RescueGroups raw field inspection");
  console.log("No Supabase client is created. No database writes are made.");
  console.log(`RescueGroups org ID: ${DACC_ORG_ID}`);
  console.log("");

  let result;
  let mode = "extended field request";

  try {
    result = await fetchInspection(apiKey, { extendedFields: true });
  } catch (error) {
    console.log("Extended field request failed; falling back to default RescueGroups fields.");
    console.log(error.message);
    console.log("");
    mode = "default field request";
    result = await fetchInspection(apiKey, { extendedFields: false });
  }

  const animals = result.animals.slice(0, PRINT_DOG_COUNT);

  console.log(`Request mode: ${mode}`);
  console.log(`Available dogs returned: ${result.animals.length}`);
  console.log(`Inspecting first ${animals.length} dog(s).`);

  animals.forEach((animal, index) => printDogInspection(animal, result.included, index));
  summarizeFindings(result.animals, result.included);

  console.log("");
  console.log("READ ONLY inspection complete. No Supabase writes were attempted.");
}

main().catch((error) => {
  console.error("");
  console.error("READ ONLY inspection failed safely.");
  console.error(error?.message || error);
  console.error("No Supabase writes were attempted.");
  process.exit(1);
});
