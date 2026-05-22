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
//
// Run:
//   node scripts/enrich-dogs-ai.cjs --limit=1 --force
//   node scripts/enrich-dogs-ai.cjs --limit=25
//   node scripts/enrich-dogs-ai.cjs --limit=25 --force

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const AI_ENRICHMENT_VERSION = "dog-ai-traits-v3";
const DEFAULT_LIMIT = 10;
const MODEL = "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const BIO_VALUES = new Set(["yes", "most_likely", "may_do_well", "no", "unknown"]);

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
- "true" only with clear easygoing/manageable/beginner-friendly behavior or training evidence.
- "likely" when the bio strongly suggests manageable/easygoing traits, low or moderate energy, gentle temperament, and no advanced behavior needs.
- "maybe" for mild positive signs like clear easygoing, calm, gentle, low-maintenance, manageable energy, or eager-to-please wording.
- "false" only with clear experienced-adopter/breed-experience/major behavior needs.
- "unknown" when generic, copied, mismatched, or not enough behavior detail.
- "family", "great family dog", or "great addition to any family" must stay unknown by itself. Family language alone is not child-specific and is not first-time-owner evidence.

Other rules:
- "research the breed before applying" should lower confidence and suggest review, but it should not erase specific compatibility evidence about kids, dogs, or cats.
- Do not include the dog's name in ideal_home_summary.
- If listing is generic, copied, mismatched, or too thin, make ideal_home_summary empty and set needs_human_review true.
- Return JSON only.

Return exactly this JSON shape:
{
  "energy_level": { "value": "unknown", "confidence": 0, "evidence": "" },
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
    energy_level: normalizeTraitObject(parsed.energy_level),
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
    training_needs: normalizeTraitObject(parsed.training_needs),
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

  function hasFirstTimeFriendlyEvidence() {
    return includesAny([
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
      "calm dog",
      "calm girl",
      "calm boy",
      "very chill",
      "gentle dog",
      "gentle girl",
      "gentle boy",
      "laid back",
      "laid-back",
      "eager to please",
      "good manners",
      "bestest manners",
    ]);
  }

  function normalizeEnergyValue(value) {
    const raw = String(value || "").toLowerCase().trim();
    if (!raw || raw === "unknown") return "unknown";
    if (raw.includes("low") || raw.includes("calm") || raw.includes("slightly active")) return "low";
    if (raw.includes("high") || raw.includes("very active")) return "high";
    if (raw.includes("moderate") || raw.includes("medium")) return "moderate";
    return "unknown";
  }

  function setEnergy(value, confidence, evidence, force = false) {
    const normalizedValue = normalizeEnergyValue(value);
    if (!["low", "moderate", "high"].includes(normalizedValue)) return;

    const currentConfidence = Number(normalized.energy_level?.confidence || 0);
    const currentValue = normalizeEnergyValue(normalized.energy_level?.value);

    if (!force && currentValue === normalizedValue && currentConfidence >= confidence) return;
    if (!force && currentValue !== "unknown" && currentValue !== normalizedValue && currentConfidence > confidence) return;

    normalized.energy_level = {
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

  const existingEnergy = normalizeEnergyValue(dogInput.current_energy_level);
  const aiEnergy = normalizeEnergyValue(normalized.energy_level?.value);

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
      0.72,
      `Existing structured energy level is ${existingEnergy}.`
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
    setEnergy("moderate", 0.86, "Bio clearly describes moderate energy or regular exercise needs.", true);
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

  if (
    includesAny([
      "separation anxiety",
      "anxious when left alone",
      "does not like to be left alone",
      "doesn't like to be left alone",
      "cannot be left alone",
      "can't be left alone",
    ])
  ) {
    setTraitFromBio("anxiety_or_fear", "true", 0.88, "Bio directly describes separation anxiety or alone-time anxiety.");
  }

  if (
    includesAny([
      "handles alone time beautifully",
      "does well alone",
      "can be left alone",
      "fine when left alone",
    ])
  ) {
    setTraitFromBio("can_be_left_alone", "true", 0.84, "Bio describes the dog doing well when left alone.");
  }

  if (includesAny(["less than 4 hours", "under 4 hours", "no more than 4 hours"])) {
    setNumericTraitFromBio("max_alone_hours_estimate", 4, 0.72, "Bio gives a rough alone-time limit around four hours.");
  } else if (includesAny(["4-6 hours", "4 to 6 hours", "four to six hours"])) {
    setNumericTraitFromBio("max_alone_hours_estimate", 6, 0.72, "Bio gives a rough alone-time range of four to six hours.");
  } else if (includesAny(["6-8 hours", "6 to 8 hours", "six to eight hours"])) {
    setNumericTraitFromBio("max_alone_hours_estimate", 8, 0.72, "Bio gives a rough alone-time range of six to eight hours.");
  }

  if (
    includesAny([
      "needs training",
      "needs basic training",
      "working on manners",
      "working on leash manners",
      "needs leash work",
      "needs an experienced adopter",
      "experienced adopter",
    ])
  ) {
    setTraitFromBio("training_needs", "true", 0.82, "Bio describes training needs or experienced-adopter support.");
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

  const firstTimeValue = String(normalized.first_time_friendly?.value || "").toLowerCase();
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

  const firstTimeEvidenceAvailable =
    dogInput.current_first_time_friendly === true || hasFirstTimeFriendlyEvidence();

  if (
    ["true", "likely", "maybe"].includes(firstTimeValue) &&
    !firstTimeEvidenceAvailable
  ) {
    normalized.first_time_friendly = {
      value: "unknown",
      confidence: 0,
      evidence: "Generic family language was not treated as first-time-owner evidence.",
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

function buildBioColumns(aiTraits) {
  return {
    bio_good_with_kids: safeBioValue(traitToBioValue(aiTraits.good_with_kids)),
    bio_good_with_dogs: safeBioValue(traitToBioValue(aiTraits.good_with_dogs)),
    bio_good_with_cats: safeBioValue(traitToBioValue(aiTraits.good_with_cats)),
    bio_first_time_friendly: safeBioValue(traitToBioValue(aiTraits.first_time_friendly)),
    bio_potty_trained: safeBioValue(traitToBioValue(aiTraits.potty_trained)),
    bio_traits_source: "ai_bio_extraction",
    bio_traits_updated_at: new Date().toISOString(),
  };
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

async function enrichOneDog(dog) {
  const dogInput = asDogInput(dog);

  if (!dogInput.description && !dogInput.breed && !dogInput.size && !dogInput.age_text) {
    console.log(`Skipping ${dog.name || dog.id}: not enough data`);
    return null;
  }

  const started = Date.now();
  const content = await callOpenAI(buildPrompt(dogInput));
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const parsed = safeParseJson(content);
  const aiTraits = normalizeAiTraits(parsed, dogInput);
  const bioColumns = buildBioColumns(aiTraits);

  const { error } = await supabase
    .from("dogs")
    .update({
      ai_traits: aiTraits,
      ai_enriched_at: new Date().toISOString(),
      ai_enrichment_version: AI_ENRICHMENT_VERSION,
      ai_confidence_score: aiTraits.overall_confidence,
      ...bioColumns,
    })
    .eq("id", dog.id);

  if (error) throw error;

  return { aiTraits, bioColumns, elapsed };
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
      adoptable,
      urgency_level,
      shelters (
        name
      )
    `
    )
    .eq("adoptable", true)
    .neq("urgency_level", "Adopted")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (dogId) {
    query = query.eq("id", dogId);
  }

  if (!force && !dogId) {
    query = query.or(
      `ai_enriched_at.is.null,ai_enrichment_version.neq.${AI_ENRICHMENT_VERSION}`
    );
  }

  const { data, error } = await query;

  if (error) throw error;

  return Array.isArray(data) ? data : [];
}

async function main() {
  const limit = Number(getArg("limit", DEFAULT_LIMIT));
  const force = hasFlag("force");
  const dogId = getArg("dog-id", null);

  console.log("========================================");
  console.log("AI dog trait enrichment");
  console.log(`Model: ${MODEL}`);
  console.log(`Version: ${AI_ENRICHMENT_VERSION}`);
  console.log(`Limit: ${Number.isFinite(limit) ? limit : DEFAULT_LIMIT}`);
  console.log(`Force: ${force ? "yes" : "no"}`);
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
  let failed = 0;

  for (const dog of dogs) {
    try {
      console.log(`\nEnriching: ${dog.name || dog.id}`);

      const result = await enrichOneDog(dog);
      if (!result) continue;

      const { aiTraits, bioColumns, elapsed } = result;
      updated += 1;

      const tags = Array.isArray(aiTraits.match_tags)
        ? aiTraits.match_tags.join(", ")
        : "";

      console.log(`✅ Updated ${dog.name || dog.id} in ${elapsed}s`);
      console.log(`   Confidence: ${aiTraits.overall_confidence}`);
      console.log(`   Review: ${aiTraits.needs_human_review ? "yes" : "no"}`);
      console.log(`   bio_good_with_kids: ${bioColumns.bio_good_with_kids}`);
      console.log(`   bio_good_with_dogs: ${bioColumns.bio_good_with_dogs}`);
      console.log(`   bio_good_with_cats: ${bioColumns.bio_good_with_cats}`);
      console.log(`   bio_first_time_friendly: ${bioColumns.bio_first_time_friendly}`);
      console.log(`   bio_potty_trained: ${bioColumns.bio_potty_trained}`);
      if (tags) console.log(`   Tags: ${tags}`);
    } catch (error) {
      failed += 1;
      console.error(`❌ Failed ${dog.name || dog.id}: ${error.message || error}`);
    }
  }

  console.log("\n========================================");
  console.log("AI enrichment complete");
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log("========================================");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
