// scripts/enrich-dogs-ai.cjs
// AI dog trait enrichment using plain fetch instead of the OpenAI SDK.
//
// Writes:
// - dogs.ai_traits = full detailed JSON
// - dogs.bio_good_with_kids = yes / most_likely / may_do_well / no / unknown
// - dogs.bio_good_with_dogs = yes / most_likely / may_do_well / no / unknown
// - dogs.bio_good_with_cats = yes / most_likely / may_do_well / no / unknown
// - dogs.bio_first_time_friendly = yes / most_likely / may_do_well / no / unknown
// - dogs.bio_potty_trained = yes / most_likely / may_do_well / no / unknown
// - dogs.bio_energy_level = low / medium_low / medium / medium_high / high / unknown
// - dogs.bio_shedding_level = low / medium / high / unknown
// - dogs.bio_max_alone_hours = integer or null
// - dogs.bio_max_alone_hours_label = 1-2 / 3-4 / 5-6 / 7-8 / unknown
// - dogs.bio_exercise_needs = low / medium_low / medium / medium_high / high / unknown
// - dogs.bio_training_needs = low / medium_low / medium / medium_high / high / unknown
// - dogs.bio_barking_level = quiet / some / unknown (mirrors structured barking_level vocab)
// - dogs.bio_grooming_level = low / moderate / high / unknown (mirrors structured grooming_level vocab)
//
// IMPORTANT: bio_barking_level and bio_grooming_level are NEW columns that do not
// exist in the dogs table yet. Add them before running without --dry-run:
//   ALTER TABLE dogs ADD COLUMN IF NOT EXISTS bio_barking_level text;
//   ALTER TABLE dogs ADD COLUMN IF NOT EXISTS bio_grooming_level text;
//
// Run:
//   node scripts/enrich-dogs-ai.cjs --limit=1 --force
//   node scripts/enrich-dogs-ai.cjs --limit=25
//   node scripts/enrich-dogs-ai.cjs --limit=25 --force
//   node scripts/enrich-dogs-ai.cjs --limit=5 --dry-run   (calls OpenAI, prints results, writes nothing)

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");
const { getDogAvailabilitySignal } = require("./dog-availability.cjs");
const { HASHED_FIELDS } = require("./dog-enrichment-hash.cjs");

// Mirrors src/lib/dogVisibility.js isPubliclyVisibleDog (same logic already
// shipped in scripts/generate-dog-sitemap.cjs) — enrichment must only ever
// touch dogs that are actually public on the site, not just "adoptable".
const ACTIVE_STATUSES = new Set(["active", "available", "unknown"]);
const VERIFIED_CONFIDENCE = new Set(["current", "trusted", "verified"]);
const TRUSTED_EXTERNAL_ID_SOURCES = new Set(["rescuegroups"]);
const TRUSTED_LISTING_HOSTS = [
  "rescuegroups.org",
  "petfinder.com",
  "adoptapet.com",
  "shelterluv.com",
  "petango.com",
];

function cleanVisibilityValue(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function lowerVisibilityValue(value) {
  return cleanVisibilityValue(value).toLowerCase();
}

function hasReliableListingUrl(value) {
  const url = cleanVisibilityValue(value);
  if (!url.startsWith("https://")) return false;
  try {
    const { hostname } = new URL(url);
    return TRUSTED_LISTING_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function hasRescueGroupsIdentity(dog) {
  return Boolean(cleanVisibilityValue(dog?.rescuegroups_id) || cleanVisibilityValue(dog?.rescuegroups_org_id));
}

function hasTrustedSyncedSource(dog) {
  return (
    hasRescueGroupsIdentity(dog) ||
    (TRUSTED_EXTERNAL_ID_SOURCES.has(lowerVisibilityValue(dog?.source)) && Boolean(cleanVisibilityValue(dog?.external_id)))
  );
}

function hasVerifiedListingSource(dog) {
  const confidence = lowerVisibilityValue(dog?.source_confidence);
  const verified =
    dog?.verified === true || dog?.availability_verified === true || VERIFIED_CONFIDENCE.has(confidence);
  return verified && (hasReliableListingUrl(dog?.source_url) || hasReliableListingUrl(dog?.adoption_url));
}

function isPubliclyVisibleDog(dog) {
  if (!dog) return false;
  if (dog.adoptable !== true) return false;
  if (dog.adoption_pending === true) return false;
  if (lowerVisibilityValue(dog.urgency_level) === "adopted") return false;
  if (!ACTIVE_STATUSES.has(lowerVisibilityValue(dog.availability_status))) return false;
  if (getDogAvailabilitySignal(dog)) return false;
  return hasTrustedSyncedSource(dog) || hasVerifiedListingSource(dog);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const AI_ENRICHMENT_VERSION = "dog-ai-traits-v9";
const DEFAULT_LIMIT = 10;
const MODEL = "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const BIO_VALUES = new Set(["yes", "most_likely", "may_do_well", "no", "unknown"]);
const ENERGY_VALUES = new Set(["low", "medium_low", "medium", "medium_high", "high", "unknown"]);
const SHEDDING_VALUES = new Set(["low", "medium", "high", "unknown"]);
const BARKING_VALUES = new Set(["quiet", "some", "unknown"]);
const GROOMING_VALUES = new Set(["low", "moderate", "high", "unknown"]);
const ALONE_HOURS_LABELS = new Set(["1-2", "3-4", "5-6", "7-8", "unknown"]);

if (!SUPABASE_URL) throw new Error("Missing VITE_SUPABASE_URL in .env.local");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY in .env.local");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function cleanText(value, maxLength = 5000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function onlyTrue(value) {
  return value === true ? true : null;
}

function isClearlyPuppy({ ageYears, ageText }) {
  const text = String(ageText || "").toLowerCase();

  if (text.includes("puppy")) return true;

  // age_years is unreliable for some listings (observed cases store the raw
  // month count as if it were years, e.g. age_text "9 Months" with
  // age_years: 9). A months-only age_text with no "year" wording is a more
  // trustworthy puppy signal than age_years in that case, so it is checked
  // first.
  const monthMatch = text.match(/(\d+)\s*months?/);
  if (monthMatch && !text.includes("year")) {
    return Number(monthMatch[1]) < 18;
  }

  // Number(null) coerces to 0, which is finite — without the explicit
  // null/undefined check, every dog with a missing age_years would read
  // as "0 years old" and incorrectly test as a puppy here.
  const n = Number(ageYears);
  if (ageYears !== null && ageYears !== undefined && Number.isFinite(n)) return n < 1.5;

  return false;
}

function breedIncludesAny(breed, phrases) {
  const text = String(breed || "").toLowerCase();
  if (!text) return false;
  return phrases.some((phrase) => text.includes(phrase));
}

// ---------------------------------------------------------------------------
// Breed-based shedding estimation
// ---------------------------------------------------------------------------
// Breed text is split into components (see splitBreedComponents) and EVERY
// matching breed across every component is collected, not just the first one
// found in list order. That means a mixed-breed dog whose breed text names
// two breeds that disagree on shedding level gets a real weighted average
// instead of silently deferring to whichever breed happens to appear earlier
// in this file. Generic breed-GROUP labels (Retriever, Spaniel, Bulldog,
// Mountain Dog, Terrier, Hound, Shepherd) are only consulted for a component
// that does NOT itself name a specific breed (see matchBreedTiers) — so a
// generic alias embedded inside a specific breed's own name (e.g. "Retriever"
// inside "Golden Retriever") never counts as a second signal, but a generic
// label that appears as its own separate listed component (e.g. "Shepherd" in
// "Poodle / Shepherd / Mixed") still contributes. Generic signals always carry
// both lower confidence and lower signal weight than any specific named breed
// (see signalWeight below and combineShedding's weighted rank).
const SPECIFIC_BREED_SHEDDING_TIERS = [
  {
    level: "low",
    confidence: 0.78,
    label: "hairless/very-low-coat breed",
    breeds: ["hairless", "chinese crested", "xoloitzcuintli", "xolo", "peruvian inca orchid", "peruvian hairless"],
  },
  {
    level: "low",
    confidence: 0.66,
    label: "low-shedding curly/continuously-growing-coat breed",
    breeds: ["poodle", "bichon", "maltese", "shih tzu", "yorkshire terrier", "yorkie"],
  },
  {
    level: "high",
    confidence: 0.68,
    label: "double-coated breed commonly high-shedding",
    breeds: [
      "husky",
      "german shepherd",
      "golden retriever",
      "labrador",
      "akita",
      "great pyrenees",
      "samoyed",
      "bernese",
      "newfoundland",
      "shiba inu",
      "anatolian shepherd",
    ],
  },
  {
    // AKC rates Rottweiler shedding 3/5 ("moderate"), explicitly noted as
    // shedding significantly less than Golden Retriever/German Shepherd/
    // Husky, despite a similar general body type. Moved out of the "high"
    // bucket above after a breed-mapping audit found the two were not
    // equivalent.
    level: "medium",
    confidence: 0.62,
    label: "double-coated but AKC-documented as moderate (3/5), below German Shepherd/Husky/Golden Retriever",
    breeds: ["rottweiler"],
  },
  {
    level: "low",
    confidence: 0.58,
    label: "short single-coat breed commonly low-shedding",
    breeds: [
      "pit bull",
      "boxer",
      "chihuahua",
      "doberman",
      "greyhound",
      "american staffordshire terrier",
      "staffordshire bull terrier",
      "amstaff",
      "basenji",
      "pointer",
    ],
  },
  {
    // Breed sources describe Vizsla shedding as real and moderate
    // year-round despite the short coat — not minimal like the other
    // short-coated breeds above. Moved out of the "low" bucket after the
    // same audit.
    level: "medium",
    confidence: 0.5,
    label: "short-coated but breed sources document real, regular moderate shedding",
    breeds: ["vizsla"],
  },
  {
    // Breed sources describe regular, moderate-to-significant shedding for
    // Weimaraners (one source rates it 4/5) despite the short coat — not
    // minimal like the other short-coated breeds above. Moved out of the
    // "low" bucket after the same audit.
    level: "medium",
    confidence: 0.55,
    label: "short-coated but breed sources document real, regular moderate-to-significant shedding",
    breeds: ["weimaraner"],
  },
  {
    level: "medium",
    confidence: 0.56,
    label: "short/single-coated breed commonly moderate-shedding",
    breeds: ["beagle", "dachshund", "cocker spaniel", "catahoula", "plott hound"],
  },
].map((tier) => ({ ...tier, signalWeight: 1.0 }));

// Generic breed-GROUP labels. These genuinely vary shedding-wise from one
// specific breed to another within the group (e.g. wiry low-shed terriers
// vs. smooth moderate-shedding ones), so confidence is kept noticeably lower
// than any specific named breed above — Terrier and Hound in particular are
// given very low confidence rather than omitted entirely, since an honest
// low-confidence estimate is preferable to "unknown" for a trait this
// low-stakes (shedding is not a safety-sensitive compatibility claim).
const GENERIC_BREED_GROUP_SHEDDING_TIERS = [
  {
    level: "medium",
    confidence: 0.5,
    label: "generic shepherd-type breed label",
    breeds: ["shepherd"],
  },
  {
    level: "high",
    confidence: 0.5,
    label: "generic retriever-type breed label (most retriever breeds are double-coated, moderate-to-heavy shedders)",
    breeds: ["retriever"],
  },
  {
    level: "medium",
    confidence: 0.45,
    label: "generic spaniel-type breed label",
    breeds: ["spaniel"],
  },
  {
    level: "medium",
    confidence: 0.42,
    label: "generic bulldog-type breed label (sources disagree between low and moderate)",
    breeds: ["bulldog"],
  },
  {
    level: "high",
    confidence: 0.5,
    label: "generic mountain-dog-type breed label (most Mountain Dog breeds are heavy double-coated shedders)",
    breeds: ["mountain dog"],
  },
  {
    level: "medium",
    confidence: 0.35,
    label: "generic terrier-type breed label (shedding varies widely by terrier sub-type)",
    breeds: ["terrier"],
  },
  {
    level: "medium",
    confidence: 0.38,
    label: "generic hound-type breed label (shedding varies widely by hound sub-type)",
    breeds: ["hound"],
  },
].map((tier) => ({ ...tier, signalWeight: 0.5 }));

const SHEDDING_LEVEL_RANK = { low: 1, medium: 2, high: 3 };
const SHEDDING_RANK_LEVEL = { 1: "low", 2: "medium", 3: "high" };
const SHEDDING_CONFLICT_PENALTY = 0.75;
const MIN_COMBINED_SHEDDING_CONFIDENCE = 0.3;

// Breed strings from shelters/RescueGroups list parent breeds as separate
// "/"-delimited components, e.g. "Poodle (Standard) / Shepherd / Mixed" or
// "Golden Retriever Mix". Splitting into components (rather than substring-
// matching the whole string at once) is what lets a generic group like
// "Shepherd" be recognized as a genuinely separate named parent breed, while
// still never firing on a generic alias that's merely embedded inside a
// specific breed's own name (e.g. "Retriever" inside "Golden Retriever" is
// the SAME component, not a second one).
function splitBreedComponents(breedText) {
  const text = String(breedText || "").toLowerCase();
  if (!text) return [];

  return text
    .split("/")
    .map((part) =>
      part
        .replace(/\([^)]*\)/g, " ") // strip "(short coat)", "(standard)", etc.
        .replace(/\bmixed\b|\bmix\b|\bunknown\b/g, " ")
        .trim()
    )
    .filter(Boolean);
}

function matchComponentTiers(component, tiers) {
  const matches = [];
  for (const tier of tiers) {
    const matchedBreed = tier.breeds.find((phrase) => component.includes(phrase));
    if (matchedBreed) matches.push({ ...tier, matchedBreed });
  }
  return matches;
}

// Walks each listed breed component independently. A component that matches
// any specific named breed is recorded as a specific signal and is NEVER
// also checked against the generic groups (this is what stops "Golden
// Retriever" from being double-counted as generic "Retriever"). A component
// that matches no specific breed falls back to the generic groups, so a
// genuinely separate parent like "Shepherd" still contributes — just at its
// own lower confidence, not overriding any specific match. Every signal is
// deduped by (tier + matched breed phrase), so the same alias appearing
// twice in a breed string only ever counts once.
function matchBreedTiers(breedText) {
  const components = splitBreedComponents(breedText);
  if (components.length === 0) return [];

  const matches = [];
  const seenKeys = new Set();

  for (const component of components) {
    const specificForComponent = matchComponentTiers(component, SPECIFIC_BREED_SHEDDING_TIERS);
    const componentMatches =
      specificForComponent.length > 0
        ? specificForComponent
        : matchComponentTiers(component, GENERIC_BREED_GROUP_SHEDDING_TIERS);

    for (const match of componentMatches) {
      const key = `${match.level}:${match.confidence}:${match.matchedBreed}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      matches.push(match);
    }
  }

  return matches;
}

// Combines every matched breed tier into a single shedding estimate. When
// every matched breed agrees on the same level, behavior is unchanged from
// the old first-match-wins logic (same level, confidence = the best
// evidence found). When matched breeds disagree, the level is a rank
// average (rounded) across every match — weighted by how many named breeds
// landed on each level, not just the two extremes — and confidence is
// reduced (averaged, then discounted) to reflect genuine uncertainty about
// which parent's coat genes actually dominate.
function combineShedding(matches) {
  if (matches.length === 0) return null;

  const distinctLevels = new Set(matches.map((m) => m.level));

  if (distinctLevels.size === 1) {
    const [level] = distinctLevels;
    const confidence = Math.max(...matches.map((m) => m.confidence));
    const names = [...new Set(matches.map((m) => m.matchedBreed))].join(", ");
    return {
      value: level,
      confidence,
      evidence:
        matches.length > 1
          ? `Breed text names multiple breeds (${names}) that agree on ${level} shedding.`
          : `Breed/coat type (${names}) — ${matches[0].label}.`,
    };
  }

  // Rank is weighted by each signal's fixed SIGNAL WEIGHT (specific breed =
  // 1.0, generic breed group = 0.5) — a structural statement about how much
  // a named breed vs. a broad breed-group label should count toward the
  // level decision, completely independent of confidence. Confidence is a
  // separate, flat (unweighted) average below: it represents how certain the
  // estimate is, not how much say a signal gets over the level itself.
  const signalWeightSum = matches.reduce((sum, m) => sum + m.signalWeight, 0);
  const weightedRank =
    signalWeightSum > 0
      ? matches.reduce((sum, m) => sum + SHEDDING_LEVEL_RANK[m.level] * m.signalWeight, 0) / signalWeightSum
      : matches.reduce((sum, m) => sum + SHEDDING_LEVEL_RANK[m.level], 0) / matches.length;
  const combinedLevel = SHEDDING_RANK_LEVEL[Math.round(weightedRank)] || "medium";
  const avgConfidence = matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length;
  const combinedConfidence = Math.max(
    MIN_COMBINED_SHEDDING_CONFIDENCE,
    Math.round(avgConfidence * SHEDDING_CONFLICT_PENALTY * 100) / 100
  );
  const names = matches.map((m) => `${m.matchedBreed} (${m.level})`).join(", ");

  return {
    value: combinedLevel,
    confidence: combinedConfidence,
    evidence: `Breed text names multiple breeds with conflicting shedding tendencies (${names}); estimate is averaged across all named breeds and confidence is reduced accordingly.`,
  };
}

// Priority between specific breeds and generic groups is resolved per listed
// breed component inside matchBreedTiers() above (a component either names a
// specific breed, or — only if it doesn't — falls back to a generic group).
// A generic group can still end up alongside a specific breed here when they
// come from two DIFFERENT components (e.g. "Poodle / Shepherd Mix"), which is
// intentional: Shepherd there is a genuinely separate stated parent, not an
// alias of Poodle, so it should contribute its own (lower) signal rather
// than being silently dropped just because some other component was a
// specific breed.
function resolveBreedShedding(breed) {
  const matches = matchBreedTiers(breed);
  return combineShedding(matches);
}

// Some imports (observed on DACC listings) append an explicit coat-length
// annotation directly onto the breed string, e.g. "Pit Bull Terrier / Mixed
// (medium coat)". That's dog-specific source data and should outrank a
// generic breed-name-family guess (a "pit bull" is usually short-coated, but
// this specific dog's own listing says otherwise).
function explicitCoatLength(breed) {
  const match = String(breed || "").toLowerCase().match(/\((short|medium|long)\s*coat\)/);
  return match ? match[1] : null;
}

function descriptionContradictsBreedSize(description) {
  const text = String(description || "").toLowerCase();
  if (!text) return false;

  return [
    "stay small",
    "staying small",
    "will be small",
    "expected to be small",
    "expected to stay small",
    "won't get much bigger",
    "wont get much bigger",
    "runt of the litter",
    "small breed",
    "toy breed",
    "teacup",
    "lap dog",
  ].some((phrase) => text.includes(phrase));
}

function inferExpectedAdultSizeForPuppy(dogInput) {
  // Only for puppies with a genuinely missing source size. A shelter/API size
  // of any value (including Small/Medium) is a confirmed field and must never
  // be second-guessed by a breed heuristic.
  if (dogInput.size) return null;

  if (!isClearlyPuppy({ ageYears: dogInput.age_years, ageText: dogInput.age_text })) {
    return null;
  }

  // A description that explicitly suggests a small adult size overrides the
  // breed heuristic below rather than risk guessing against the listing.
  if (descriptionContradictsBreedSize(dogInput.description)) return null;

  const breed = dogInput.breed;

  if (
    breedIncludesAny(breed, [
      "great pyrenees",
      "mastiff",
      "great dane",
      "saint bernard",
      "st. bernard",
      "newfoundland",
      "bernese mountain dog",
      "anatolian shepherd",
      "cane corso",
      "irish wolfhound",
    ])
  ) {
    return "X-Large";
  }

  if (
    breedIncludesAny(breed, [
      "labrador retriever",
      "golden retriever",
      "german shepherd",
      "siberian husky",
      "boxer",
      "pit bull terrier",
      "rottweiler",
      "standard poodle",
      "australian shepherd",
    ])
  ) {
    return "Large";
  }

  if (
    breedIncludesAny(breed, [
      "chihuahua",
      "yorkie",
      "yorkshire terrier",
      "maltese",
      "shih tzu",
      "dachshund",
      "toy poodle",
    ])
  ) {
    return "Small";
  }

  if (
    breedIncludesAny(breed, [
      "beagle",
      "cocker spaniel",
      "border collie",
      "australian cattle dog",
    ])
  ) {
    return "Medium";
  }

  return null;
}

function asDogInput(dog) {
  const descriptionParts = [
    dog.description,
    dog.placement_note,
    Array.isArray(dog.qualities) && dog.qualities.length
      ? `Qualities: ${JSON.stringify(dog.qualities)}`
      : "",
    Array.isArray(dog.play_styles) && dog.play_styles.length
      ? `Play styles: ${JSON.stringify(dog.play_styles)}`
      : "",
  ].filter(Boolean);

  return {
    id: dog.id,
    name: dog.name || null,
    breed: dog.breed || null,
    gender: dog.gender || null,
    age_years: dog.age_years ?? null,
    age_text: dog.age_text || null,
    size: dog.size || null,
    current_energy_level: dog.energy_level || dog.activity_level || null,

    // Only pass TRUE fields as evidence.
    // In this database, false can mean “unknown/not listed.”
    current_good_with_kids: onlyTrue(dog.good_with_kids),
    current_good_with_dogs: onlyTrue(dog.good_with_dogs),
    current_good_with_cats: onlyTrue(dog.good_with_cats),
    current_good_with_small_animals: onlyTrue(dog.good_with_small_animals),
    current_potty_trained: onlyTrue(dog.potty_trained),
    current_first_time_friendly: onlyTrue(dog.first_time_friendly),
    current_hypoallergenic: onlyTrue(dog.hypoallergenic),

    current_shedding_level: dog.shedding_level || null,
    current_grooming_level: dog.grooming_level || null,
    current_barking_level: dog.barking_level || null,
    current_max_alone_hours: dog.max_alone_hours ?? null,
    shelter_name: dog.shelter_name || dog.shelters?.name || null,
    description: cleanText(descriptionParts.join("\n\n")),
  };
}

function buildPrompt(dogInput) {
  return `
You are helping structure dog adoption listing data for a dog matching website.

Extract likely matching traits from the provided dog listing.

Rules:
- Do not invent facts.
- If the listing does not mention something, use "unknown".
- If something is strongly implied but not guaranteed, use "likely".
- If something is somewhat implied or needs caveats, use "maybe".
- Existing boolean fields are only provided when true. Missing/null means unknown.
- Never claim good_with_kids, good_with_cats, good_with_dogs, potty_trained, or first_time_friendly unless there is evidence from the structured fields or rescue-provided bio.

Allowed values for boolean-like traits:
- "true" = directly stated or strongly confirmed by the rescue bio/structured field
- "likely" = strong bio evidence, but not worded as a formal guarantee
- "maybe" = some positive clue, caveat, slow intro, or limited exposure
- "false" = clearly not compatible or clearly not trained
- "unknown" = not enough info

Allowed values for energy_level, exercise_needs, and training_needs:
- "low"
- "medium_low"
- "medium"
- "medium_high"
- "high"
- "unknown"

Allowed values for shedding_level:
- "low"
- "medium"
- "high"
- "unknown"

Allowed values for barking_level:
- "quiet" (rarely barks, described as quiet or a light barker)
- "some" (normal/alert barking, vocal, talks a lot, barks at the door or other dogs)
- "unknown"

Allowed values for grooming_level:
- "low" (short/wash-and-go coat, minimal grooming mentioned)
- "moderate" (regular brushing, double coat, seasonal blowout)
- "high" (needs regular professional grooming, high-maintenance coat, mats easily)
- "unknown"

Max alone hours:
- Use max_alone_hours_estimate.value as an integer from 1 through 8 when there is usable evidence.
- Use null when there is not enough evidence.
- Do not estimate one to two hours merely because a dog is affectionate, senior, people-oriented, or enjoys companionship.
- Use one to two hours only with clear separation anxiety, panic/destruction when alone, severe crate distress, very young puppy needs, severe insecurity requiring constant support, frequent medical monitoring, or explicit should-not-be-left-long wording.
- Use three to four hours for mild separation concerns, a young dog still learning, moderate anxiety/adjustment needs, or wording that people should be home often without severe distress.
- Use five to six hours for a calm/low-energy adult or senior, a house-trained or crate-trained dog, a dog who settles independently, and no separation anxiety or destructive behavior evidence.
- Use seven to eight hours only for an adult/senior with strong evidence of comfort alone or a normal workday, independent settling, and no anxiety concerns.

Compatibility extraction rules:
- Use "true" when the bio directly says the dog is good with, gets along with, loves, lived with, or does well with that group.
- Use "likely" when the bio gives strong positive evidence but not a formal guarantee.
- Use "maybe" when the bio describes positive exposure with limits, such as respectful interactions, supervised meetings, slow introductions, proper introductions, or needing a compatible companion.
- Use "false" only when the bio clearly says no, not good with, cannot live with, chases aggressively, must be the only pet, no kids, no cats, or no dogs.
- Use "unknown" when the group is not mentioned.

Kids examples:
- "good with kids", "kid-friendly", "loves kids", "lived with children" => good_with_kids true.
- "respectful interactions with kids", "gentle with children", "loves 10 month old twins", "met kids and did well" => good_with_kids likely.
- "met kids once", "may do well with respectful kids" => good_with_kids maybe.
- "no kids", "adult-only home", "not good with children" => good_with_kids false.

Dogs examples:
- "good with dogs", "gets along with dogs", "does well with other dogs", "loves other dogs" => good_with_dogs true.
- "would love a dog companion", "needs a well-established dog", "enjoys the company of other dogs" => good_with_dogs likely.
- "does well with slow introductions", "proper introductions needed", "may do well with another dog" => good_with_dogs maybe.
- "only dog", "does not like other dogs", "reactive to dogs" => good_with_dogs false.

Cats examples:
- "lived with cats", "good with cats", "gets along with cats" => good_with_cats true.
- "has been around cats and did well" => good_with_cats likely.
- "does okay with cats but wants to chase", "may be okay with dog-savvy cats" => good_with_cats maybe.
- "no cats", "not cat safe", "will chase cats" => good_with_cats false.

Potty training examples:
- "potty trained", "house trained", "fully housebroken" => potty_trained true.
- "mostly potty trained", "doing well with potty training" => potty_trained likely.
- "working on potty training" => potty_trained maybe.
- "not potty trained" => potty_trained false.

First-time-friendly:
- First-time-friendly means likely manageable for someone who has never owned a dog before. It does not simply mean sweet, loving, gentle, or affectionate.
- "true" only when the bio explicitly says easy, beginner-friendly, great first dog, perfect family dog, low-maintenance, or gives very strong evidence of an easy dog with very few needs.
- "likely" only when the dog seems manageable for a normal first-time owner, has no major behavior/medical/training/lifestyle red flags, training needs are low/medium_low/medium, and the dog is not high complexity.
- "maybe" when the dog could work for a committed or patient first-time owner but has meaningful needs such as shyness, normal puppy/young-dog training, slow introductions, manageable medical care, specific home setup, dog/cat incompatibility without other major issues, or mild separation concerns.
- "false" with clear experienced-adopter/breed-experience/major behavior, medical, handling, training, fear, or lifestyle complexity.
- "unknown" when generic, copied, mismatched, or not enough behavior detail.
- "family", "great family dog", or "great addition to any family" must stay unknown by itself. Family language alone is not child-specific and is not first-time-owner evidence.

Other rules:
- Use description, breed, age_years, age_text, size, gender, activity_level, energy_level, qualities, and existing structured fields as evidence.
- Never overwrite or reinterpret confirmed shelter/API structured fields. Structured true fields are evidence; missing/null fields are unknown.
- Be conservative for compatibility fields like cats and kids. It is okay for good_with_cats and good_with_kids to stay unknown when there is no direct evidence.
- Be less conservative for lifestyle-fit fields. First-time friendliness, energy, exercise needs, training needs, and shedding should usually be inferable from breed, age, size, description, coat, and behavior notes.
- First-time friendliness should be based on overall needs. Use "false" for incontinence/cannot be housebroken, severe medical management, hospice, blind/deaf plus significant care needs, puppy mill survivor with fear of people, abuse history with fear/handling sensitivity, fearful of being picked up, experienced-owner needs, bite/aggression/reactivity language, resource guarding, escape artist, severe separation anxiety, child restrictions due to fear/behavior, very fearful/timid and still learning trust, may never enjoy touch/petting, requires another dog to function/confidence, severe leash/training issues, special handling needs, high training needs, or very high energy working breed with training needs.
- Use "maybe" for first-time friendliness when needs are meaningful but manageable: shy/timid at first but warms up, needs patience without severe red flags, moderate training needs, normal puppy/young dog needs, slow introductions, manageable medical needs, older-kids/calmer-home/specific-home setup, not good with dogs/cats but otherwise manageable, or some separation concerns that are not severe.
- Use "likely" for first-time friendliness only when the dog is described as easygoing, stable, gentle, friendly, affectionate, manageable, good houseguest, or good family dog AND has no major behavior/medical/training red flags AND training needs are low/medium_low/medium AND the dog is not high complexity. Sweet/loving/gentle alone is not enough when complex needs are present.
- Use "true" for first-time friendliness only when beginner/easy language is explicit or evidence is very strong, with no major red flags. If needs_human_review should be true, avoid "true" and be cautious with "likely".
- Estimate energy_level from activity_level/energy_level first when present, then from bio language. Do not leave energy unknown when there is clear activity or temperament evidence.
- Puppies and young dogs should usually be at least medium unless the bio says calm. Working, herding, sporting, hound, shepherd, lab, husky, and active breeds should usually be medium_high or high unless the bio says otherwise. Seniors should usually be low or medium_low unless the bio says energetic.
- Estimate shedding cautiously from breed/coat. Poodle/Bichon-type coats may be low unless mixed/unclear. Husky, German Shepherd, Golden Retriever, Labrador, Akita, and similar breeds are likely higher shedding. Short-coated breeds like Pit Bull Terrier, Boxer, Chihuahua, and Beagle are often low to medium. Unknown mixed breed should stay unknown unless breed or coat gives enough signal.
- Estimate barking_level cautiously and mostly from direct bio language (vocal, talkative, alert barker, watchdog, quiet, rarely barks). Do not guess barking_level from breed alone; leave unknown when the bio gives no vocalization evidence.
- Estimate grooming_level from breed/coat type in the same cautious way as shedding. Poodle/Bichon/Maltese/Shih Tzu/Yorkie-type coats usually need high grooming despite low shedding. Double-coated breeds (Husky, German Shepherd, Golden Retriever, Akita, Great Pyrenees, Samoyed, Newfoundland, Bernese) usually need moderate grooming. Short-coated breeds (Pit Bull Terrier, Boxer, Chihuahua, Doberman, Greyhound) usually need low grooming. Leave unknown for unclear mixed breeds with no coat description.
- Estimate exercise_needs from energy, age, breed, and bio language.
- Estimate training_needs from training progress, manners, leash reactivity, anxiety/fear, puppy age, experienced-adopter language, and bio behavior needs. Avoid unknown unless there is no meaningful information.
- "research the breed before applying" should lower confidence and suggest review, but it should not erase specific compatibility evidence about kids, dogs, or cats.
- Do not include the dog's name in ideal_home_summary.
- If listing is generic, copied, mismatched, or too thin, make ideal_home_summary empty and set needs_human_review true.
- Return JSON only.

Return exactly this JSON shape:
{
  "energy_level": { "value": "unknown", "confidence": 0, "evidence": "" },
  "shedding_level": { "value": "unknown", "confidence": 0, "evidence": "" },
  "barking_level": { "value": "unknown", "confidence": 0, "evidence": "" },
  "grooming_level": { "value": "unknown", "confidence": 0, "evidence": "" },
  "good_with_kids": { "value": "unknown", "confidence": 0, "evidence": "" },
  "good_with_dogs": { "value": "unknown", "confidence": 0, "evidence": "" },
  "good_with_cats": { "value": "unknown", "confidence": 0, "evidence": "" },
  "good_with_small_animals": { "value": "unknown", "confidence": 0, "evidence": "" },
  "potty_trained": { "value": "unknown", "confidence": 0, "evidence": "" },
  "crate_trained": { "value": "unknown", "confidence": 0, "evidence": "" },
  "leash_trained": { "value": "unknown", "confidence": 0, "evidence": "" },
  "first_time_friendly": { "value": "unknown", "confidence": 0, "evidence": "" },
  "apartment_friendly": { "value": "unknown", "confidence": 0, "evidence": "" },
  "needs_yard": { "value": "unknown", "confidence": 0, "evidence": "" },
  "can_be_left_alone": { "value": "unknown", "confidence": 0, "evidence": "" },
  "max_alone_hours_estimate": { "value": null, "confidence": 0, "evidence": "" },
  "exercise_needs": { "value": "unknown", "confidence": 0, "evidence": "" },
  "training_needs": { "value": "unknown", "confidence": 0, "evidence": "" },
  "home_environment": { "value": "unknown", "confidence": 0, "evidence": "" },
  "affection_level": { "value": "unknown", "confidence": 0, "evidence": "" },
  "playfulness": { "value": "unknown", "confidence": 0, "evidence": "" },
  "shyness": { "value": "unknown", "confidence": 0, "evidence": "" },
  "anxiety_or_fear": { "value": "unknown", "confidence": 0, "evidence": "" },
  "ideal_home_summary": "",
  "match_tags": [],
  "caution_notes": [],
  "overall_confidence": 0,
  "needs_human_review": false
}

Dog listing:
${JSON.stringify(dogInput, null, 2)}
`.trim();
}

function normalizeConfidence(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeTraitValue(value, fallbackValue = "unknown") {
  if (value === true) return "true";
  if (value === false) return "false";

  const raw = String(value ?? fallbackValue).trim().toLowerCase();

  if (["true", "likely", "maybe", "false", "unknown"].includes(raw)) return raw;

  // Some models accidentally use display-ish words.
  if (raw === "yes") return "true";
  if (raw === "most_likely" || raw === "most likely") return "likely";
  if (raw === "may_do_well" || raw === "may do well") return "maybe";
  if (raw === "no") return "false";

  return fallbackValue;
}

function normalizeTraitObject(obj, fallbackValue = "unknown") {
  if (!obj || typeof obj !== "object") {
    return { value: fallbackValue, confidence: 0, evidence: "" };
  }

  return {
    ...obj,
    value: normalizeTraitValue(obj.value, fallbackValue),
    confidence: normalizeConfidence(obj.confidence),
    evidence: typeof obj.evidence === "string" ? obj.evidence.slice(0, 280) : "",
  };
}

function normalizeEnergyLikeValue(value, fallbackValue = "unknown") {
  const raw = String(value ?? fallbackValue).trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (!raw || raw === "unknown") return "unknown";

  if (["low", "medium_low", "medium", "medium_high", "high"].includes(raw)) return raw;
  if (["moderate", "average"].includes(raw)) return "medium";
  if (["moderately_low", "low_medium", "low_to_medium"].includes(raw)) return "medium_low";
  if (["moderately_high", "medium_to_high", "high_medium"].includes(raw)) return "medium_high";
  if (raw.includes("very_active") || raw.includes("very_high")) return "high";
  if (raw.includes("slightly_active")) return "medium_low";
  if (raw.includes("calm") || raw.includes("couch_potato")) return "low";
  if (raw.includes("moderate") || raw.includes("medium")) return "medium";
  if (raw.includes("high")) return "high";
  if (raw.includes("low")) return "low";

  return fallbackValue;
}

function normalizeEnergyLikeTraitObject(obj, fallbackValue = "unknown") {
  if (!obj || typeof obj !== "object") {
    return { value: fallbackValue, confidence: 0, evidence: "" };
  }

  return {
    ...obj,
    value: normalizeEnergyLikeValue(obj.value, fallbackValue),
    confidence: normalizeConfidence(obj.confidence),
    evidence: typeof obj.evidence === "string" ? obj.evidence.slice(0, 280) : "",
  };
}

function normalizeSheddingValue(value, fallbackValue = "unknown") {
  const raw = String(value ?? fallbackValue).trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (!raw || raw === "unknown") return "unknown";
  if (["low", "medium", "high"].includes(raw)) return raw;
  if (raw === "minimal" || raw === "very_low") return "low";
  if (raw === "moderate" || raw === "average") return "medium";
  if (raw === "heavy" || raw === "very_high") return "high";
  return fallbackValue;
}

function normalizeSheddingTraitObject(obj, fallbackValue = "unknown") {
  if (!obj || typeof obj !== "object") {
    return { value: fallbackValue, confidence: 0, evidence: "" };
  }

  return {
    ...obj,
    value: normalizeSheddingValue(obj.value, fallbackValue),
    confidence: normalizeConfidence(obj.confidence),
    evidence: typeof obj.evidence === "string" ? obj.evidence.slice(0, 280) : "",
  };
}

function normalizeBarkingValue(value, fallbackValue = "unknown") {
  const raw = String(value ?? fallbackValue).trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (!raw || raw === "unknown") return "unknown";
  if (["quiet", "some"].includes(raw)) return raw;
  if (["low"].includes(raw)) return "quiet";
  if (["moderate", "medium", "high", "vocal", "frequent"].includes(raw)) return "some";
  return fallbackValue;
}

function normalizeBarkingTraitObject(obj, fallbackValue = "unknown") {
  if (!obj || typeof obj !== "object") {
    return { value: fallbackValue, confidence: 0, evidence: "" };
  }

  return {
    ...obj,
    value: normalizeBarkingValue(obj.value, fallbackValue),
    confidence: normalizeConfidence(obj.confidence),
    evidence: typeof obj.evidence === "string" ? obj.evidence.slice(0, 280) : "",
  };
}

function normalizeGroomingValue(value, fallbackValue = "unknown") {
  const raw = String(value ?? fallbackValue).trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (!raw || raw === "unknown") return "unknown";
  if (["low", "moderate", "high"].includes(raw)) return raw;
  if (raw === "none" || raw === "minimal" || raw === "not_required") return "low";
  if (raw === "medium" || raw === "average") return "moderate";
  return fallbackValue;
}

function normalizeGroomingTraitObject(obj, fallbackValue = "unknown") {
  if (!obj || typeof obj !== "object") {
    return { value: fallbackValue, confidence: 0, evidence: "" };
  }

  return {
    ...obj,
    value: normalizeGroomingValue(obj.value, fallbackValue),
    confidence: normalizeConfidence(obj.confidence),
    evidence: typeof obj.evidence === "string" ? obj.evidence.slice(0, 280) : "",
  };
}

function normalizeNumericTraitObject(obj) {
  if (!obj || typeof obj !== "object") {
    return { value: null, confidence: 0, evidence: "" };
  }

  const n = Number(obj.value);

  return {
    ...obj,
    value: Number.isFinite(n) && n >= 0 ? n : null,
    confidence: normalizeConfidence(obj.confidence),
    evidence: typeof obj.evidence === "string" ? obj.evidence.slice(0, 280) : "",
  };
}

function safeParseJson(text) {
  const raw = String(text || "").trim();

  try {
    return JSON.parse(raw);
  } catch {}

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");

  if (first >= 0 && last > first) {
    return JSON.parse(raw.slice(first, last + 1));
  }

  throw new Error(`Could not parse AI JSON: ${raw.slice(0, 300)}`);
}

function containsDifferentDogName(text, currentName) {
  const haystack = String(text || "").toLowerCase();
  const dogNameLower = String(currentName || "").toLowerCase();

  if (!haystack || !dogNameLower) return false;

  const knownNames = [
    "shelby",
    "sheba",
    "koda",
    "reyna",
    "blu",
    "ace",
    "zaria",
    "romeo",
    "louis",
    "monte",
    "cota",
    "penny",
    "stormi",
    "noelle",
    "artemis",
    "smokey",
  ];

  return knownNames.some((name) => {
    if (!name || name === dogNameLower) return false;
    return haystack.includes(`${name} is`) || haystack.includes(`${name}'s`);
  });
}

function normalizeAiTraits(parsed, dogInput) {
  const normalized = {
    energy_level: normalizeEnergyLikeTraitObject(parsed.energy_level),
    shedding_level: normalizeSheddingTraitObject(parsed.shedding_level),
    barking_level: normalizeBarkingTraitObject(parsed.barking_level),
    grooming_level: normalizeGroomingTraitObject(parsed.grooming_level),
    good_with_kids: normalizeTraitObject(parsed.good_with_kids),
    good_with_dogs: normalizeTraitObject(parsed.good_with_dogs),
    good_with_cats: normalizeTraitObject(parsed.good_with_cats),
    good_with_small_animals: normalizeTraitObject(parsed.good_with_small_animals),
    potty_trained: normalizeTraitObject(parsed.potty_trained),
    crate_trained: normalizeTraitObject(parsed.crate_trained),
    leash_trained: normalizeTraitObject(parsed.leash_trained),
    first_time_friendly: normalizeTraitObject(parsed.first_time_friendly),
    apartment_friendly: normalizeTraitObject(parsed.apartment_friendly),
    needs_yard: normalizeTraitObject(parsed.needs_yard),
    can_be_left_alone: normalizeTraitObject(parsed.can_be_left_alone),
    max_alone_hours_estimate: normalizeNumericTraitObject(parsed.max_alone_hours_estimate),
    exercise_needs: normalizeEnergyLikeTraitObject(parsed.exercise_needs),
    training_needs: normalizeEnergyLikeTraitObject(parsed.training_needs),
    home_environment: normalizeTraitObject(parsed.home_environment),
    affection_level: normalizeTraitObject(parsed.affection_level),
    playfulness: normalizeTraitObject(parsed.playfulness),
    shyness: normalizeTraitObject(parsed.shyness),
    anxiety_or_fear: normalizeTraitObject(parsed.anxiety_or_fear),

    ideal_home_summary: cleanText(parsed.ideal_home_summary, 500),

    match_tags: Array.isArray(parsed.match_tags)
      ? parsed.match_tags.map((x) => cleanText(x, 60)).filter(Boolean).slice(0, 10)
      : [],

    caution_notes: Array.isArray(parsed.caution_notes)
      ? parsed.caution_notes.map((x) => cleanText(x, 160)).filter(Boolean).slice(0, 8)
      : [],

    overall_confidence: normalizeConfidence(parsed.overall_confidence),
    needs_human_review: Boolean(parsed.needs_human_review),

    source: {
      type: "ai_description_extraction",
      version: AI_ENRICHMENT_VERSION,
      model: MODEL,
      dog_id: dogInput.id,
      dog_name: dogInput.name,
      enriched_at: new Date().toISOString(),
    },
  };

  const bio = String(dogInput.description || "").toLowerCase();
  const description = String(dogInput.description || "");
  const descriptionLower = description.toLowerCase();

  function strengthenTraitFromBio(key, value, confidence, evidence) {
    const current = normalized[key] || { value: "unknown", confidence: 0, evidence: "" };
    const currentConfidence = Number(current.confidence || 0);
    const currentValue = normalizeTraitValue(current.value);

    if (currentValue === "true" && currentConfidence >= confidence) return;
    if (currentValue === "false" && currentConfidence >= confidence) return;

    const valueRank = { unknown: 0, maybe: 1, likely: 2, true: 3, false: 4 };
    const nextRank = valueRank[value] ?? 0;
    const currentRank = valueRank[currentValue] ?? 0;

    if (nextRank > currentRank || confidence > currentConfidence) {
      normalized[key] = {
        value,
        confidence: Math.max(currentConfidence, confidence),
        evidence,
      };
    }
  }

  function includesAny(phrases) {
    return phrases.some((phrase) => bio.includes(phrase));
  }

  function hasChildSpecificEvidence() {
    return (
      /\b(kid|kids|kiddo|kiddos|child|children|toddler|toddlers|baby|babies|infant|infants|teen|teens|teenager|teenagers)\b/.test(bio) ||
      includesAny([
        "family with kids",
        "families with kids",
        "family with children",
        "families with children",
        "young ones",
        "little ones",
      ])
    );
  }

  function hasCatSpecificEvidence() {
    return /\b(cat|cats|kitten|kittens|kitty|kitties|feline)\b/.test(bio);
  }

  // A bare "dog"/"dogs" keyword check would fire on nearly every listing
  // (the profile itself is about a dog), so this specifically requires
  // language about OTHER dogs / multi-dog context rather than the word alone.
  function hasOtherDogSpecificEvidence() {
    return (
      includesAny([
        "other dog",
        "other dogs",
        "another dog",
        "dog friend",
        "dog companion",
        "dog park",
        "canine companion",
        "foster sibling",
        "foster siblings",
        "doggie friend",
        "housemate",
        "playmate",
        "well with dogs",
        "with other dogs",
        "around dogs",
        "around other dogs",
        "gets along with dogs",
        "good with dogs",
        "dog savvy",
        "dog-savvy",
      ]) || /\bsiblings?\b/.test(bio)
    );
  }

  // age_years is frequently null for listings that only give a free-text
  // age like "12 Years 1 Month" (common on DACC/rescue listings). Parse
  // that into a numeric age before falling back to literal word checks,
  // otherwise ageStage() below silently returns "unknown" for an
  // unambiguously senior dog, which then blocks every stage-gated
  // estimate (alone time, energy, first-time-friendly, etc.) from ever
  // firing for that dog.
  function ageYearsFromText(ageText) {
    const text = String(ageText || "").toLowerCase().trim();
    if (!text) return null;

    const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*years?/);
    const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*months?/);
    const weekMatch = text.match(/(\d+(?:\.\d+)?)\s*weeks?/);
    const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*days?/);
    if (!yearMatch && !monthMatch && !weekMatch && !dayMatch) return null;

    const years = Number(yearMatch?.[1] || 0);
    const months = Number(monthMatch?.[1] || 0);
    const weeks = Number(weekMatch?.[1] || 0);
    const days = Number(dayMatch?.[1] || 0);
    return years + months / 12 + weeks / 52 + days / 365;
  }

  function ageStage() {
    // Number(null) coerces to 0, which is finite — without the explicit
    // null/undefined check below, every dog with a missing age_years
    // would read as "0 years old" and be miscategorized as a puppy.
    const n = Number(dogInput.age_years);
    if (dogInput.age_years !== null && dogInput.age_years !== undefined && Number.isFinite(n)) {
      if (n < 1.5) return "puppy";
      if (n < 3) return "young";
      if (n >= 7) return "senior";
      return "adult";
    }

    const parsedYears = ageYearsFromText(dogInput.age_text);
    if (parsedYears !== null) {
      if (parsedYears < 1.5) return "puppy";
      if (parsedYears < 3) return "young";
      if (parsedYears >= 7) return "senior";
      return "adult";
    }

    const text = String(dogInput.age_text || "").toLowerCase();
    if (text.includes("puppy")) return "puppy";
    if (text.includes("young")) return "young";
    if (text.includes("senior")) return "senior";
    if (text.includes("adult")) return "adult";
    return "unknown";
  }

  function isWorkingHerdingSportingBreed() {
    return breedIncludesAny(dogInput.breed, [
      "australian cattle dog",
      "australian shepherd",
      "belgian malinois",
      "border collie",
      "cattle dog",
      "collie",
      "german shepherd",
      "shepherd",
      "husky",
      "siberian husky",
      "akita",
      "retriever",
      "labrador",
      "golden",
      "pointer",
      "hound",
      "coonhound",
      "beagle",
      "weimaraner",
      "vizsla",
      "terrier",
    ]);
  }

  function hasMajorFirstTimeRedFlag() {
    return includesAny([
      "incontinent",
      "incontinence",
      "cannot be housebroken",
      "cannot be fully housebroken",
      "cannot become housebroken",
      "can't be housebroken",
      "can't be fully housebroken",
      "can not be housebroken",
      "will never be housebroken",
      "severe medical",
      "medical management",
      "significant medical",
      "complex medical",
      "lots of needs",
      "lot of needs",
      "hospice",
      "blind and deaf with",
      "deaf and blind with",
      "puppy mill survivor",
      "fear of people",
      "afraid of people",
      "abuse history",
      "abused",
      "fearful of being picked up",
      "does not like to be picked up",
      "doesn't like to be picked up",
      "handling sensitivity",
      "special handling",
      "experienced owner",
      "experienced adopter",
      "experienced dog owner",
      "breed experience",
      "severe fear",
      "very fearful",
      "extremely fearful",
      "very timid",
      "extremely timid",
      "still learning to trust",
      "learning people are safe",
      "shut down",
      "may never enjoy touch",
      "may never enjoy petting",
      "may never like pets",
      "requires another dog",
      "needs another dog",
      "needs a dog friend",
      "needs another dog friend",
      "needs a confident dog",
      "requires a confident dog",
      "resource guarding",
      "guards food",
      "guards toys",
      "dog reactive",
      "cat reactive",
      "reactive to dogs",
      "reactive to cats",
      "separation anxiety",
      "severe separation anxiety",
      "escape artist",
      "climbs fences",
      "jumps fences",
      "severe leash",
      "leash reactive",
      "severe training",
      "major structure",
      "needs structure",
      "bite history",
      "has bitten",
      "bite risk",
      "aggression",
      "aggressive",
      "not good with children",
      "no kids",
      "no children",
      "adult-only home",
      "adult only home",
      "teens only",
      "older kids only",
      "not for first time",
      "not for a first time",
      "not for first-time",
      "not for a first-time",
    ]);
  }

  function hasHighComplexityNeeds() {
    const trainingNeeds = normalizeEnergyLikeValue(normalized.training_needs?.value);
    const energyValue = normalizeEnergyLikeValue(normalized.energy_level?.value);

    return (
      trainingNeeds === "medium_high" ||
      trainingNeeds === "high" ||
      hasMajorFirstTimeRedFlag() ||
      includesAny([
        "special needs",
        "special care",
        "daily medication",
        "medications",
        "ongoing medical",
        "medical needs",
        "mobility issues",
        "neurological",
        "diabetes",
        "seizures",
        "heartworm",
        "fearful",
        "timid",
        "wary of new people",
        "cautious with new people",
        "assertive",
        "needs lots of patience",
        "needs a lot of patience",
        "not good with dogs",
        "not good with cats",
        "only dog",
        "must be the only dog",
      ]) ||
      (energyValue === "high" &&
        isWorkingHerdingSportingBreed() &&
        includesAny(["needs training", "working on manners", "needs structure", "leash"]))
    );
  }

  function hasMildManageableNeeds() {
    return includesAny([
      "timid but gentle",
      "shy but sweet",
      "shy at first",
      "needs patience",
      "patient adopter",
      "slow introductions",
      "slow intro",
      "needs time to warm up",
      "warms up",
      "cautious with new people",
      "wary of new people",
      "working on manners",
      "working on leash manners",
      "young dog",
      "moderate energy",
      "medium energy",
      "older kids",
      "older children",
      "calmer home",
      "quiet home",
      "specific home",
      "medical needs",
      "manageable medical",
      "not good with dogs",
      "not good with cats",
      "no cats",
      "some separation",
    ]);
  }

  function hasExplicitEasyBeginnerSignals() {
    return includesAny([
      "easygoing",
      "easy going",
      "easy dog",
      "easy pup",
      "beginner friendly",
      "beginner-friendly",
      "great first dog",
      "perfect first dog",
      "good first dog",
      "great for a first time owner",
      "great for a first-time owner",
      "perfect family dog",
      "low maintenance",
      "low-maintenance",
    ]);
  }

  function hasEasyStableSignals() {
    return includesAny([
      "easygoing",
      "easy going",
      "easy dog",
      "manageable",
      "good houseguest",
      "stable",
      "gentle",
      "calm",
      "laid back",
      "laid-back",
      "affectionate",
      "friendly",
      "good family dog",
      "great family dog",
      "perfect family dog",
      "crate trained",
      "crate-trained",
      "potty trained",
      "house trained",
      "housebroken",
      "walks well",
      "walks nicely",
      "good on leash",
      "knows basic commands",
      "knows commands",
      "good with dogs",
      "good with cats",
      "good with kids",
      "loves people",
      "people friendly",
    ]);
  }

  function hasWarmTemperamentOnly() {
    return includesAny(["sweet", "loving", "love bug", "snuggly", "cuddly", "affectionate", "gentle"]) &&
      !hasExplicitEasyBeginnerSignals() &&
      !includesAny([
        "crate trained",
        "crate-trained",
        "potty trained",
        "house trained",
        "housebroken",
        "walks well",
        "walks nicely",
        "good on leash",
        "knows basic commands",
        "knows commands",
        "good houseguest",
        "manageable",
        "stable",
      ]);
  }

  function setEnergy(value, confidence, evidence, force = false) {
    const normalizedValue = normalizeEnergyLikeValue(value);
    if (!ENERGY_VALUES.has(normalizedValue) || normalizedValue === "unknown") return;

    const currentConfidence = Number(normalized.energy_level?.confidence || 0);
    const currentValue = normalizeEnergyLikeValue(normalized.energy_level?.value);

    if (!force && currentValue === normalizedValue && currentConfidence >= confidence) return;
    if (!force && currentValue !== "unknown" && currentValue !== normalizedValue && currentConfidence > confidence) return;

    normalized.energy_level = {
      value: normalizedValue,
      confidence: force ? confidence : Math.max(currentConfidence, confidence),
      evidence,
    };
  }

  function setEnergyLikeTrait(key, value, confidence, evidence, force = false) {
    const normalizedValue = normalizeEnergyLikeValue(value);
    if (!ENERGY_VALUES.has(normalizedValue) || normalizedValue === "unknown") return;

    const currentConfidence = Number(normalized[key]?.confidence || 0);
    const currentValue = normalizeEnergyLikeValue(normalized[key]?.value);

    if (!force && currentValue === normalizedValue && currentConfidence >= confidence) return;
    if (!force && currentValue !== "unknown" && currentValue !== normalizedValue && currentConfidence > confidence) return;

    normalized[key] = {
      value: normalizedValue,
      confidence: force ? confidence : Math.max(currentConfidence, confidence),
      evidence,
    };
  }

  function setShedding(value, confidence, evidence, force = false) {
    const normalizedValue = normalizeSheddingValue(value);
    if (!SHEDDING_VALUES.has(normalizedValue) || normalizedValue === "unknown") return;

    const currentConfidence = Number(normalized.shedding_level?.confidence || 0);
    const currentValue = normalizeSheddingValue(normalized.shedding_level?.value);

    if (!force && currentValue === normalizedValue && currentConfidence >= confidence) return;
    if (!force && currentValue !== "unknown" && currentValue !== normalizedValue && currentConfidence > confidence) return;

    normalized.shedding_level = {
      value: normalizedValue,
      confidence: force ? confidence : Math.max(currentConfidence, confidence),
      evidence,
    };
  }

  function setBarking(value, confidence, evidence, force = false) {
    const normalizedValue = normalizeBarkingValue(value);
    if (!BARKING_VALUES.has(normalizedValue) || normalizedValue === "unknown") return;

    const currentConfidence = Number(normalized.barking_level?.confidence || 0);
    const currentValue = normalizeBarkingValue(normalized.barking_level?.value);

    if (!force && currentValue === normalizedValue && currentConfidence >= confidence) return;
    if (!force && currentValue !== "unknown" && currentValue !== normalizedValue && currentConfidence > confidence) return;

    normalized.barking_level = {
      value: normalizedValue,
      confidence: force ? confidence : Math.max(currentConfidence, confidence),
      evidence,
    };
  }

  function setGrooming(value, confidence, evidence, force = false) {
    const normalizedValue = normalizeGroomingValue(value);
    if (!GROOMING_VALUES.has(normalizedValue) || normalizedValue === "unknown") return;

    const currentConfidence = Number(normalized.grooming_level?.confidence || 0);
    const currentValue = normalizeGroomingValue(normalized.grooming_level?.value);

    if (!force && currentValue === normalizedValue && currentConfidence >= confidence) return;
    if (!force && currentValue !== "unknown" && currentValue !== normalizedValue && currentConfidence > confidence) return;

    normalized.grooming_level = {
      value: normalizedValue,
      confidence: force ? confidence : Math.max(currentConfidence, confidence),
      evidence,
    };
  }

  function setTraitFromBio(key, value, confidence, evidence) {
    normalized[key] = {
      value,
      confidence,
      evidence,
    };
  }

  function setNumericTraitFromBio(key, value, confidence, evidence) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;

    normalized[key] = {
      value: n,
      confidence,
      evidence,
    };
  }

  const existingEnergy = normalizeEnergyLikeValue(dogInput.current_energy_level);
  const aiEnergy = normalizeEnergyLikeValue(normalized.energy_level?.value);
  const stage = ageStage();

  if (aiEnergy === "unknown") {
    normalized.energy_level = {
      value: "unknown",
      confidence: 0,
      evidence: normalized.energy_level?.evidence || "",
    };
  }

  if (existingEnergy !== "unknown") {
    setEnergy(
      existingEnergy,
      0.82,
      `Existing structured energy level is ${existingEnergy}.`
    );
    setEnergyLikeTrait(
      "exercise_needs",
      existingEnergy,
      0.72,
      `Exercise needs inferred from structured energy level ${existingEnergy}.`
    );
  }

  if (
    includesAny([
      "very energetic",
      "high energy",
      "higher energy",
      "lots of energy",
      "lot of energy",
      "tons of energy",
      "full of energy",
      "very active",
      "needs lots of exercise",
      "needs a lot of exercise",
      "needs plenty of exercise",
    ])
  ) {
    setEnergy("high", 0.92, "Bio clearly describes high energy or high exercise needs.", true);
    setEnergyLikeTrait("exercise_needs", "high", 0.9, "Bio clearly describes high exercise needs.", true);
  } else if (
    includesAny([
      "medium high energy",
      "medium-high energy",
      "active dog",
      "active girl",
      "active boy",
      "adventure buddy",
      "running buddy",
      "hiking buddy",
    ])
  ) {
    setEnergy("medium_high", 0.84, "Bio describes an active dog with above-average exercise needs.", true);
    setEnergyLikeTrait("exercise_needs", "medium_high", 0.84, "Bio describes an active lifestyle fit.", true);
  } else if (
    includesAny([
      "moderate energy",
      "medium energy",
      "moderately active",
      "moderate exercise",
      "regular walks",
      "daily walks",
    ])
  ) {
    setEnergy("medium", 0.86, "Bio clearly describes moderate energy or regular exercise needs.", true);
    setEnergyLikeTrait("exercise_needs", "medium", 0.8, "Bio describes regular exercise needs.", true);
  } else if (
    includesAny([
      "medium low energy",
      "medium-low energy",
      "lower energy",
      "lower-energy",
      "short walks",
      "easy walks",
    ])
  ) {
    setEnergy("medium_low", 0.78, "Bio suggests lower-to-moderate energy.", true);
    setEnergyLikeTrait("exercise_needs", "medium_low", 0.74, "Bio suggests lower-to-moderate exercise needs.", true);
  } else if (
    includesAny([
      "low energy",
      "very chill",
      "laid back",
      "laid-back",
      "calm dog",
      "calm girl",
      "calm boy",
      "couch potato",
      "quiet and calm",
      "leisurely strolls",
      "short leisurely strolls",
    ])
  ) {
    setEnergy("low", 0.88, "Bio clearly describes low energy or a calm lifestyle.", true);
    setEnergyLikeTrait("exercise_needs", "low", 0.82, "Bio clearly describes low exercise needs or a calm lifestyle.", true);
  }

  if (normalizeEnergyLikeValue(normalized.energy_level?.value) === "unknown") {
    if (stage === "puppy") {
      setEnergy("medium_high", 0.64, "Puppy age gives an estimate of above-average energy unless the bio says calm.");
      setEnergyLikeTrait("exercise_needs", "medium_high", 0.6, "Puppy age suggests regular exercise and enrichment needs.");
      setEnergyLikeTrait("training_needs", "medium_high", 0.68, "Puppy age suggests extra training and structure.");
      normalized.needs_human_review = true;
    } else if (stage === "young") {
      setEnergy("medium", 0.56, "Young adult age gives a moderate baseline energy estimate.");
      setEnergyLikeTrait("exercise_needs", "medium", 0.54, "Young adult age suggests at least moderate exercise needs.");
    } else if (stage === "senior" || includesAny(["senior", "older dog", "older girl", "older boy"])) {
      setEnergy("medium_low", 0.62, "Senior/older-dog language gives a lower-energy estimate unless the bio says otherwise.");
      setEnergyLikeTrait("exercise_needs", "medium_low", 0.58, "Senior/older-dog language suggests lower-to-moderate exercise needs.");
    } else if (isWorkingHerdingSportingBreed()) {
      setEnergy("medium_high", 0.6, "Breed group commonly needs above-average activity.");
      setEnergyLikeTrait("exercise_needs", "medium_high", 0.62, "Working, herding, sporting, hound, or terrier breed type suggests above-average exercise needs.");
    } else if (dogInput.size || dogInput.breed || dogInput.description) {
      setEnergy("medium", 0.48, "Basic age, breed, size, or bio context supports a moderate default energy estimate.");
      setEnergyLikeTrait("exercise_needs", "medium", 0.46, "Basic profile context supports a moderate default exercise estimate.");
    }
  }

  if (normalizeEnergyLikeValue(normalized.exercise_needs?.value) === "unknown") {
    const energyValue = normalizeEnergyLikeValue(normalized.energy_level?.value);
    if (energyValue !== "unknown") {
      setEnergyLikeTrait("exercise_needs", energyValue, 0.56, `Exercise needs inferred from energy level ${energyValue}.`);
    } else if (isWorkingHerdingSportingBreed()) {
      setEnergyLikeTrait("exercise_needs", "medium_high", 0.6, "Breed group commonly needs regular exercise and enrichment.");
    } else if (stage === "senior") {
      setEnergyLikeTrait("exercise_needs", "medium_low", 0.54, "Senior age suggests lower-to-moderate exercise needs.");
    } else if (stage !== "unknown") {
      setEnergyLikeTrait("exercise_needs", "medium", 0.48, "Age gives a moderate exercise-needs baseline.");
    }
  }

  const breedText = String(dogInput.breed || "").toLowerCase();
  const mixedOrUnclearBreed = /\bmix|mixed|unknown\b/.test(breedText);

  if (dogInput.current_shedding_level) {
    setShedding(dogInput.current_shedding_level, 0.84, `Existing structured shedding level is ${dogInput.current_shedding_level}.`);
  }

  if (
    includesAny(["low shedding", "low-shedding", "minimal shedding", "doesn't shed much", "does not shed much"])
  ) {
    setShedding("low", 0.86, "Bio directly describes low shedding.", true);
  } else if (
    includesAny(["high shedding", "heavy shedding", "sheds a lot", "double coat", "blowing coat"])
  ) {
    setShedding("high", 0.86, "Bio directly describes high shedding or a double coat.", true);
  } else if (normalizeSheddingValue(normalized.shedding_level?.value) === "unknown") {
    // Deliberately NOT using explicitCoatLength() here: coat length alone does not
    // reliably predict shedding amount (e.g. Labrador Retrievers, German Shepherds,
    // and other double-coated breeds shed heavily despite a short coat; Poodle-type
    // curly coats shed very little despite being long). Breed/breed-group tendency
    // is a stronger shedding signal than coat length, so it's checked first. Coat
    // length is only used to set grooming (see setGrooming calls further down),
    // never to independently decide a shedding value. See resolveBreedShedding()
    // above for how multiple named breeds / breed groups are combined.
    const breedShedding = resolveBreedShedding(dogInput.breed);
    if (breedShedding) {
      setShedding(breedShedding.value, breedShedding.confidence, breedShedding.evidence);
    }
  }

  if (dogInput.current_barking_level) {
    setBarking(dogInput.current_barking_level, 0.84, `Existing structured barking level is ${dogInput.current_barking_level}.`);
  }

  if (
    includesAny([
      "rarely barks",
      "doesn't bark much",
      "does not bark much",
      "quiet dog",
      "not a barker",
      "minimal barking",
      "not much of a barker",
    ])
  ) {
    setBarking("quiet", 0.8, "Bio directly describes quiet or minimal barking.", true);
  } else if (
    includesAny([
      "very vocal",
      "talks a lot",
      "loves to bark",
      "alert barker",
      "good watchdog",
      "barks at",
      "barky",
    ])
  ) {
    setBarking("some", 0.78, "Bio directly describes vocal or alert-barking behavior.", true);
  }
  // No breed-based fallback for barking: vocalization varies too much within
  // breeds to estimate responsibly without direct bio evidence.

  if (dogInput.current_grooming_level) {
    setGrooming(dogInput.current_grooming_level, 0.84, `Existing structured grooming level is ${dogInput.current_grooming_level}.`);
  }

  if (
    includesAny(["low maintenance coat", "low-maintenance coat", "wash and go", "minimal grooming"])
  ) {
    setGrooming("low", 0.8, "Bio directly describes a low-maintenance coat.", true);
  } else if (
    includesAny(["needs regular grooming", "requires professional grooming", "high maintenance coat", "high-maintenance coat", "mats easily", "needs regular brushing"])
  ) {
    setGrooming("high", 0.8, "Bio directly describes a high-maintenance coat or grooming need.", true);
  } else if (
    normalizeGroomingValue(normalized.grooming_level?.value) === "unknown" &&
    explicitCoatLength(dogInput.breed) === "short"
  ) {
    setGrooming("low", 0.68, "Listing explicitly states a short coat.");
  } else if (
    normalizeGroomingValue(normalized.grooming_level?.value) === "unknown" &&
    explicitCoatLength(dogInput.breed) === "medium"
  ) {
    setGrooming("moderate", 0.66, "Listing explicitly states a medium coat.");
  } else if (
    normalizeGroomingValue(normalized.grooming_level?.value) === "unknown" &&
    explicitCoatLength(dogInput.breed) === "long"
  ) {
    setGrooming("high", 0.66, "Listing explicitly states a long coat.");
  } else if (
    normalizeGroomingValue(normalized.grooming_level?.value) === "unknown" &&
    breedIncludesAny(dogInput.breed, ["poodle", "bichon", "maltese", "shih tzu", "yorkshire terrier", "yorkie"])
  ) {
    setGrooming("high", mixedOrUnclearBreed ? 0.5 : 0.64, "Poodle/Bichon-type coat commonly needs frequent professional grooming despite low shedding.");
  } else if (
    normalizeGroomingValue(normalized.grooming_level?.value) === "unknown" &&
    breedIncludesAny(dogInput.breed, ["husky", "german shepherd", "golden retriever", "akita", "great pyrenees", "samoyed", "bernese", "newfoundland"])
  ) {
    setGrooming("moderate", 0.6, "Double-coated breed type commonly needs regular brushing.");
  } else if (
    normalizeGroomingValue(normalized.grooming_level?.value) === "unknown" &&
    breedIncludesAny(dogInput.breed, ["pit bull", "boxer", "chihuahua", "doberman", "greyhound"])
  ) {
    setGrooming("low", 0.58, "Short-coated breed type gives a cautious low grooming estimate.");
  }

  if (
    includesAny([
      "crate trained",
      "crate-trained",
      "sleeps in her crate",
      "sleeps in his crate",
      "loves her crate",
      "loves his crate",
      "security of my crate",
    ])
  ) {
    setTraitFromBio("crate_trained", "true", 0.88, "Bio directly describes crate training.");
  }

  if (
    includesAny([
      "first time dog owner",
      "first-time dog owner",
      "first time owner",
      "first-time owner",
      "beginner friendly",
      "beginner-friendly",
      "easygoing",
      "easy going",
      "easy dog",
      "low maintenance",
      "low-maintenance",
      "great for a first time owner",
      "great for a first-time owner",
    ])
  ) {
    setTraitFromBio(
      "first_time_friendly",
      "true",
      0.84,
      "Bio directly suggests the dog may be manageable for a first-time owner."
    );
  }

  if (
    includesAny([
      "apartment friendly",
      "apartment-friendly",
      "great fit for a shared wall",
      "shared wall situation",
      "good apartment dog",
      "apartment or townhome",
      "apartment or townhouse",
    ])
  ) {
    setTraitFromBio(
      "apartment_friendly",
      "true",
      0.86,
      "Bio directly describes apartment or shared-wall suitability."
    );
  }

  if (
    includesAny([
      "needs a fenced yard",
      "requires a fenced yard",
      "fenced yard required",
      "must have a fenced yard",
      "secure fenced yard",
    ])
  ) {
    setTraitFromBio("needs_yard", "true", 0.9, "Bio clearly says a fenced yard is needed.");
  } else if (
    includesAny([
      "would love a fenced yard",
      "would do best with a fenced yard",
      "yard to run",
      "room to run",
    ])
  ) {
    setTraitFromBio("needs_yard", "likely", 0.74, "Bio suggests a yard would be a strong fit.");
  }

  const ageYearsNumber = Number(dogInput.age_years);
  const ageTextLower = String(dogInput.age_text || "").toLowerCase();
  const ageMonthsMatch = ageTextLower.match(/(\d+)\s*months?/);
  const isVeryYoungPuppy =
    (Number.isFinite(ageYearsNumber) && ageYearsNumber > 0 && ageYearsNumber <= 0.5) ||
    // Guard against "X Years Y Months" text (e.g. "9 Years 2 Months"), which
    // would otherwise match the months-only puppy pattern below and flag a
    // senior dog as a very young puppy. Mirrors the same guard already used
    // in isClearlyPuppy() above.
    (ageMonthsMatch && !ageTextLower.includes("year") && Number(ageMonthsMatch[1]) <= 6) ||
    includesAny(["very young puppy", "young puppy", "tiny puppy"]);

  const hasMildAloneConcern = includesAny([
    "mild separation anxiety",
    "some separation anxiety",
    "mild separation concerns",
    "some separation concerns",
    "prefers someone home",
    "prefers people home",
    "would prefer someone home",
    "does best when someone is home",
    "still learning to be alone",
    "working on alone time",
    "adjusting to alone time",
    "moderate anxiety",
    // Clinginess is a real alone-time signal, distinct from (and stronger
    // than) plain affectionate language — see the "general affectionate
    // language" note further down. It is not as severe as panic/destructive
    // behavior, so it lives here rather than in hasSevereAloneConcern.
    "velcro dog",
    "follows you everywhere",
    "follows her everywhere",
    "follows him everywhere",
    "follows her person everywhere",
    "follows his person everywhere",
    "your shadow",
    "distress when left alone",
    "distress when you leave",
    "distress when her owner leaves",
    "distress when his owner leaves",
    "cries when left alone",
    "whines when left alone",
  ]);

  const hasSevereAloneConcern =
    isVeryYoungPuppy ||
    includesAny([
      "severe separation anxiety",
      "panic when left alone",
      "panics when left alone",
      "destructive when left alone",
      "destroys things when alone",
      "cannot be left alone",
      "can't be left alone",
      "should not be left alone long",
      "shouldn't be left alone long",
      "constant supervision",
      "constant support",
      "severe crate distress",
      "panics in the crate",
      "crate panic",
      "needs frequent monitoring",
      "frequent medical monitoring",
      "needs someone home at all times",
    ]) ||
    (!hasMildAloneConcern &&
      includesAny([
        "separation anxiety",
        "anxious when left alone",
        "does not like to be left alone",
        "doesn't like to be left alone",
      ]));

  // A foster or shelter's own day-to-day observation is more trustworthy
  // than generic bio-writer prose, so alone-time evidence attributed to one
  // gets a confidence bump below rather than being scored differently.
  const hasFosterObservation = includesAny([
    "foster reports",
    "foster says",
    "her foster says",
    "his foster says",
    "their foster says",
    "according to her foster",
    "according to his foster",
    "according to their foster",
    "foster family reports",
    "foster family says",
    "foster mom says",
    "foster dad says",
    "in her foster home",
    "in his foster home",
    "in their foster home",
    "shelter staff report",
    "according to shelter staff",
    "according to staff",
  ]);

  const hasStrongWorkdayEvidence =
    ["adult", "senior"].includes(stage) &&
    !hasSevereAloneConcern &&
    !hasMildAloneConcern &&
    includesAny([
      "handles alone time beautifully",
      "comfortable alone",
      "does well alone",
      "fine when left alone",
      "settles well alone",
      "relaxes independently",
      "comfortable for a full workday",
      "normal workday",
      "full workday",
      "eight hours alone",
      "8 hours alone",
    ]);

  const hasModerateAloneEvidence =
    ["adult", "senior"].includes(stage) &&
    !hasSevereAloneConcern &&
    !hasMildAloneConcern &&
    (normalizeEnergyLikeValue(normalized.energy_level?.value) === "low" ||
      normalizeEnergyLikeValue(normalized.energy_level?.value) === "medium_low" ||
      includesAny([
        "crate trained",
        "crate-trained",
        "house trained",
        "house-trained",
        "housebroken",
        "calm",
        "low energy",
        "laid back",
        "laid-back",
        "settles well",
        "independent",
        "relaxed",
        "leisurely walks",
        "couch potato",
      ]));

  if (hasSevereAloneConcern || hasMildAloneConcern) {
    setTraitFromBio(
      "anxiety_or_fear",
      hasSevereAloneConcern ? "true" : "likely",
      hasSevereAloneConcern ? 0.88 : 0.66,
      hasSevereAloneConcern
        ? "Bio describes significant alone-time distress or support needs."
        : "Bio describes mild alone-time or adjustment concerns."
    );
  }

  if (hasStrongWorkdayEvidence || hasModerateAloneEvidence) {
    setTraitFromBio(
      "can_be_left_alone",
      hasStrongWorkdayEvidence ? "true" : "likely",
      hasStrongWorkdayEvidence ? 0.84 : 0.62,
      hasStrongWorkdayEvidence
        ? "Bio gives strong evidence that the dog settles comfortably alone."
        : "Calm/trained adult or senior profile supports a moderate alone-time estimate."
    );
  }

  // ---- Max alone-time estimate ----
  // Scored from several weighted factors rather than asking for a single
  // number directly, in roughly this priority order (each tier is only
  // consulted once nothing higher-priority already produced an estimate):
  //   1. Explicit statements — separation anxiety, crate tolerance,
  //      destructive behavior, explicit can/cannot-be-left-alone wording,
  //      clinginess (velcro dog, follows you everywhere, distress when
  //      the owner leaves) — see hasSevereAloneConcern/hasMildAloneConcern.
  //   2. The same evidence attributed to a foster/shelter observation
  //      (hasFosterObservation) gets a confidence bump, not a different
  //      number — a foster's lived-in observation is more trustworthy
  //      than generic bio-writer prose, not a stronger claim.
  //   3. Age / life stage — a prior baseline, not an automatic rule.
  //   4. Energy level.
  //   5. Exercise needs.
  //   6. Breed independence tendency.
  //   7. General affectionate language ("loves cuddles", "affectionate",
  //      "wants attention", "loves people") — deliberately NOT scored here
  //      on its own. It only counts once it rises to an actual clinginess
  //      phrase (folded into hasMildAloneConcern above), matching the rule
  //      that affection must not be read as low alone-time tolerance.
  // Tiers 3-6 only apply as a fallback prior when the bio gives no explicit
  // alone-time wording at all (see the final else branch below) — they
  // never override real textual evidence.
  function aloneTimeAgeEnergyBreedPrior() {
    let score = 0;
    const notes = [];

    if (stage === "puppy") {
      score -= 2;
      notes.push("puppy/young-dog age prior");
    } else if (stage === "young") {
      score -= 1;
      notes.push("adolescent age prior");
    } else if (stage === "senior") {
      score += 1;
      notes.push("senior age prior (often lower activity, sleeps more)");
    }

    const energyValue = normalizeEnergyLikeValue(normalized.energy_level?.value);
    if (energyValue === "low") {
      score += 1;
      notes.push("low energy level");
    } else if (energyValue === "medium_low") {
      score += 0.5;
      notes.push("below-average energy level");
    } else if (energyValue === "high") {
      score -= 1;
      notes.push("high energy level");
    }

    const exerciseValue = normalizeEnergyLikeValue(normalized.exercise_needs?.value);
    if (exerciseValue === "high" || exerciseValue === "medium_high") {
      score -= 0.5;
      notes.push("above-average exercise needs");
    }

    if (breedIncludesAny(dogInput.breed, ["basenji", "afghan hound", "greyhound", "chow chow", "akita", "shiba inu"])) {
      score += 0.5;
      notes.push("breed commonly described as independent");
    } else if (breedIncludesAny(dogInput.breed, ["vizsla", "cavalier king charles", "italian greyhound"])) {
      score -= 0.5;
      notes.push("breed commonly described as wanting close companionship");
    }

    return { score, notes };
  }

  // Recompute alone time from supported evidence instead of preserving a model guess.
  normalized.max_alone_hours_estimate = {
    value: null,
    confidence: 0,
    evidence: "Not enough supported alone-time evidence.",
  };

  if (dogInput.current_max_alone_hours !== null && dogInput.current_max_alone_hours !== undefined) {
    setNumericTraitFromBio(
      "max_alone_hours_estimate",
      dogInput.current_max_alone_hours,
      0.9,
      `Existing structured max alone hours is ${dogInput.current_max_alone_hours}.`
    );
  } else if (includesAny(["6-8 hours", "6 to 8 hours", "six to eight hours", "7-8 hours", "7 to 8 hours"])) {
    setNumericTraitFromBio("max_alone_hours_estimate", 8, hasFosterObservation ? 0.88 : 0.82, "Bio explicitly gives an alone-time range up to a normal workday.");
  } else if (includesAny(["4-6 hours", "4 to 6 hours", "four to six hours", "5-6 hours", "5 to 6 hours"])) {
    setNumericTraitFromBio("max_alone_hours_estimate", 6, hasFosterObservation ? 0.86 : 0.8, "Bio explicitly gives an alone-time range around four to six hours.");
  } else if (includesAny(["less than 4 hours", "under 4 hours", "no more than 4 hours", "3-4 hours", "3 to 4 hours"])) {
    setNumericTraitFromBio("max_alone_hours_estimate", 4, hasFosterObservation ? 0.84 : 0.78, "Bio explicitly gives a shorter alone-time limit around three to four hours.");
  } else if (hasSevereAloneConcern) {
    setNumericTraitFromBio("max_alone_hours_estimate", 2, hasFosterObservation ? 0.8 : 0.74, "Clear distress, clinginess, very young puppy, support, or monitoring needs indicate a short alone-time tolerance.");
  } else if (hasMildAloneConcern || (stage === "young" && includesAny(["still learning", "needs patience", "adjusting"]))) {
    setNumericTraitFromBio("max_alone_hours_estimate", 4, hasFosterObservation ? 0.64 : 0.58, "Mild alone-time, anxiety, clinginess, or adjustment needs support a three-to-four-hour estimate.");
  } else if (hasStrongWorkdayEvidence) {
    setNumericTraitFromBio("max_alone_hours_estimate", 8, hasFosterObservation ? 0.78 : 0.72, "Strong adult/senior independence evidence supports a seven-to-eight-hour estimate.");
  } else if (hasModerateAloneEvidence) {
    setNumericTraitFromBio("max_alone_hours_estimate", 6, hasFosterObservation ? 0.64 : 0.58, "Calm, trained, or low-energy adult/senior evidence supports a five-to-six-hour estimate.");
  } else {
    // No explicit alone-time wording either way. Rather than leaving this
    // unknown — which, via the merge step, can silently carry forward a
    // stale guess from an older enrichment pass instead of a genuine
    // recompute — fall back to the weaker age/energy/exercise/breed prior.
    // Only produced when at least one of those factors actually says
    // something; a dog with no age, energy, or breed signal at all stays
    // unknown rather than guessing from nothing.
    const { score, notes } = aloneTimeAgeEnergyBreedPrior();
    if (notes.length > 0) {
      const hours = score <= -1.5 ? 3 : score < 0.5 ? 4 : score < 1.5 ? 5 : 6;
      setNumericTraitFromBio(
        "max_alone_hours_estimate",
        hours,
        0.42,
        `No explicit alone-time wording in the bio; estimated from ${notes.join(", ")}.`
      );
    }
  }

  if (
    includesAny([
      "needs training",
      "needs basic training",
      "working on manners",
      "working on leash manners",
      "needs leash work",
      "leash reactive",
      "severe leash",
      "not potty trained",
      "not house trained",
      "not housebroken",
      "escape artist",
      "resource guarding",
      "under-socialized",
      "undersocialized",
      "fearful",
      "very fearful",
      "timid",
      "needs an experienced adopter",
      "experienced adopter",
    ])
  ) {
    setEnergyLikeTrait("training_needs", "medium_high", 0.82, "Bio describes training needs or experienced-adopter support.", true);
  } else if (
    includesAny([
      "well trained",
      "good manners",
      "bestest manners",
      "knows basic commands",
      "knows commands",
      "eager to please",
      "walks well",
      "walks nicely",
      "good on leash",
      "crate trained",
      "crate-trained",
      "house trained",
      "housebroken",
      "potty trained",
    ])
  ) {
    setEnergyLikeTrait("training_needs", "medium_low", 0.7, "Bio suggests some training foundation is already present.");
  }

  if (normalizeEnergyLikeValue(normalized.training_needs?.value) === "unknown") {
    if (stage === "puppy") {
      setEnergyLikeTrait("training_needs", "medium_high", 0.68, "Puppy age suggests higher training and structure needs.");
    } else if (hasMildManageableNeeds()) {
      setEnergyLikeTrait("training_needs", "medium", 0.6, "Bio describes manageable needs that still call for training support.");
    } else if (hasEasyStableSignals() || stage === "senior" || stage === "adult") {
      setEnergyLikeTrait("training_needs", "medium_low", 0.56, "Stable temperament, age, or foundation skills suggest lower training needs.");
    } else if (dogInput.breed || dogInput.size || dogInput.description) {
      setEnergyLikeTrait("training_needs", "medium", 0.46, "Basic profile context supports a moderate training-needs baseline.");
    }
  }

  if (
    includesAny([
      "needs an experienced adopter",
      "experienced adopter",
      "experienced owner",
      "breed experience",
      "not for first time",
      "not for a first time",
      "not for first-time",
      "not for a first-time",
    ])
  ) {
    setTraitFromBio(
      "first_time_friendly",
      "false",
      0.9,
      "Bio clearly asks for an experienced adopter or says the dog is not for a first-time owner."
    );
  }

  // Kids: positive exposure from the rescue bio should not stay Unknown.
  if (
    includesAny([
      "good with kids",
      "kid-friendly",
      "kid friendly",
      "loves kids",
      "loves children",
      "lived with children",
      "lived with kids",
      "great with kids",
      "great with children",
      "wonderful with kids",
      "wonderful with children",
    ])
  ) {
    strengthenTraitFromBio(
      "good_with_kids",
      "true",
      0.88,
      "Bio directly describes positive compatibility with kids."
    );
  } else if (
    includesAny([
      "respectful interactions with kids",
      "respectful interactions with children",
      "gentle with kids",
      "gentle with children",
      "10 month old twins",
      "10-month-old twins",
      "twins she recently met",
      "children she recently met",
      "kids she recently met",
      "loves a couple of 10 month old twins",
    ])
  ) {
    strengthenTraitFromBio(
      "good_with_kids",
      "likely",
      0.78,
      "Bio describes strong positive kid exposure or respectful interactions."
    );
  } else if (
    includesAny([
      "met kids",
      "met children",
      "did well with kids",
      "did well with children",
      "may do well with kids",
      "may do well with children",
    ])
  ) {
    strengthenTraitFromBio(
      "good_with_kids",
      "maybe",
      0.68,
      "Bio describes some positive kid exposure."
    );
  }

  // Dogs: positive companion/social wording should become useful.
  if (
    includesAny([
      "good with dogs",
      "gets along with dogs",
      "gets along wonderfully with other dogs",
      "does well with other dogs",
      "loves other dogs",
      "dog friendly",
      "dog-friendly",
      "friendly with dogs",
      "lived with dogs",
    ])
  ) {
    strengthenTraitFromBio(
      "good_with_dogs",
      "true",
      0.88,
      "Bio directly describes positive compatibility with dogs."
    );
  } else if (
    includesAny([
      "would love a dog companion",
      "dog companion",
      "well-established dog",
      "well established dog",
      "company of other dogs",
      "enjoys the company of other dogs",
      "needs a well-established dog",
      "needs a well established dog",
    ])
  ) {
    strengthenTraitFromBio(
      "good_with_dogs",
      "likely",
      0.78,
      "Bio strongly suggests a compatible dog companion may be beneficial."
    );
  } else if (
    includesAny([
      "proper and slow introduction",
      "slow introductions",
      "slow intro",
      "foster sister",
      "another dog",
      "with other dogs",
      "may do well with dogs",
    ])
  ) {
    strengthenTraitFromBio(
      "good_with_dogs",
      "maybe",
      0.68,
      "Bio describes possible dog compatibility with caveats or introductions."
    );
  }

  // Cats: direct lived-with/gets-along wording should become useful.
  if (
    includesAny([
      "good with cats",
      "gets along with cats",
      "cat friendly",
      "cat-friendly",
      "lived with cats",
      "lives with cats",
      "wonderful with cats",
      "even cats",
    ])
  ) {
    strengthenTraitFromBio(
      "good_with_cats",
      "true",
      0.88,
      "Bio directly describes positive compatibility with cats."
    );
  } else if (
    includesAny([
      "has been around cats and did well",
      "does ok with the kitties",
      "does okay with the kitties",
      "does ok with cats",
      "does okay with cats",
      "dog-savvy cats",
      "cat-savvy",
      "wants to chase",
    ])
  ) {
    strengthenTraitFromBio(
      "good_with_cats",
      "maybe",
      0.65,
      "Bio suggests possible cat compatibility with caveats."
    );
  }

  // Potty training.
  if (
    includesAny([
      "fully potty trained",
      "potty trained",
      "house trained",
      "housebroken",
      "pee pad trained",
    ])
  ) {
    strengthenTraitFromBio(
      "potty_trained",
      "true",
      0.9,
      "Bio directly describes potty or house training."
    );
  } else if (
    includesAny([
      "mostly potty trained",
      "doing well with potty training",
      "almost potty trained",
    ])
  ) {
    strengthenTraitFromBio(
      "potty_trained",
      "likely",
      0.78,
      "Bio suggests potty training is mostly established."
    );
  } else if (
    includesAny([
      "working on potty training",
      "working on house training",
      "needs help with potty training",
    ])
  ) {
    strengthenTraitFromBio(
      "potty_trained",
      "maybe",
      0.6,
      "Bio says potty training is still in progress."
    );
  }

  // Direct negative phrases override maybe/likely/unknown.
  if (includesAny(["no kids", "adult-only home", "adult only home", "not good with kids", "not good with children"])) {
    normalized.good_with_kids = {
      value: "false",
      confidence: 0.9,
      evidence: "Bio clearly indicates the dog should not live with kids.",
    };
  }

  if (includesAny(["only dog", "must be the only dog", "not good with dogs", "no dogs", "dog reactive"])) {
    normalized.good_with_dogs = {
      value: "false",
      confidence: 0.9,
      evidence: "Bio clearly indicates the dog should not live with other dogs.",
    };
  }

  if (includesAny(["no cats", "not good with cats", "not cat safe", "cannot live with cats"])) {
    normalized.good_with_cats = {
      value: "false",
      confidence: 0.9,
      evidence: "Bio clearly indicates the dog should not live with cats.",
    };
  }

  if (includesAny(["not potty trained", "not house trained", "not housebroken"])) {
    normalized.potty_trained = {
      value: "false",
      confidence: 0.9,
      evidence: "Bio clearly says the dog is not potty trained.",
    };
  }

  const trainingNeedValue = normalizeEnergyLikeValue(normalized.training_needs?.value);
  const energyValue = normalizeEnergyLikeValue(normalized.energy_level?.value);
  const highComplexityNeeds = hasHighComplexityNeeds();
  const hasConfirmedPositiveSocialOrTraining =
    dogInput.current_potty_trained === true ||
    dogInput.current_good_with_dogs === true ||
    dogInput.current_good_with_cats === true ||
    dogInput.current_good_with_kids === true;
  const firstTimeMostLikelyEligible =
    !highComplexityNeeds &&
    !normalized.needs_human_review &&
    ["low", "medium_low", "medium"].includes(trainingNeedValue) &&
    energyValue !== "high";

  if (hasMajorFirstTimeRedFlag()) {
    normalized.first_time_friendly = {
      value: "false",
      confidence: 0.86,
      evidence: "Bio or profile indicates major behavior, medical, handling, training, fear, or lifestyle complexity for a first-time owner.",
    };
  } else if (hasExplicitEasyBeginnerSignals() && firstTimeMostLikelyEligible) {
    normalized.first_time_friendly = {
      value: "true",
      confidence: 0.84,
      evidence: "Bio explicitly describes an easy or beginner-friendly dog, and no major complexity signals were found.",
    };
  } else if (highComplexityNeeds || normalized.needs_human_review) {
    normalized.first_time_friendly = {
      value: "maybe",
      confidence: 0.52,
      evidence: "Profile has meaningful care, training, behavior, medical, review, or home-fit complexity, so first-time-owner fit is cautious.",
    };
  } else if (
    firstTimeMostLikelyEligible &&
    !hasWarmTemperamentOnly() &&
    (hasEasyStableSignals() ||
      hasConfirmedPositiveSocialOrTraining ||
      hasExplicitEasyBeginnerSignals() ||
    (["adult", "senior"].includes(stage) &&
      ["low", "medium_low", "medium"].includes(trainingNeedValue) &&
      ["low", "medium_low", "medium"].includes(energyValue)))
  ) {
    normalized.first_time_friendly = {
      value: "likely",
      confidence: 0.68,
      evidence: "Stable, manageable profile with low-to-moderate training needs and no major first-time-owner complexity signals.",
    };
  } else if (
    hasMildManageableNeeds() ||
    stage === "young" ||
    trainingNeedValue === "medium" ||
    energyValue === "medium" ||
    hasWarmTemperamentOnly()
  ) {
    normalized.first_time_friendly = {
      value: "maybe",
      confidence: 0.58,
      evidence: "Profile suggests manageable needs without major first-time-owner red flags.",
    };
  } else if (dogInput.description || dogInput.breed || dogInput.age_text || dogInput.age_years !== null) {
    normalized.first_time_friendly = {
      value: "maybe",
      confidence: 0.46,
      evidence: "Basic profile context gives a cautious first-time-owner estimate, but details are limited.",
    };
    normalized.needs_human_review = true;
  }

  const kidsValue = String(normalized.good_with_kids?.value || "").toLowerCase();

  const childEvidenceAvailable =
    dogInput.current_good_with_kids === true || hasChildSpecificEvidence();

  if (
    ["true", "likely", "maybe"].includes(kidsValue) &&
    !childEvidenceAvailable
  ) {
    normalized.good_with_kids = {
      value: "unknown",
      confidence: 0,
      evidence: "Generic family language was not treated as child-specific kid compatibility evidence.",
    };
  }

  const catsValue = String(normalized.good_with_cats?.value || "").toLowerCase();

  const catEvidenceAvailable =
    dogInput.current_good_with_cats === true || hasCatSpecificEvidence();

  if (
    ["true", "likely", "maybe"].includes(catsValue) &&
    !catEvidenceAvailable
  ) {
    normalized.good_with_cats = {
      value: "unknown",
      confidence: 0,
      evidence: "Generic sociability language was not treated as cat-specific compatibility evidence.",
    };
  }

  const dogsValue = String(normalized.good_with_dogs?.value || "").toLowerCase();

  const dogEvidenceAvailable =
    dogInput.current_good_with_dogs === true || hasOtherDogSpecificEvidence();

  if (
    ["true", "likely", "maybe"].includes(dogsValue) &&
    !dogEvidenceAvailable
  ) {
    normalized.good_with_dogs = {
      value: "unknown",
      confidence: 0,
      evidence: "Generic sociability language was not treated as other-dog-specific compatibility evidence.",
    };
  }

  const isThinListing = description.length < 70;
  const looksGeneric =
    descriptionLower.includes("great addition to any family") &&
    descriptionLower.includes("please do research on the breed");

  const mismatchedName =
    containsDifferentDogName(description, dogInput.name) ||
    containsDifferentDogName(normalized.ideal_home_summary, dogInput.name);

  if (isThinListing || looksGeneric) {
    normalized.needs_human_review = true;
    normalized.ideal_home_summary = "";
    normalized.caution_notes = [
      looksGeneric
        ? "Listing is generic and includes breed-research caution, so AI traits should be reviewed."
        : "Listing has limited description text, so AI trait extraction may be incomplete.",
      ...normalized.caution_notes,
    ].slice(0, 8);
    normalized.overall_confidence = Math.min(normalized.overall_confidence, 0.55);
  }

  if (mismatchedName) {
    normalized.needs_human_review = true;
    normalized.ideal_home_summary = "";
    normalized.caution_notes = [
      "Listing may mention a different dog name, so AI summary was removed and this needs review.",
      ...normalized.caution_notes,
    ].slice(0, 8);
    normalized.overall_confidence = Math.min(normalized.overall_confidence, 0.45);
  }

  if (normalized.overall_confidence <= 0) {
    const traitConfidences = [
      normalized.energy_level,
      normalized.shedding_level,
      normalized.good_with_kids,
      normalized.good_with_dogs,
      normalized.good_with_cats,
      normalized.potty_trained,
      normalized.first_time_friendly,
      normalized.max_alone_hours_estimate,
      normalized.exercise_needs,
      normalized.training_needs,
    ]
      .map((trait) => normalizeConfidence(trait?.confidence))
      .filter((confidence) => confidence > 0);

    normalized.overall_confidence = traitConfidences.length
      ? Math.min(0.85, traitConfidences.reduce((sum, value) => sum + value, 0) / traitConfidences.length)
      : 0.3;
  }

  // Extra safety: never allow false compatibility from weak evidence.
  for (const key of [
    "potty_trained",
    "good_with_kids",
    "good_with_dogs",
    "good_with_cats",
    "good_with_small_animals",
  ]) {
    const trait = normalized[key];
    const evidence = String(trait?.evidence || "").toLowerCase();
    const value = String(trait?.value || "").toLowerCase();

    const explicitNegative =
      evidence.includes("not ") ||
      evidence.includes("no ") ||
      evidence.includes("cannot") ||
      evidence.includes("can't") ||
      evidence.includes("isn't") ||
      evidence.includes("not compatible") ||
      evidence.includes("should not live");

    if (value === "false" && !explicitNegative) {
      normalized[key] = {
        value: "unknown",
        confidence: 0,
        evidence: "False was not treated as confirmed because the listing does not explicitly say this.",
      };
    }
  }

  return normalized;
}

function traitToBioValue(trait) {
  const value = normalizeTraitValue(trait?.value, "unknown");
  const confidence = normalizeConfidence(trait?.confidence);

  if (value === "true") return "yes";
  if (value === "likely") return confidence >= 0.5 ? "most_likely" : "unknown";
  if (value === "maybe") return confidence >= 0.45 ? "may_do_well" : "unknown";
  if (value === "false") return "no";

  return "unknown";
}

function safeBioValue(value) {
  return BIO_VALUES.has(value) ? value : "unknown";
}

function safeEnergyValue(value) {
  const normalized = normalizeEnergyLikeValue(value);
  return ENERGY_VALUES.has(normalized) ? normalized : "unknown";
}

function safeSheddingValue(value) {
  const normalized = normalizeSheddingValue(value);
  return SHEDDING_VALUES.has(normalized) ? normalized : "unknown";
}

const BIO_FIELD_LABELS = {
  bio_good_with_kids: "good with kids",
  bio_good_with_dogs: "good with dogs",
  bio_good_with_cats: "good with cats",
  bio_potty_trained: "potty trained",
  bio_energy_level: "energy",
  bio_exercise_needs: "exercise needs",
  bio_training_needs: "trainability",
  bio_shedding_level: "shedding",
  bio_barking_level: "barking",
  bio_grooming_level: "grooming",
  bio_max_alone_hours: "alone time",
};

function bioFieldLabel(key) {
  return BIO_FIELD_LABELS[key] || key;
}

function safeBarkingValue(value) {
  const normalized = normalizeBarkingValue(value);
  return BARKING_VALUES.has(normalized) ? normalized : "unknown";
}

function safeGroomingValue(value) {
  const normalized = normalizeGroomingValue(value);
  return GROOMING_VALUES.has(normalized) ? normalized : "unknown";
}

function normalizeAloneHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(8, Math.round(n)));
}

function aloneHoursLabel(hours) {
  const n = normalizeAloneHours(hours);
  if (!n) return "unknown";
  if (n <= 2) return "1-2";
  if (n <= 4) return "3-4";
  if (n <= 6) return "5-6";
  return "7-8";
}

function buildBioColumns(aiTraits, inferredAdultSize) {
  const aloneHours = normalizeAloneHours(aiTraits.max_alone_hours_estimate?.value);
  const aloneLabel = aloneHoursLabel(aloneHours);

  return {
    bio_good_with_kids: safeBioValue(traitToBioValue(aiTraits.good_with_kids)),
    bio_good_with_dogs: safeBioValue(traitToBioValue(aiTraits.good_with_dogs)),
    bio_good_with_cats: safeBioValue(traitToBioValue(aiTraits.good_with_cats)),
    bio_first_time_friendly: safeBioValue(traitToBioValue(aiTraits.first_time_friendly)),
    bio_potty_trained: safeBioValue(traitToBioValue(aiTraits.potty_trained)),
    bio_energy_level: safeEnergyValue(aiTraits.energy_level?.value),
    bio_shedding_level: safeSheddingValue(aiTraits.shedding_level?.value),
    bio_max_alone_hours: aloneHours,
    bio_max_alone_hours_label: ALONE_HOURS_LABELS.has(aloneLabel) ? aloneLabel : "unknown",
    bio_exercise_needs: safeEnergyValue(aiTraits.exercise_needs?.value),
    bio_training_needs: safeEnergyValue(aiTraits.training_needs?.value),
    bio_barking_level: safeBarkingValue(aiTraits.barking_level?.value),
    bio_grooming_level: safeGroomingValue(aiTraits.grooming_level?.value),
    // Breed/age-based estimate for puppies with no confirmed source size.
    // Never set when a source size exists (see inferExpectedAdultSizeForPuppy).
    bio_size: inferredAdultSize || null,
    bio_traits_source: "ai_bio_extraction",
    bio_traits_updated_at: new Date().toISOString(),
  };
}

// Carries forward an existing bio_* value only when the fresh run found
// nothing (never overrides evidence-backed fresh values). Every carry-forward
// is also reported back to the caller: a value that survives purely because
// today's run couldn't re-derive it is not the same as a value this run
// actually verified, so it should be surfaced for human review rather than
// presented as freshly authoritative. This intentionally does not attempt to
// "expire" a carried-forward value after N runs (no DB column exists to track
// that, and adding one is a schema decision outside this pass) — the mitigation
// here is visibility (needs_human_review + a caution note), not automatic removal.
function mergeExistingBioColumns(nextColumns, dog) {
  const merged = { ...nextColumns };
  const carriedForwardFields = [];

  for (const key of [
    "bio_good_with_kids",
    "bio_good_with_dogs",
    "bio_good_with_cats",
    "bio_potty_trained",
  ]) {
    if (merged[key] === "unknown" && BIO_VALUES.has(dog?.[key]) && dog[key] !== "unknown") {
      merged[key] = dog[key];
      carriedForwardFields.push(key);
    }
  }

  for (const key of ["bio_energy_level", "bio_exercise_needs", "bio_training_needs"]) {
    const existing = normalizeEnergyLikeValue(dog?.[key]);
    if (merged[key] === "unknown" && existing !== "unknown") {
      merged[key] = existing;
      carriedForwardFields.push(key);
    }
  }

  const existingShedding = normalizeSheddingValue(dog?.bio_shedding_level);
  if (merged.bio_shedding_level === "unknown" && existingShedding !== "unknown") {
    merged.bio_shedding_level = existingShedding;
    carriedForwardFields.push("bio_shedding_level");
  }

  const existingBarking = normalizeBarkingValue(dog?.bio_barking_level);
  if (merged.bio_barking_level === "unknown" && existingBarking !== "unknown") {
    merged.bio_barking_level = existingBarking;
    carriedForwardFields.push("bio_barking_level");
  }

  const existingGrooming = normalizeGroomingValue(dog?.bio_grooming_level);
  if (merged.bio_grooming_level === "unknown" && existingGrooming !== "unknown") {
    merged.bio_grooming_level = existingGrooming;
    carriedForwardFields.push("bio_grooming_level");
  }

  // A new run with no qualifying evidence returns null here, not a weaker
  // guess to compare against — so "the new run found nothing" is the only
  // case this needs to guard, same as every other field above. A new run
  // that DOES find evidence always produces a real value, which is used as-is
  // (evidence-backed values are never suppressed in favor of an older guess).
  const existingAloneHours = normalizeAloneHours(dog?.bio_max_alone_hours);
  if ((merged.bio_max_alone_hours === null || merged.bio_max_alone_hours === undefined) && existingAloneHours) {
    merged.bio_max_alone_hours = existingAloneHours;
    merged.bio_max_alone_hours_label = ALONE_HOURS_LABELS.has(dog?.bio_max_alone_hours_label) && dog.bio_max_alone_hours_label !== "unknown"
      ? dog.bio_max_alone_hours_label
      : aloneHoursLabel(existingAloneHours);
    carriedForwardFields.push("bio_max_alone_hours");
  }

  return { merged, carriedForwardFields };
}

async function callOpenAI(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You extract structured dog adoption matching traits from listings. You are cautious and return valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const json = await response.json();

    if (!response.ok) {
      throw new Error(
        `OpenAI ${response.status}: ${json?.error?.message || JSON.stringify(json)}`
      );
    }

    return json.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(timeout);
  }
}

// Fields that actually affect the site (matching, trait display, review
// queue) — used to decide whether a run produced anything worth writing.
// Excludes bio_traits_source (static) and bio_traits_updated_at/ai_traits/
// ai_confidence_score/ai_enriched_at, which either never change or almost
// always differ slightly on LLM phrasing alone even when the real values
// didn't move, and would make this check meaningless if included.
const MEANINGFUL_BIO_FIELDS = [
  "bio_good_with_kids",
  "bio_good_with_dogs",
  "bio_good_with_cats",
  "bio_first_time_friendly",
  "bio_potty_trained",
  "bio_energy_level",
  "bio_shedding_level",
  "bio_max_alone_hours",
  "bio_max_alone_hours_label",
  "bio_exercise_needs",
  "bio_training_needs",
  "bio_barking_level",
  "bio_grooming_level",
  "bio_size",
];

function hasMeaningfulChange(bioColumns, needsHumanReview, dog) {
  if (Boolean(dog?.needs_human_review) !== Boolean(needsHumanReview)) return true;

  return MEANINGFUL_BIO_FIELDS.some((key) => {
    const next = bioColumns[key] ?? null;
    const current = dog?.[key] ?? null;
    return String(next) !== String(current);
  });
}

async function enrichOneDog(dog, { dryRun = false } = {}) {
  const dogInput = asDogInput(dog);

  if (
    !dogInput.description &&
    !dogInput.breed &&
    !dogInput.size &&
    !dogInput.gender &&
    dogInput.age_years === null &&
    !dogInput.age_text &&
    !dogInput.current_energy_level
  ) {
    console.log(`Skipping ${dog.name || dog.id}: not enough data`);
    return null;
  }

  const started = Date.now();
  const content = await callOpenAI(buildPrompt(dogInput));
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const parsed = safeParseJson(content);
  const aiTraits = normalizeAiTraits(parsed, dogInput);
  const inferredAdultSize = inferExpectedAdultSizeForPuppy(dogInput);
  if (inferredAdultSize) {
    aiTraits.caution_notes = [
      `AI estimated likely adult size as ${inferredAdultSize} from breed and age. This is stored as an estimate and does not overwrite the shelter/API size field.`,
      ...aiTraits.caution_notes,
    ].slice(0, 8);
  }
  const { merged: bioColumns, carriedForwardFields } = mergeExistingBioColumns(
    buildBioColumns(aiTraits, inferredAdultSize),
    dog
  );

  if (carriedForwardFields.length) {
    aiTraits.needs_human_review = true;
    aiTraits.caution_notes = [
      `Carried forward from a previous run without fresh supporting evidence, so this needs a human check rather than being treated as verified: ${carriedForwardFields.map(bioFieldLabel).join(", ")}.`,
      ...aiTraits.caution_notes,
    ].slice(0, 8);
  }

  const meaningfulChange = hasMeaningfulChange(bioColumns, aiTraits.needs_human_review, dog);

  if (dryRun) {
    return { aiTraits, bioColumns, carriedForwardFields, inferredAdultSize, elapsed, meaningfulChange, dryRun: true };
  }

  if (!meaningfulChange) {
    // Even though there's nothing worth writing to bio_*/ai_traits, the
    // source data WAS just re-checked against today's source_content_hash.
    // Without acknowledging that here, a dog whose structured fields changed
    // but whose derived bio traits happened to net out the same would stay
    // permanently flagged as "changed" and get re-sent to OpenAI on every
    // future run, forever, for no reason — the one thing --limit/eligibility
    // filtering is meant to prevent.
    const nextSourceHash = dog?.source_content_hash ?? null;
    if (nextSourceHash !== null && nextSourceHash !== (dog?.ai_enriched_source_hash ?? null)) {
      const { error: ackError } = await supabase
        .from("dogs")
        .update({ ai_enriched_source_hash: nextSourceHash })
        .eq("id", dog.id);
      if (ackError) throw ackError;
    }

    return { aiTraits, bioColumns, carriedForwardFields, inferredAdultSize, elapsed, meaningfulChange, skipped: true };
  }

  const updatePayload = {
    ai_traits: aiTraits,
    ai_enriched_at: new Date().toISOString(),
    ai_enrichment_version: AI_ENRICHMENT_VERSION,
    ai_confidence_score: aiTraits.overall_confidence,
    needs_human_review: aiTraits.needs_human_review,
    ai_enriched_source_hash: dog?.source_content_hash ?? null,
    ...bioColumns,
  };

  const { error } = await supabase
    .from("dogs")
    .update(updatePayload)
    .eq("id", dog.id);

  if (error) throw error;

  return { aiTraits, bioColumns, carriedForwardFields, inferredAdultSize, elapsed };
}

async function fetchDogs({ limit, force, dogId }) {
  let query = supabase
    .from("dogs")
    .select(
      `
      id,
      name,
      breed,
      gender,
      age_years,
      age_text,
      size,
      energy_level,
      activity_level,
      description,
      placement_note,
      qualities,
      play_styles,
      good_with_kids,
      good_with_dogs,
      good_with_cats,
      good_with_small_animals,
      potty_trained,
      first_time_friendly,
      hypoallergenic,
      shedding_level,
      grooming_level,
      barking_level,
      max_alone_hours,
      shelter_name,
      ai_traits,
      ai_enriched_at,
      ai_enrichment_version,
      bio_good_with_kids,
      bio_good_with_dogs,
      bio_good_with_cats,
      bio_first_time_friendly,
      bio_potty_trained,
      bio_energy_level,
      bio_shedding_level,
      bio_max_alone_hours,
      bio_max_alone_hours_label,
      bio_exercise_needs,
      bio_training_needs,
      bio_barking_level,
      bio_grooming_level,
      bio_size,
      bio_traits_updated_at,
      needs_human_review,
      source_content_hash,
      ai_enriched_source_hash,
      adoptable,
      adoption_pending,
      availability_status,
      urgency_level,
      rescuegroups_id,
      rescuegroups_org_id,
      source,
      external_id,
      source_url,
      adoption_url,
      shelters (
        name
      )
    `
    )
    .eq("adoptable", true)
    .or("adoption_pending.is.null,adoption_pending.eq.false")
    .in("availability_status", ["available", "active", "unknown"])
    .neq("urgency_level", "Adopted")
    .order("created_at", { ascending: false })
    // Explicit safety-net cap, decoupled from the CLI --limit (business
    // parameter, e.g. 40/day) applied after eligibility filtering below.
    // Without an explicit limit here, this query is subject to PostgREST's
    // own default row cap (commonly 1000) and would silently truncate the
    // eligibility scan before the JS filtering below ever sees the rest.
    // 2000 is comfortably above current + realistic near-term dataset size;
    // revisit with real pagination if the dogs table ever approaches it.
    .limit(2000);

  if (dogId) {
    query = query.eq("id", dogId);
  }

  const { data, error } = await query;

  if (error) throw error;

  // The SQL filters above are a coarse pre-filter (adoptable/pending/status/
  // urgency); isPubliclyVisibleDog is the authoritative check that also
  // requires a trusted synced source or a verified listing, matching what
  // actually renders on the live site.
  const visible = Array.isArray(data) ? data.filter(isPubliclyVisibleDog) : [];

  if (force || dogId) {
    return visible.slice(0, limit);
  }

  // Column-to-column comparisons (source_content_hash vs
  // ai_enriched_source_hash) aren't expressible in a single PostgREST filter,
  // so eligibility is resolved here instead of in the query. Dataset size
  // (a handful of Michigan rescues) makes fetching the full visible set
  // before filtering/limiting a non-issue.
  const eligible = [];
  const reasonCounts = { new: 0, version_outdated: 0, content_changed: 0 };

  for (const dog of visible) {
    const reason = getEnrichmentEligibilityReason(dog);
    if (!reason) continue;
    reasonCounts[reason] += 1;
    eligible.push(dog);
  }

  console.log(
    `Eligible for enrichment: ${eligible.length} (new: ${reasonCounts.new}, version outdated: ${reasonCounts.version_outdated}, content changed: ${reasonCounts.content_changed})`
  );

  return eligible.slice(0, limit);
}

// "new" — never enriched at all.
// "version_outdated" — enriched under an older AI_ENRICHMENT_VERSION (e.g.
//   after a prompt/logic change), independent of whether source data moved.
// "content_changed" — already enriched under the current version, but the
//   bio/structured fields it was enriched against have since changed
//   (source_content_hash no longer matches what was last enriched).
// A dog with no source_content_hash yet (e.g. never touched by
// sync-rescuegroups-dogs.cjs/enrich-dacc-bios.cjs since those started
// stamping it) is never treated as "changed" purely from that absence —
// only a genuine hash mismatch counts.
function getEnrichmentEligibilityReason(dog) {
  if (!dog?.ai_enriched_at) return "new";
  if (dog?.ai_enrichment_version !== AI_ENRICHMENT_VERSION) return "version_outdated";

  const currentHash = dog?.source_content_hash ?? null;
  if (currentHash !== null && currentHash !== (dog?.ai_enriched_source_hash ?? null)) {
    return "content_changed";
  }

  return null;
}

async function main() {
  const limit = Number(getArg("limit", DEFAULT_LIMIT));
  const force = hasFlag("force");
  const dryRun = hasFlag("dry-run");
  const dogId = getArg("dog-id", null);

  console.log("========================================");
  console.log("AI dog trait enrichment");
  console.log(`Model: ${MODEL}`);
  console.log(`Version: ${AI_ENRICHMENT_VERSION}`);
  console.log(`Limit: ${Number.isFinite(limit) ? limit : DEFAULT_LIMIT}`);
  console.log(`Force: ${force ? "yes" : "no"}`);
  console.log(`Dry run: ${dryRun ? "yes (calls OpenAI, writes nothing to Supabase)" : "no"}`);
  console.log(`Dog ID: ${dogId || "all eligible"}`);
  console.log("========================================");

  const dogs = await fetchDogs({
    limit: Number.isFinite(limit) ? limit : DEFAULT_LIMIT,
    force,
    dogId,
  });

  if (!dogs.length) {
    console.log("No dogs found to enrich.");
    return;
  }

  console.log(`Found ${dogs.length} dog(s) to enrich.`);

  let updated = 0;
  let skippedNoChange = 0;
  let skippedNoData = 0;
  let failed = 0;

  for (const dog of dogs) {
    try {
      console.log(`\nEnriching: ${dog.name || dog.id}`);

      const result = await enrichOneDog(dog, { dryRun });
      if (!result) {
        skippedNoData += 1;
        continue;
      }

      const { aiTraits, bioColumns, carriedForwardFields, elapsed, skipped } = result;

      if (skipped) {
        skippedNoChange += 1;
        console.log(`⏭️  No meaningful change for ${dog.name || dog.id} in ${elapsed}s — not writing (row left as-is).`);
        continue;
      }

      updated += 1;

      const tags = Array.isArray(aiTraits.match_tags)
        ? aiTraits.match_tags.join(", ")
        : "";

      console.log(`${dryRun ? "🔍 Would update" : "✅ Updated"} ${dog.name || dog.id} in ${elapsed}s`);
      console.log(`   Confidence: ${aiTraits.overall_confidence}`);
      console.log(`   Review: ${aiTraits.needs_human_review ? "yes" : "no"}`);
      if (carriedForwardFields?.length) {
        console.log(`   Carried forward (unsupported, flagged for review): ${carriedForwardFields.map(bioFieldLabel).join(", ")}`);
      }
      console.log(`   bio_good_with_kids: ${bioColumns.bio_good_with_kids}`);
      console.log(`   bio_good_with_dogs: ${bioColumns.bio_good_with_dogs}`);
      console.log(`   bio_good_with_cats: ${bioColumns.bio_good_with_cats}`);
      console.log(`   bio_first_time_friendly: ${bioColumns.bio_first_time_friendly}`);
      console.log(`   bio_potty_trained: ${bioColumns.bio_potty_trained}`);
      console.log(`   bio_energy_level: ${bioColumns.bio_energy_level}`);
      console.log(`   bio_shedding_level: ${bioColumns.bio_shedding_level}`);
      console.log(`   bio_barking_level: ${bioColumns.bio_barking_level}`);
      console.log(`   bio_grooming_level: ${bioColumns.bio_grooming_level}`);
      console.log(`   bio_max_alone_hours: ${bioColumns.bio_max_alone_hours ?? "unknown"}`);
      console.log(`   bio_exercise_needs: ${bioColumns.bio_exercise_needs}`);
      console.log(`   bio_training_needs: ${bioColumns.bio_training_needs}`);
      console.log(`   bio_size: ${bioColumns.bio_size ?? "none"}`);
      if (tags) console.log(`   Tags: ${tags}`);
    } catch (error) {
      failed += 1;
      console.error(`❌ Failed ${dog.name || dog.id}: ${error.message || error}`);
    }
  }

  console.log("\n========================================");
  console.log(dryRun ? "AI enrichment dry run complete (nothing written)" : "AI enrichment complete");
  console.log(`Attempted: ${dogs.length}`);
  console.log(`${dryRun ? "Would update" : "Updated"}: ${updated}`);
  console.log(`Skipped (no meaningful change): ${skippedNoChange}`);
  console.log(`Skipped (not enough source data): ${skippedNoData}`);
  console.log(`Failed: ${failed}`);
  console.log("========================================");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

// Exported so one-off review/reporting scripts can reuse the exact same
// extraction and normalization logic instead of duplicating it (and risking
// drift from what a real run would actually write).
module.exports = {
  asDogInput,
  buildPrompt,
  callOpenAI,
  safeParseJson,
  normalizeAiTraits,
  inferExpectedAdultSizeForPuppy,
  buildBioColumns,
  mergeExistingBioColumns,
  bioFieldLabel,
  AI_ENRICHMENT_VERSION,
};
