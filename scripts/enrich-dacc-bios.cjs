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
const crypto = require("crypto");
const {
  fetchCompleteRescueGroupsRoster,
} = require("./rescuegroups-roster.cjs");
const {
  HASHED_FIELDS,
  computeSourceContentHash,
  mergeHashedSnapshot,
} = require("./dog-enrichment-hash.cjs");

const DACC_RESCUEGROUPS_ORG_ID = "8883";
const SHELTERMANAGER_ACCOUNT = "pe3256";
const SHELTERMANAGER_BASE_URL = "https://service.sheltermanager.com/asmservice";
const RESCUEGROUPS_API_URL =
  "https://api.rescuegroups.org/v5/public/animals/search/available/dogs";
const RESCUEGROUPS_PAGE_LIMIT = 100;
const RESCUEGROUPS_MAX_PAGES = 5;
const NO_BIO_RETRY_MS = 3 * 24 * 60 * 60 * 1000;
const RECOVERED_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_AVAILABILITY_STATUSES = new Set(["active", "available", "unknown"]);

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

function hashAuthoritativeBio(value) {
  return crypto.createHash("sha256").update(clean(value)).digest("hex");
}

function parseTimestamp(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function elapsedAtLeast(value, now, durationMs) {
  const timestamp = parseTimestamp(value);
  return timestamp === null || now.getTime() - timestamp >= durationMs;
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

function hasDogMayDoWellClue(bio) {
  const text = clean(bio).toLowerCase();
  const hasPositiveDogContext =
    text.includes("may do well living with a fur sibling") ||
    text.includes("may do well with a fur sibling") ||
    text.includes("may do well with dogs") ||
    text.includes("non reactive to dogs") ||
    text.includes("non-reactive to dogs") ||
    text.includes("slow and proper intro");

  const hasUnknownLine =
    text.includes("unknown behavior with dogs/cats/kids") ||
    text.includes("unknown behavior with dogs") ||
    text.includes("unknown with dogs");

  return hasPositiveDogContext && !text.includes("must be the only dog") && !text.includes("no dogs")
    ? { value: "may_do_well", note: hasUnknownLine ? "Bio has positive dog context, but source also says behavior is unknown." : "" }
    : null;
}

function hasPatientOwnerClue(bio) {
  const text = clean(bio).toLowerCase();
  const clues = [
    "timid",
    "needs encouragement",
    "inexperienced",
    "hasn’t had a lot of socialization",
    "hasn't had a lot of socialization",
    "needs time",
    "needs patience",
    "still learning",
    "world seems new and scary",
  ];

  return clues.some((clue) => text.includes(clue));
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

function buildBioTraitUpdates(dog, bio) {
  const updates = {};
  const logs = [];
  const dogClue = hasDogMayDoWellClue(bio);
  const patientOwnerClue = hasPatientOwnerClue(bio);

  if (dogClue) {
    if (!hasText(dog.bio_good_with_dogs) || dog.bio_good_with_dogs === "unknown") {
      updates.bio_good_with_dogs = dogClue.value;
      logs.push("estimated dog compatibility set: may_do_well");
    } else {
      logs.push(`skipped estimated dog compatibility; existing bio_good_with_dogs=${dog.bio_good_with_dogs}`);
    }
  }

  if (patientOwnerClue) {
    if (!hasText(dog.bio_first_time_friendly) || dog.bio_first_time_friendly === "unknown") {
      updates.bio_first_time_friendly = "no";
      logs.push("first-time/patient-owner clues found");
    } else {
      logs.push(
        `skipped first-time estimate; existing bio_first_time_friendly=${dog.bio_first_time_friendly}`
      );
    }
  }

  if (Object.keys(updates).length > 0) {
    updates.bio_traits_source = "dacc_sheltermanager_bio_rules";
    updates.bio_traits_updated_at = new Date().toISOString();
  }

  return { updates, logs };
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

function buildDaccRosterRequestBody() {
  return {
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
    },
  };
}

async function fetchRescueGroupsDaccRoster(apiKey, options = {}) {
  const roster = await fetchCompleteRescueGroupsRoster({
    apiUrl: RESCUEGROUPS_API_URL,
    apiKey,
    orgId: DACC_RESCUEGROUPS_ORG_ID,
    buildRequestBody: buildDaccRosterRequestBody,
    pageLimit: options.pageLimit || RESCUEGROUPS_PAGE_LIMIT,
    maxPages: options.maxPages || RESCUEGROUPS_MAX_PAGES,
    timeoutMs: options.timeoutMs || 30000,
    fetchImpl: options.fetchImpl || fetch,
  });

  if (!roster.staleMarkingAllowed) {
    throw new Error(`DACC recovery aborted: ${roster.quarantineReason || "roster is not usable"}.`);
  }

  return roster;
}

function rescueGroupsRosterById(roster) {
  return new Map(
    roster.animals.map((animal) => [
      String(animal.id),
      {
        rescueId: clean(animal.attributes?.rescueId),
        name: clean(animal.attributes?.name),
      },
    ])
  );
}

function indexShelterManagerByCode(animals) {
  const byCode = new Map();
  for (const animal of animals || []) {
    const code = clean(animal?.SHELTERCODE).toLowerCase();
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(animal);
  }
  return byCode;
}

function resolveShelterManagerMatch(rescueGroupsInfo, shelterManagerByCode) {
  const shelterCode = clean(rescueGroupsInfo?.rescueId);
  if (!shelterCode) {
    return { outcome: "no_match", shelterCode: null, animal: null };
  }

  const matches = shelterManagerByCode.get(shelterCode.toLowerCase()) || [];
  if (matches.length > 1) {
    return { outcome: "ambiguous_code", shelterCode, animal: null };
  }
  if (matches.length === 0) {
    return { outcome: "no_match", shelterCode, animal: null };
  }
  return { outcome: "exact_code", shelterCode, animal: matches[0] };
}

async function fetchDaccDogs(supabase) {
  const selectFields = (includeRecoveryTracking) => `
        id,
        rescuegroups_id,
        rescuegroups_org_id,
        adoptable,
        adoption_pending,
        availability_status,
        urgency_level,
        source,
        external_id,
        source_url,
        adoption_url,
        created_at,
        source_updated_at,
        ${includeRecoveryTracking ? "dacc_bio_recovery_status, dacc_bio_checked_at, dacc_bio_source_hash," : ""}
        ai_enriched_at,
        ai_enrichment_version,
        ai_enriched_source_hash,
        source_content_hash,
        bio_good_with_dogs,
        bio_good_with_cats,
        bio_good_with_kids,
        bio_potty_trained,
        bio_first_time_friendly,
        ${HASHED_FIELDS.join(",\n        ")}
      `;

  const buildQuery = (includeRecoveryTracking) => {
    let query = supabase
      .from("dogs")
      .select(selectFields(includeRecoveryTracking))
      .eq("source", "rescuegroups")
      .eq("rescuegroups_org_id", DACC_RESCUEGROUPS_ORG_ID)
      .order("created_at", { ascending: false });

    if (NAME_FILTER) query = query.ilike("name", `%${NAME_FILTER}%`);
    if (Number.isFinite(LIMIT) && LIMIT > 0) query = query.limit(LIMIT);
    return query;
  };

  let { data, error } = await buildQuery(true);

  if (!CONFIRMED && error && /dacc_bio_/i.test(error.message || "")) {
    console.log("Recovery tracking migration is not applied; dry-run fields default to null.");
    ({ data, error } = await buildQuery(false));
    data = (data || []).map((dog) => ({
      ...dog,
      dacc_bio_recovery_status: null,
      dacc_bio_checked_at: null,
      dacc_bio_source_hash: null,
    }));
  }
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function isCoarselyPublicRecoveryDog(dog) {
  if (dog?.adoptable !== true) return false;
  if (dog?.adoption_pending === true) return false;
  if (clean(dog?.urgency_level).toLowerCase() === "adopted") return false;
  return ACTIVE_AVAILABILITY_STATUSES.has(clean(dog?.availability_status).toLowerCase());
}

function getRecoveryCandidateDecision(dog, { now = new Date(), publiclyVisible = true } = {}) {
  if (!publiclyVisible || !isCoarselyPublicRecoveryDog(dog)) {
    return { eligible: false, reason: "not_public" };
  }

  const status = clean(dog.dacc_bio_recovery_status).toLowerCase();
  const generic = isGenericDescription(dog.description);
  const sourceUpdatedAt = parseTimestamp(dog.source_updated_at);
  const checkedAt = parseTimestamp(dog.dacc_bio_checked_at);
  const sourceChanged = sourceUpdatedAt !== null && (checkedAt === null || sourceUpdatedAt > checkedAt);

  if (status === "manual_conflict") {
    return { eligible: false, reason: "manual_conflict_review" };
  }

  if (status === "no_bio" && !elapsedAtLeast(dog.dacc_bio_checked_at, now, NO_BIO_RETRY_MS)) {
    return { eligible: false, reason: "no_bio_cooldown" };
  }

  if (generic) {
    if (["no_match", "fetch_failed", "parse_failed"].includes(status)) {
      return { eligible: true, reason: `retry_${status}` };
    }
    if (status === "no_bio") return { eligible: true, reason: "retry_no_bio" };
    return { eligible: true, reason: "generic_bio" };
  }

  if (!dog.dacc_bio_source_hash) {
    return { eligible: false, reason: "meaningful_bio_without_recovery_provenance" };
  }

  if (["fetch_failed", "parse_failed"].includes(status)) {
    return { eligible: true, reason: `retry_${status}` };
  }
  if (sourceChanged) return { eligible: true, reason: "rescuegroups_source_changed" };
  if (elapsedAtLeast(dog.dacc_bio_checked_at, now, RECOVERED_REFRESH_MS)) {
    return { eligible: true, reason: "periodic_refresh" };
  }

  return { eligible: false, reason: "current" };
}

function buildUpdate(dog, animal, bio, cautiousNote, options = {}) {
  const update = {};
  const replaceDescription = options.replaceDescription ?? isGenericDescription(dog.description);

  if (bio && replaceDescription && clean(dog.description) !== clean(bio)) {
    update.description = bio;
  }

  const traitUpdates = buildTraitUpdates(dog, animal);
  Object.assign(update, traitUpdates);

  const bioTraitResult = buildBioTraitUpdates(dog, bio);
  Object.assign(update, bioTraitResult.updates);

  if (cautiousNote && !hasText(dog.placement_note)) {
    update.placement_note = cautiousNote;
  }

  // Only stamp a fresh hash when something enrichment-relevant is actually
  // changing (mirrors the "nothing to write" skip below in main()) — this is
  // what lets scripts/enrich-dogs-ai.cjs pick up a DACC bio backfill as a
  // genuine content change without also flagging every untouched dog this
  // script scans past.
  if (Object.keys(update).length > 0) {
    update.source_content_hash = computeSourceContentHash(mergeHashedSnapshot(dog, update));
  }

  return { update, logs: bioTraitResult.logs };
}

function buildRecoveryAttemptUpdate(dog, result, checkedAt) {
  const statusOnly = {
    dacc_bio_recovery_status: result.outcome,
    dacc_bio_checked_at: checkedAt,
  };

  if (result.outcome !== "recovered") return statusOnly;

  return {
    ...result.update,
    dacc_bio_recovery_status: "recovered",
    dacc_bio_checked_at: checkedAt,
    dacc_bio_source_hash: result.bioHash,
  };
}

// Resolves a single dog against the ShelterManager match (if any) and builds
// its update, without touching Supabase. Extracted out of main()'s loop so
// the "no match" / "detail fetch failed" / "no bio" / "nothing to change"
// outcomes are independently testable — in particular so a ShelterManager
// request failure can be proven to never reach buildUpdate (and therefore
// never touch the dog's existing description) rather than just trusting the
// try/catch by inspection.
async function evaluateDogUpdate(dog, { animal, fetchTextImpl = fetchText } = {}) {
  if (!animal) {
    return { outcome: "no_match", update: null, logs: [], bio: null, url: null };
  }

  const url = detailUrl(animal.ID);
  let detailHtml = "";

  try {
    detailHtml = await fetchTextImpl(url);
  } catch (error) {
    return { outcome: "fetch_failed", update: null, logs: [], bio: null, url, error };
  }

  const detailBio = extractBioFromDetailHtml(detailHtml);
  const fallbackBio = extractBioFromAnimal(animal);
  const bio = detailBio || fallbackBio;
  if (!bio) {
    const detailMarkupPresent = /\badoptee-description\b/i.test(String(detailHtml || ""));
    return {
      outcome: detailMarkupPresent ? "no_bio" : "parse_failed",
      update: null,
      logs: [],
      bio: null,
      url,
    };
  }

  const bioHash = hashAuthoritativeBio(bio);
  const currentDescriptionHash = hashAuthoritativeBio(dog.description);
  const previousBioHash = clean(dog.dacc_bio_source_hash);
  if (
    previousBioHash &&
    !isGenericDescription(dog.description) &&
    currentDescriptionHash !== previousBioHash
  ) {
    return {
      outcome: "manual_conflict",
      update: null,
      logs: [],
      bio,
      bioHash,
      url,
    };
  }

  const replaceDescription =
    isGenericDescription(dog.description) ||
    (previousBioHash && currentDescriptionHash === previousBioHash && bioHash !== previousBioHash);
  const cautiousNote = extractCautiousNotes(bio);
  const { update, logs } = buildUpdate(dog, animal, bio, cautiousNote, {
    replaceDescription,
  });

  return {
    outcome: "recovered",
    update,
    logs,
    bio,
    bioHash,
    url,
  };
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

  const { isPubliclyVisibleDog } = await import("../src/lib/dogVisibility.js");
  const { getEnrichmentEligibilityReason } = require("./enrich-dogs-ai.cjs");
  const now = new Date();
  const checkedAt = now.toISOString();

  const [dogs, rescueGroupsRoster, shelterManagerAnimals] = await Promise.all([
    fetchDaccDogs(supabase),
    fetchRescueGroupsDaccRoster(rescueGroupsApiKey),
    fetchShelterManagerAnimals(),
  ]);
  const rescueGroupsById = rescueGroupsRosterById(rescueGroupsRoster);

  const shelterManagerByCode = indexShelterManagerByCode(shelterManagerAnimals);

  const summary = {
    completeRescueGroupsRoster: rescueGroupsRoster.count,
    rescueGroupsPages: rescueGroupsRoster.pages,
    shelterManagerRoster: shelterManagerAnimals.length,
    databaseDaccDogs: dogs.length,
    publicAdoptable: 0,
    candidates: 0,
    skippedCurrent: 0,
    skippedNotPublic: 0,
    skippedNotInCompleteRoster: 0,
    exactMatches: 0,
    ambiguousMatches: 0,
    nameMismatches: 0,
    recoverableBios: 0,
    noMatch: 0,
    noBio: 0,
    fetchFailed: 0,
    parseFailed: 0,
    manualConflicts: 0,
    projectedDbUpdates: 0,
    projectedEvidenceUpdates: 0,
    projectedAiCandidates: 0,
    retryLater: [],
    writeErrors: 0,
    written: 0,
  };

  for (const dog of dogs) {
    const publiclyVisible = isPubliclyVisibleDog(dog);
    if (publiclyVisible) summary.publicAdoptable += 1;

    if (!rescueGroupsRoster.authoritativeIds.has(String(dog.rescuegroups_id))) {
      summary.skippedNotInCompleteRoster += 1;
      continue;
    }

    const decision = getRecoveryCandidateDecision(dog, { now, publiclyVisible });
    if (!decision.eligible) {
      if (decision.reason === "not_public") summary.skippedNotPublic += 1;
      else summary.skippedCurrent += 1;
      continue;
    }

    summary.candidates += 1;

    const rescueGroupsInfo = rescueGroupsById.get(String(dog.rescuegroups_id));
    const match = resolveShelterManagerMatch(rescueGroupsInfo, shelterManagerByCode);
    const { shelterCode, animal } = match;
    const ambiguousCode = match.outcome === "ambiguous_code";

    if (ambiguousCode) summary.ambiguousMatches += 1;
    if (animal) {
      summary.exactMatches += 1;
      if (normalizeName(rescueGroupsInfo?.name) !== normalizeName(animal.ANIMALNAME)) {
        summary.nameMismatches += 1;
      }
    }

    const result = await evaluateDogUpdate(dog, { animal });
    const attemptUpdate = buildRecoveryAttemptUpdate(dog, result, checkedAt);
    const projectedDog = { ...dog, ...attemptUpdate };
    const projectedEligibility = getEnrichmentEligibilityReason(projectedDog);
    const plannedFields = Object.keys(attemptUpdate).filter(
      (key) => clean(attemptUpdate[key]) !== clean(dog[key])
    );
    const evidenceFields = plannedFields.filter(
      (key) => !["dacc_bio_recovery_status", "dacc_bio_checked_at", "dacc_bio_source_hash"].includes(key)
    );

    summary.projectedDbUpdates += plannedFields.length > 0 ? 1 : 0;
    summary.projectedEvidenceUpdates += evidenceFields.length > 0 ? 1 : 0;

    if (result.outcome === "no_match") {
      summary.noMatch += 1;
    } else if (result.outcome === "no_bio") {
      summary.noBio += 1;
    } else if (result.outcome === "fetch_failed") {
      summary.fetchFailed += 1;
    } else if (result.outcome === "parse_failed") {
      summary.parseFailed += 1;
    } else if (result.outcome === "manual_conflict") {
      summary.manualConflicts += 1;
    } else if (result.outcome === "recovered") {
      summary.recoverableBios += 1;
      if (projectedEligibility) summary.projectedAiCandidates += 1;
    }

    if (result.outcome !== "recovered") {
      summary.retryLater.push({
        name: dog.name,
        rescuegroupsId: String(dog.rescuegroups_id),
        rescueId: shelterCode || null,
        outcome: ambiguousCode ? "ambiguous_code" : result.outcome,
      });
    }

    console.log(
      JSON.stringify({
        dog: dog.name,
        dogId: dog.id,
        rescuegroupsId: String(dog.rescuegroups_id),
        rescueId: shelterCode || null,
        rescueGroupsName: rescueGroupsInfo?.name || null,
        trigger: decision.reason,
        identity: ambiguousCode ? "ambiguous_code" : animal ? "exact_sheltercode" : "no_match",
        shelterManagerId: animal?.ID || null,
        shelterManagerName: animal?.ANIMALNAME || null,
        nameConsistent: animal
          ? normalizeName(rescueGroupsInfo?.name) === normalizeName(animal.ANIMALNAME)
          : null,
        outcome: ambiguousCode ? "no_match_ambiguous_code" : result.outcome,
        bioLength: result.bio?.length || 0,
        bioHash: result.bioHash || null,
        plannedFields,
        projectedAiEligibility: projectedEligibility,
      })
    );

    result.logs?.forEach((message) => console.log(`  ${message}`));

    if (CONFIRMED) {
      const { error } = await supabase.from("dogs").update(attemptUpdate).eq("id", dog.id);
      if (error) {
        summary.writeErrors += 1;
        console.error(`Could not update ${dog.name}: ${error.message}`);
      } else {
        summary.written += 1;
      }
    }
  }

  console.log("");
  console.log("Summary:");
  console.log(JSON.stringify(summary, null, 2));

  if (summary.writeErrors > 0 || summary.fetchFailed > 0 || summary.parseFailed > 0) {
    throw new Error(
      `DACC recovery completed with failures (writes=${summary.writeErrors}, fetch=${summary.fetchFailed}, parse=${summary.parseFailed}).`
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("DACC bio enrichment failed.");
    console.error(error?.message || error);
    process.exit(1);
  });
}

module.exports = {
  NO_BIO_RETRY_MS,
  RECOVERED_REFRESH_MS,
  isGenericDescription,
  hashAuthoritativeBio,
  extractBioFromAnimal,
  extractBioFromDetailHtml,
  extractCautiousNotes,
  hasDogMayDoWellClue,
  hasPatientOwnerClue,
  buildTraitUpdates,
  buildBioTraitUpdates,
  buildUpdate,
  buildRecoveryAttemptUpdate,
  evaluateDogUpdate,
  fetchRescueGroupsDaccRoster,
  getRecoveryCandidateDecision,
  indexShelterManagerByCode,
  resolveShelterManagerMatch,
  detailUrl,
  htmlToText,
  removeBoilerplate,
};
