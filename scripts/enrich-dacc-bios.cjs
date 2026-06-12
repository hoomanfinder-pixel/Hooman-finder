/* eslint-disable no-console */

/**
 * Enrich existing DACC RescueGroups rows with public Friends of DACC/ShelterManager bios.
 *
 * Dry-run by default. Add --confirm to write safe updates.
 * This does not create dogs, change availability, or scrape unrelated rescues.
 */

require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const DACC_RESCUEGROUPS_ORG_ID = "8883";
const SHELTERMANAGER_ACCOUNT = "pe3256";
const SHELTERMANAGER_BASE_URL = "https://service.sheltermanager.com/asmservice";
const RESCUEGROUPS_API_URL =
  "https://api.rescuegroups.org/v5/public/animals/search/available/dogs";

const CONFIRMED = process.argv.includes("--confirm");
const LIMIT = Number(getArg("limit", "0"));
const NAME_FILTER = getArg("name", "");

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function hasText(value) {
  return clean(value).length > 0;
}

function decodeHtml(value) {
  return clean(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(value) {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeName(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function isGenericDescription(value) {
  const text = clean(value).toLowerCase();
  if (!text) return true;
  return (
    text === "no description provided yet." ||
    text === "no description provided yet" ||
    /^.+ is available through .+\.$/.test(text)
  );
}

function findJsonArrayAfter(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return "";

  const start = source.indexOf("[", markerIndex);
  if (start === -1) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "[") depth += 1;
    if (char === "]") depth -= 1;

    if (depth === 0) return source.slice(start, index + 1);
  }

  return "";
}

function removeBoilerplate(text) {
  const stopPatterns = [
    /^meet all of our adoptable pets/i,
    /^this pet is in a foster home/i,
    /^if you are interested in meeting/i,
    /^there is a suggested donation/i,
    /^to meet them please go/i,
    /^please keep in mind/i,
    /^studies show/i,
    /^and when coming to meet/i,
    /^the shelter is open/i,
    /^\**1431 e ferry/i,
  ];

  const lines = clean(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const kept = [];

  for (const line of lines) {
    const normalized = line.replace(/^[•*-]\s*/, "").trim();
    if (stopPatterns.some((pattern) => pattern.test(normalized))) break;
    kept.push(line);
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractBioFromAnimal(animal) {
  const raw =
    clean(animal.ALTERNATEBIO) ||
    clean(animal.WEBSITEMEDIANOTES) ||
    clean(animal.ANIMALCOMMENTS);

  return removeBoilerplate(htmlToText(raw));
}

function extractBioFromDetailHtml(html) {
  const match = String(html || "").match(
    /<p\b[^>]*class=["'][^"']*\badoptee-description\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i
  );

  return match ? removeBoilerplate(htmlToText(match[1])) : "";
}

function extractCautiousNotes(bio) {
  const notes = [];

  const lines = clean(bio)
    .split("\n")
    .map((part) => part.replace(/^[•*-]\s*/, "").trim())
    .filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("may do well") || lower.includes("slow and proper intro")) {
      notes.push(line);
    }
  }

  return Array.from(new Set(notes)).join(" ");
}

function explicitYes(value) {
  return clean(value).toLowerCase() === "yes";
}

function buildTraitUpdates(dog, animal) {
  const updates = {};

  if (dog.good_with_dogs === null && explicitYes(animal.ISGOODWITHDOGSNAME)) {
    updates.good_with_dogs = true;
  }

  if (dog.good_with_cats === null && explicitYes(animal.ISGOODWITHCATSNAME)) {
    updates.good_with_cats = true;
  }

  if (dog.good_with_kids === null && explicitYes(animal.ISGOODWITHCHILDRENNAME)) {
    updates.good_with_kids = true;
  }

  if (dog.potty_trained === null && explicitYes(animal.ISHOUSETRAINEDNAME)) {
    updates.potty_trained = true;
  }

  return updates;
}

function detailUrl(animalId) {
  const params = new URLSearchParams({
    account: SHELTERMANAGER_ACCOUNT,
    method: "animal_view",
    animalid: String(animalId),
  });

  return `${SHELTERMANAGER_BASE_URL}?${params.toString()}`;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function fetchShelterManagerAnimals() {
  const params = new URLSearchParams({
    method: "animal_view_adoptable_js",
    account: SHELTERMANAGER_ACCOUNT,
  });
  const text = await fetchText(`${SHELTERMANAGER_BASE_URL}?${params.toString()}`);
  const json = findJsonArrayAfter(text, "var adoptables =");
  if (!json) throw new Error("Could not find ShelterManager adoptables array.");
  return JSON.parse(json);
}

async function fetchRescueGroupsDaccIds(apiKey) {
  const response = await fetch(RESCUEGROUPS_API_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        filters: [
          {
            fieldName: "orgs.id",
            operation: "equals",
            criteria: DACC_RESCUEGROUPS_ORG_ID,
          },
          {
            fieldName: "statuses.name",
            operation: "equals",
            criteria: "Available",
          },
        ],
        fields: {
          animals: ["name", "rescueId"],
        },
        page: {
          limit: 100,
          offset: 0,
        },
      },
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`RescueGroups ${response.status}: ${JSON.stringify(json)}`);
  }

  return new Map(
    (Array.isArray(json.data) ? json.data : [])
      .map((animal) => [
        String(animal.id),
        {
          rescueId: clean(animal.attributes?.rescueId),
          name: clean(animal.attributes?.name),
        },
      ])
      .filter(([, value]) => value.rescueId)
  );
}

async function fetchDaccDogs(supabase) {
  let query = supabase
    .from("dogs")
    .select(
      `
        id,
        name,
        rescuegroups_id,
        rescuegroups_org_id,
        adoptable,
        description,
        placement_note,
        good_with_dogs,
        good_with_cats,
        good_with_kids,
        potty_trained,
        first_time_friendly
      `
    )
    .eq("source", "rescuegroups")
    .eq("rescuegroups_org_id", DACC_RESCUEGROUPS_ORG_ID)
    .eq("adoptable", true)
    .order("created_at", { ascending: false });

  if (NAME_FILTER) query = query.ilike("name", `%${NAME_FILTER}%`);
  if (Number.isFinite(LIMIT) && LIMIT > 0) query = query.limit(LIMIT);

  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function buildUpdate(dog, animal, bio, cautiousNote) {
  const update = {};

  if (bio && isGenericDescription(dog.description)) {
    update.description = bio;
  }

  const traitUpdates = buildTraitUpdates(dog, animal);
  Object.assign(update, traitUpdates);

  if (cautiousNote && !hasText(dog.placement_note)) {
    update.placement_note = cautiousNote;
  }

  return update;
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rescueGroupsApiKey = clean(process.env.RESCUEGROUPS_API_KEY);

  if (!supabaseUrl) throw new Error("Missing VITE_SUPABASE_URL.");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  if (!rescueGroupsApiKey) throw new Error("Missing RESCUEGROUPS_API_KEY.");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  console.log("DACC ShelterManager bio enrichment");
  console.log(`Mode: ${CONFIRMED ? "CONFIRMED WRITE" : "DRY RUN"}`);
  console.log(`Limit: ${Number.isFinite(LIMIT) && LIMIT > 0 ? LIMIT : "none"}`);
  console.log(`Name filter: ${NAME_FILTER || "none"}`);

  const [dogs, rescueGroupsById, shelterManagerAnimals] = await Promise.all([
    fetchDaccDogs(supabase),
    fetchRescueGroupsDaccIds(rescueGroupsApiKey),
    fetchShelterManagerAnimals(),
  ]);

  const shelterManagerByCode = new Map(
    shelterManagerAnimals
      .filter((animal) => clean(animal.SHELTERCODE))
      .map((animal) => [clean(animal.SHELTERCODE).toLowerCase(), animal])
  );

  const summary = {
    checked: 0,
    detailPagesFound: 0,
    enriched: 0,
    manualPreserved: 0,
    noMatch: 0,
    noBio: 0,
    failedDetailFetches: 0,
    written: 0,
  };

  for (const dog of dogs) {
    summary.checked += 1;

    const rescueGroupsInfo = rescueGroupsById.get(String(dog.rescuegroups_id));
    const shelterCode = clean(rescueGroupsInfo?.rescueId);
    const animal = shelterManagerByCode.get(shelterCode.toLowerCase());

    if (!animal) {
      summary.noMatch += 1;
      console.log(`NO DETAIL: ${dog.name} (${dog.rescuegroups_id}) rescueId=${shelterCode || "missing"}`);
      continue;
    }

    const url = detailUrl(animal.ID);
    summary.detailPagesFound += 1;
    console.log(`DETAIL FOUND: ${dog.name} -> ${url}`);

    let detailHtml = "";

    try {
      detailHtml = await fetchText(url);
    } catch (error) {
      summary.failedDetailFetches += 1;
      console.log(`DETAIL FETCH FAILED: ${dog.name} (${url}) ${error.message}`);
      continue;
    }

    const bio = extractBioFromDetailHtml(detailHtml) || extractBioFromAnimal(animal);
    if (!bio) {
      summary.noBio += 1;
      console.log(`NO BIO: ${dog.name}`);
      continue;
    }

    const cautiousNote = extractCautiousNotes(bio);
    const update = buildUpdate(dog, animal, bio, cautiousNote);

    if (hasText(dog.description) && !isGenericDescription(dog.description)) {
      summary.manualPreserved += 1;
      console.log(`PRESERVED DESCRIPTION: ${dog.name}`);
    }

    console.log(
      `${CONFIRMED ? "UPDATE" : "DRY RUN"}: ${dog.name} bio=${update.description ? "yes" : "no"} traits=${
        ["good_with_dogs", "good_with_cats", "good_with_kids", "potty_trained"]
          .filter((key) => Object.prototype.hasOwnProperty.call(update, key))
          .join(",") || "none"
      } note=${update.placement_note ? "yes" : "no"}`
    );

    if (dog.name.toLowerCase() === "cruise") {
      console.log("CRUISE BEFORE DESCRIPTION:");
      console.log(dog.description || "(empty)");
      console.log("CRUISE ENRICHED DESCRIPTION:");
      console.log(update.description || bio);
    }

    if (Object.keys(update).length === 0) continue;

    summary.enriched += 1;

    if (CONFIRMED) {
      const { error } = await supabase.from("dogs").update(update).eq("id", dog.id);
      if (error) throw new Error(`Could not update ${dog.name}: ${error.message}`);
      summary.written += 1;
    }
  }

  console.log("");
  console.log("Summary:");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("DACC bio enrichment failed.");
  console.error(error?.message || error);
  process.exit(1);
});
