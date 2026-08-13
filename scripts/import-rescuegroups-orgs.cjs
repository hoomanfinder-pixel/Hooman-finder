// scripts/import-rescuegroups-orgs.cjs
//
// General-purpose, safer RescueGroups multi-org import path.
//
// Usage:
//   node scripts/import-rescuegroups-orgs.cjs --org-ids=9242,4470,2033 --dry-run
//   node scripts/import-rescuegroups-orgs.cjs --org-ids=9242,4470,2033
//
// Design goals (see conversation history for the full rationale):
// - Org IDs are ALWAYS passed explicitly via --org-ids. There is no hardcoded
//   "known good" org list anywhere in this file. Nothing runs without an
//   explicit --org-ids argument.
// - --dry-run performs zero Supabase writes: no shelter creation, no dog
//   insert/update. It only reads from RescueGroups (public API) and reads
//   from Supabase (for duplicate ground truth and reporting).
// - Duplicate detection is done against LIVE Supabase data, checked both by
//   rescuegroups_id and by the (source, external_id) pair, mirroring the
//   pattern already used in sync-rescuegroups-dogs.cjs.
// - On update, several fields are deliberately never regressed: energy_level
//   (only overwritten by a real new value), description (never overwritten
//   once a dog already has bio text), shelter_id (never nulled), and
//   urgency_level / imported_status (never touched by sync). This mirrors
//   sync-rescuegroups-dogs.cjs's existing upsertDogs() protections rather
//   than inventing a new policy.
// - Organization/adoption URLs are validated. A malformed URL (e.g. a street
//   address stored in the website field) is REJECTED, not passed through --
//   the row falls back to the next valid candidate, and ultimately to a
//   guaranteed-valid RescueGroups.org public detail-page URL, so a dog is
//   never given a broken link silently.
// - This script never calls the AI enrichment pipeline (scripts/enrich-dogs-ai.cjs).
//   Enrichment is a separate, explicit, opt-in step.

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");
const { ensureShelterForSource } = require("./rescuegroups-shelter-utils.cjs");
const { resolveDogAvailability } = require("./dog-availability.cjs");
const { fetchCompleteRescueGroupsRoster } = require("./rescuegroups-roster.cjs");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESCUEGROUPS_API_KEY = process.env.RESCUEGROUPS_API_KEY;

const RESCUEGROUPS_API_BASE = "https://api.rescuegroups.org/v5";
const PAGE_LIMIT = 100;
const MAX_PAGES = 5;
const API_TIMEOUT_MS = 30000;

if (!SUPABASE_URL) throw new Error("Missing VITE_SUPABASE_URL in .env.local");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
if (!RESCUEGROUPS_API_KEY) throw new Error("Missing RESCUEGROUPS_API_KEY in .env.local");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function getArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const DRY_RUN = hasFlag("dry-run");
const ORG_IDS_ARG = getArg("org-ids");

if (!ORG_IDS_ARG) {
  console.error("");
  console.error("Missing required --org-ids argument.");
  console.error("This script never falls back to a hardcoded org list.");
  console.error("Example: node scripts/import-rescuegroups-orgs.cjs --org-ids=9242,4470,2033 --dry-run");
  console.error("");
  process.exit(1);
}

const ORG_IDS = ORG_IDS_ARG.split(",").map((id) => id.trim()).filter(Boolean);

if (ORG_IDS.length === 0) {
  console.error("--org-ids resolved to an empty list. Nothing to do.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
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

// Rejects malformed URLs outright rather than letting them become a broken
// link on a dog's profile (e.g. an org's "website" field containing a street
// address like "111 S Michigan Ave" instead of a URL).
function isValidHttpUrl(value) {
  const text = clean(value);
  if (!text) return false;

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (!parsed.hostname || !parsed.hostname.includes(".")) return false;

  return true;
}

function firstValidUrl(...candidates) {
  for (const candidate of candidates) {
    if (isValidHttpUrl(candidate)) return clean(candidate);
  }
  return null;
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

function getOrgForAnimal(animal, included) {
  const orgId =
    relationshipId(animal, "orgs") ||
    relationshipId(animal, "org") ||
    relationshipId(animal, "organization");
  if (!orgId) return null;
  return findIncluded(included, "orgs", orgId) || findIncluded(included, "organizations", orgId) || null;
}

function getStatusForAnimal(animal, included) {
  const statusId = relationshipId(animal, "statuses") || relationshipId(animal, "status");
  if (!statusId) return null;
  return findIncluded(included, "statuses", statusId) || findIncluded(included, "status", statusId) || null;
}

function hasSourceValue(attrs, key) {
  if (!Object.prototype.hasOwnProperty.call(attrs, key)) return false;
  const value = attrs[key];
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

function addSourceField(row, attrs, apiField, dbField, normalize = (v) => v) {
  if (!hasSourceValue(attrs, apiField)) return;
  const value = normalize(attrs[apiField]);
  if (value === null || value === undefined) return;
  if (typeof value === "string" && value.trim() === "") return;
  if (Array.isArray(value) && value.length === 0) return;
  row[dbField] = value;
}

function normalizeBool(value) {
  if (value === true || value === false) return value;
  const text = String(value ?? "").toLowerCase().trim();
  if (["yes", "true", "1", "good"].includes(text)) return true;
  if (["no", "false", "0"].includes(text)) return false;
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

function normalizeEnergyLevel(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "high") return "High";
  if (text === "low") return "Low";
  if (text === "medium" || text === "moderate") return "Moderate";
  return null;
}

function parseAgeYearsFromText(ageText) {
  const text = String(ageText || "").toLowerCase().trim();
  if (!text) return null;

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

function getAgeText(attrs) {
  return attrs.ageString || attrs.ageGroup || attrs.age || null;
}

// dogs.grooming_level / shedding_level / barking_level all have Postgres
// CHECK constraints on specific allowed values. RescueGroups' raw text
// ("Not Required", "Weekly", etc.) does not match those directly, so these
// map raw source text to the DB's allowed vocabulary exactly like the
// existing production sync (sync-rescuegroups-dogs.cjs) already does.
// Anything unrecognized is omitted (return null) rather than passed through
// and risking a failed write.
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

function normalizeActivityLevel(value) {
  const text = String(value || "").trim().toLowerCase();
  const allowedValues = {
    "slightly active": "Slightly Active",
    "moderately active": "Moderately Active",
    "highly active": "Highly Active",
  };
  return allowedValues[text] || null;
}

function getAgeYears(attrs) {
  const parsed = parseAgeYearsFromText(getAgeText(attrs));
  if (parsed !== null) return parsed;
  if (typeof attrs.ageYears === "number" && Number.isFinite(attrs.ageYears)) return attrs.ageYears;
  return null;
}

function getBreed(attrs) {
  return attrs.breedString || attrs.breedPrimary || attrs.primaryBreed || attrs.breed || attrs.breeds || null;
}

function getPicturesForAnimal(animal, included) {
  const pictureRefs =
    relationshipData(animal, "pictures") ||
    relationshipData(animal, "picture") ||
    relationshipData(animal, "photos") ||
    relationshipData(animal, "images") ||
    [];
  const refs = Array.isArray(pictureRefs) ? pictureRefs : [pictureRefs];

  return refs
    .map((ref) => findIncluded(included, "pictures", ref?.id) || findIncluded(included, "photos", ref?.id) || null)
    .filter(Boolean);
}

function getPictureUrl(picture) {
  const a = picture?.attributes || {};
  return (
    clean(a.urlSecureFullsize) ||
    clean(a.urlFullsize) ||
    clean(a.urlSecureLarge) ||
    clean(a.urlLarge) ||
    clean(a.large?.url || a.large) ||
    clean(a.original?.url || a.original) ||
    clean(a.medium?.url || a.medium) ||
    clean(a.small?.url || a.small) ||
    clean(a.url)
  );
}

function getPhotoUrls(animal, included) {
  const urls = getPicturesForAnimal(animal, included).map(getPictureUrl).filter(Boolean);

  if (urls.length === 0) {
    const fallback =
      clean(attr(animal, "pictureUrl")) ||
      clean(attr(animal, "imageUrl")) ||
      clean(attr(animal, "photoUrl")) ||
      clean(attr(animal, "pictureThumbnailUrl"));
    if (fallback) urls.push(fallback);
  }

  return [...new Set(urls)];
}

// Species/status filtering is enforced twice: once via the API request filter
// itself, and again here on the returned payload, since RescueGroups filters
// have been observed to occasionally be inexact.
function isDog(animal) {
  const species = String(attr(animal, "speciesSingular") || attr(animal, "species") || "").toLowerCase();
  if (!species) return true; // no species attribute returned; don't false-reject
  return species.includes("dog");
}

// ---------------------------------------------------------------------------
// RescueGroups fetch
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOrgMeta(orgId) {
  const res = await fetchWithTimeout(
    `${RESCUEGROUPS_API_BASE}/public/orgs/${orgId}`,
    { headers: { Authorization: RESCUEGROUPS_API_KEY, Accept: "application/vnd.api+json" } },
    API_TIMEOUT_MS
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Could not fetch org ${orgId} metadata: ${res.status} ${JSON.stringify(json)}`);
  }
  return json.data?.[0] || null;
}

function buildRequestBody(orgId) {
  return {
    data: {
      filters: [
        { fieldName: "species.singular", operation: "equals", criteria: "Dog" },
        { fieldName: "statuses.name", operation: "equals", criteria: "Available" },
        { fieldName: "orgs.id", operation: "equals", criteria: String(orgId) },
      ],
      sort: [{ fieldName: "animals.updatedDate", direction: "desc" }],
      fields: {
        animals: [
          "name", "descriptionText", "descriptionHtml", "description",
          "breedString", "breedPrimary", "primaryBreed", "breed", "breeds",
          "sizeGroup", "sizeCurrent", "size", "sex", "gender",
          "ageString", "ageGroup", "age", "ageYears",
          "url", "webpageUrl", "animalUrl", "adoptionUrl", "link",
          "updatedDate", "speciesSingular", "species",
          "isDogsOk", "isCatsOk", "isKidsOk", "adultSexesOk", "isHousetrained",
          "activityLevel", "energyLevel", "exerciseNeeds", "obedienceTraining",
          "groomingNeeds", "sheddingLevel", "vocalLevel", "ownerExperience",
          "isYardRequired", "fenceNeeds", "newPeopleReaction", "qualities",
          "pictureCount", "isAdoptionPending", "isCourtesyListing",
          "pictureUrl", "imageUrl", "photoUrl", "pictureThumbnailUrl",
        ],
        pictures: [
          "urlSecureFullsize", "urlFullsize", "urlSecureLarge", "urlLarge",
          "large", "original", "medium", "small", "order", "url",
        ],
        orgs: ["name", "city", "state", "url", "website", "adoptionUrl"],
        statuses: ["name", "description"],
      },
      include: ["pictures", "orgs", "statuses"],
    },
  };
}

async function fetchDogsForOrg(orgId) {
  const roster = await fetchCompleteRescueGroupsRoster({
    apiUrl: `${RESCUEGROUPS_API_BASE}/public/animals/search/available`,
    apiKey: RESCUEGROUPS_API_KEY,
    orgId,
    buildRequestBody: () => buildRequestBody(orgId),
    pageLimit: PAGE_LIMIT,
    maxPages: MAX_PAGES,
    timeoutMs: API_TIMEOUT_MS,
  });
  return { animals: roster.animals, included: roster.included, roster };
}

// ---------------------------------------------------------------------------
// Transform: RescueGroups animal -> dogs row
// ---------------------------------------------------------------------------

function mapAnimalToDogRow(animal, included, orgMeta, orgId) {
  const attrs = animal.attributes || {};
  const orgFromIncluded = getOrgForAnimal(animal, included);
  const orgAttrs = orgFromIncluded?.attributes || orgMeta?.attributes || {};

  const externalId = String(animal.id);
  const name = clean(attrs.name) || "Unnamed Dog";
  const description =
    cleanText(attrs.descriptionText) || cleanText(attrs.descriptionHtml) || cleanText(attrs.description);

  // Adoption link: try animal-specific URLs first, then the org's own
  // website/adoptionUrl, then the org metadata we fetched directly by ID.
  // Anything malformed (e.g. a street address in a website field) is
  // rejected by isValidHttpUrl rather than used as-is. The RescueGroups.org
  // public detail page is a guaranteed-valid last resort so a dog is never
  // left with a broken link.
  const adoptionUrl = firstValidUrl(
    attrs.url,
    attrs.webpageUrl,
    attrs.animalUrl,
    attrs.adoptionUrl,
    attrs.link,
    orgAttrs.adoptionUrl,
    orgAttrs.url,
    orgAttrs.website,
    `https://www.rescuegroups.org/animals/detail?AnimalID=${externalId}`
  );

  const photoUrls = getPhotoUrls(animal, included);
  const photoUrl = photoUrls[0] || null;
  const now = new Date().toISOString();

  const city = clean(attrs.locationCity) || clean(orgAttrs.city) || null;
  const state = clean(attrs.locationState) || clean(orgAttrs.state) || "MI";

  const status = getStatusForAnimal(animal, included);
  const statusText = [status?.attributes?.name, status?.attributes?.description].filter(Boolean).join(" ");

  const availability = resolveDogAvailability({
    dog: { name, description },
    isAdoptionPending: attrs.isAdoptionPending,
    isCourtesyListing: attrs.isCourtesyListing,
    sourceStatus: statusText,
  });

  const row = {
    source: "rescuegroups",
    external_id: externalId,
    rescuegroups_id: externalId,
    rescuegroups_org_id: String(orgId),

    name,
    breed: getBreed(attrs),
    age_text: getAgeText(attrs),
    age_years: getAgeYears(attrs),
    gender: clean(attrs.sex) || clean(attrs.gender),

    size: normalizeSize(attrs.sizeGroup || attrs.sizeCurrent || attrs.size),
    description,

    photo_url: photoUrl,
    photo_urls: photoUrls,

    adoptable: availability.adoptable,
    adoption_pending: availability.adoptionPending,
    urgency_level: availability.urgencyLevel,

    source_url: adoptionUrl,
    adoption_url: adoptionUrl,

    shelter_name: clean(orgAttrs.name) || null,
    shelter_website: firstValidUrl(orgAttrs.url, orgAttrs.website),

    placement_type: "Shelter",
    placement_city: city,
    placement_state: state,
    placement_location: city && state ? `${city}, ${state}` : state,

    availability_status: availability.availabilityStatus,
    unavailable_reason: availability.unavailableReason,

    imported_status: "visible",

    source_updated_at: attrs.updatedDate ? new Date(attrs.updatedDate).toISOString() : null,
    last_checked_at: now,
    last_seen_at: now,
  };

  addSourceField(row, attrs, "isDogsOk", "good_with_dogs", normalizeBool);
  addSourceField(row, attrs, "isCatsOk", "good_with_cats", normalizeBool);
  addSourceField(row, attrs, "isKidsOk", "good_with_kids", normalizeBool);
  addSourceField(row, attrs, "isHousetrained", "potty_trained", normalizeBool);
  addSourceField(row, attrs, "energyLevel", "energy_level", normalizeEnergyLevel);
  addSourceField(row, attrs, "activityLevel", "activity_level", normalizeActivityLevel);
  addSourceField(row, attrs, "exerciseNeeds", "exercise_needs", clean);
  addSourceField(row, attrs, "obedienceTraining", "obedience_training", clean);
  addSourceField(row, attrs, "groomingNeeds", "grooming_level", normalizeGroomingLevel);
  addSourceField(row, attrs, "sheddingLevel", "shedding_level", normalizeSheddingLevel);
  addSourceField(row, attrs, "vocalLevel", "barking_level", normalizeBarkingLevel);
  addSourceField(row, attrs, "ownerExperience", "owner_experience", clean);
  addSourceField(row, attrs, "isYardRequired", "yard_required", normalizeBool);
  addSourceField(row, attrs, "fenceNeeds", "fence_needs", clean);
  addSourceField(row, attrs, "adultSexesOk", "adult_sexes_ok", clean);
  addSourceField(row, attrs, "newPeopleReaction", "new_people_reaction", clean);

  return row;
}

// ---------------------------------------------------------------------------
// Duplicate ground truth (live Supabase, never a hardcoded list)
// ---------------------------------------------------------------------------

async function findExistingDogsMap(rescuegroupsIds) {
  if (rescuegroupsIds.length === 0) return new Map();

  const { data: byRgId, error: e1 } = await supabase
    .from("dogs")
    .select("id, rescuegroups_id, external_id, source, description, good_with_kids, good_with_dogs, good_with_cats, potty_trained, hypoallergenic")
    .in("rescuegroups_id", rescuegroupsIds);
  if (e1) throw new Error(`Existing-dog lookup by rescuegroups_id failed: ${e1.message}`);

  const { data: byExternalId, error: e2 } = await supabase
    .from("dogs")
    .select("id, rescuegroups_id, external_id, source, description, good_with_kids, good_with_dogs, good_with_cats, potty_trained, hypoallergenic")
    .eq("source", "rescuegroups")
    .in("external_id", rescuegroupsIds);
  if (e2) throw new Error(`Existing-dog lookup by (source, external_id) failed: ${e2.message}`);

  const map = new Map();
  for (const dog of byRgId || []) map.set(String(dog.rescuegroups_id), dog);
  for (const dog of byExternalId || []) {
    if (!map.has(String(dog.external_id))) map.set(String(dog.external_id), dog);
  }
  return map;
}

// Applies the same protective rules as sync-rescuegroups-dogs.cjs's
// upsertDogs(): never regress energy_level to null, never touch
// urgency_level/imported_status on update, never overwrite an existing
// non-empty description, never null out shelter_id. This is the "do not
// overwrite manually reviewed or shelter-confirmed fields" rule.
function buildProtectedUpdateRow(newRow, existingDog) {
  const updateRow = { ...newRow };

  if (updateRow.energy_level === null || updateRow.energy_level === undefined) {
    delete updateRow.energy_level;
  }

  delete updateRow.urgency_level;
  delete updateRow.imported_status;

  if (String(existingDog.description || "").trim().length > 0) {
    delete updateRow.description;
  }

  if (!updateRow.shelter_id) {
    delete updateRow.shelter_id;
  }

  return updateRow;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function processOrg(orgId) {
  console.log("");
  console.log("=".repeat(70));
  console.log(`Org ${orgId}`);
  console.log("=".repeat(70));

  const orgMeta = await fetchOrgMeta(orgId);
  if (!orgMeta) {
    console.log(`Could not fetch org metadata for ${orgId} from RescueGroups. Skipping.`);
    return { orgId, orgName: null, found: 0, inserted: 0, updated: 0, skipped: 0, duplicates: 0, rows: [] };
  }

  const orgName = clean(orgMeta.attributes?.name) || `Org ${orgId}`;
  console.log(`Name: ${orgName}`);
  console.log(`City/State: ${orgMeta.attributes?.city}, ${orgMeta.attributes?.state}`);

  const { animals, included } = await fetchDogsForOrg(orgId);
  console.log(`Animals returned: ${animals.length}`);

  const dogRows = animals
    .filter(isDog)
    .map((animal) => mapAnimalToDogRow(animal, included, orgMeta, orgId))
    .filter((row) => row.adoptable && !row.adoption_pending && row.urgency_level !== "Adopted");

  console.log(`Adoptable dog rows after filtering: ${dogRows.length}`);

  const existingByRgId = await findExistingDogsMap(dogRows.map((r) => r.rescuegroups_id));

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let duplicates = 0;

  const summaryRows = [];

  let shelterId = null;
  if (!DRY_RUN) {
    shelterId = await ensureShelterForSource(supabase, {
      rescuegroups_org_id: orgId,
      name: orgName,
      city: clean(orgMeta.attributes?.city),
      state: clean(orgMeta.attributes?.state) || "MI",
      website: firstValidUrl(orgMeta.attributes?.url, orgMeta.attributes?.website),
      apply_url: firstValidUrl(orgMeta.attributes?.adoptionUrl, orgMeta.attributes?.url, orgMeta.attributes?.website),
    });
    console.log(`Resolved shelter_id: ${shelterId}`);
  }

  for (const row of dogRows) {
    if (shelterId) row.shelter_id = shelterId;

    if (!row.name || row.name === "Unnamed Dog" || !row.photo_url) {
      skipped += 1;
      summaryRows.push({ ...row, _action: "skip (missing name/photo)" });
      continue;
    }

    const existingDog = existingByRgId.get(String(row.rescuegroups_id));

    if (existingDog) {
      duplicates += 1;
      const updateRow = buildProtectedUpdateRow(row, existingDog);

      if (DRY_RUN) {
        summaryRows.push({ ...row, _action: "would update (existing)" });
        updated += 1;
        continue;
      }

      const { error } = await supabase.from("dogs").update(updateRow).eq("id", existingDog.id);
      if (error) {
        console.error(`Could not update ${row.name}: ${error.message}`);
        skipped += 1;
        continue;
      }
      updated += 1;
      summaryRows.push({ ...row, _action: "updated" });
    } else {
      if (DRY_RUN) {
        summaryRows.push({ ...row, _action: "would insert" });
        inserted += 1;
        continue;
      }

      const { error } = await supabase.from("dogs").insert(row);
      if (error) {
        console.error(`Could not insert ${row.name}: ${error.message}`);
        skipped += 1;
        continue;
      }
      inserted += 1;
      summaryRows.push({ ...row, _action: "inserted" });
    }
  }

  const missingPhoto = dogRows.filter((r) => !r.photo_url).length;
  const missingBio = dogRows.filter((r) => !r.description || r.description.trim().length < 20).length;
  const missingLink = dogRows.filter((r) => !r.adoption_url).length;

  console.log(`Would insert / inserted: ${inserted}`);
  console.log(`Would update / updated (duplicates): ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Duplicates detected: ${duplicates}`);
  console.log(`Missing photo: ${missingPhoto}/${dogRows.length}`);
  console.log(`Missing usable bio: ${missingBio}/${dogRows.length}`);
  console.log(`Missing/invalid adoption link: ${missingLink}/${dogRows.length}`);

  return {
    orgId,
    orgName,
    found: dogRows.length,
    inserted,
    updated,
    skipped,
    duplicates,
    missingPhoto,
    missingBio,
    missingLink,
    rows: dogRows,
  };
}

async function main() {
  console.log("========================================");
  console.log("RescueGroups multi-org import");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no Supabase writes)" : "PRODUCTION WRITE"}`);
  console.log(`Org IDs (explicit, from --org-ids): ${ORG_IDS.join(", ")}`);
  console.log("AI enrichment: NOT run by this script.");
  console.log("========================================");

  const results = [];
  for (const orgId of ORG_IDS) {
    const result = await processOrg(orgId);
    results.push(result);
  }

  console.log("");
  console.log("========================================");
  console.log("SUMMARY");
  console.log("========================================");

  let totalFound = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalDuplicates = 0;

  for (const r of results) {
    console.log(
      `${r.orgName || r.orgId} (${r.orgId}): found ${r.found}, inserted ${r.inserted}, updated ${r.updated}, skipped ${r.skipped}, duplicates ${r.duplicates}`
    );
    totalFound += r.found;
    totalInserted += r.inserted;
    totalUpdated += r.updated;
    totalSkipped += r.skipped;
    totalDuplicates += r.duplicates;
  }

  console.log("-".repeat(40));
  console.log(
    `TOTAL: found ${totalFound}, inserted ${totalInserted}, updated ${totalUpdated}, skipped ${totalSkipped}, duplicates ${totalDuplicates}`
  );

  if (DRY_RUN) {
    console.log("");
    console.log("Sample transformed dogs (2 per org):");
    for (const r of results) {
      console.log(`\n--- ${r.orgName || r.orgId} ---`);
      console.log(JSON.stringify(r.rows.slice(0, 2), null, 2));
    }
    console.log("");
    console.log("DRY RUN complete. No Supabase writes were made.");
  } else {
    console.log("");
    console.log("Production import complete.");
  }
}

main().catch((error) => {
  console.error("");
  console.error("Import failed:");
  console.error(error);
  process.exit(1);
});
