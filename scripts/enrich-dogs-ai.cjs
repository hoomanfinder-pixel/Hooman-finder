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

const AI_ENRICHMENT_VERSION = "dog-ai-traits-v7";
const DEFAULT_LIMIT = 10;
const MODEL = "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const BIO_VALUES = new Set(["yes", "most_likely", "may_do_well", "no", "unknown"]);
const ENERGY_VALUES = new Set(["low", "medium_low", "medium", "medium_high", "high", "unknown"]);
const SHEDDING_VALUES = new Set(["low", "medium", "high", "unknown"]);
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

function normalizeSizeLabel(value) {
  const text = String(value || "").toLowerCase().trim();
  if (!text) return null;

  if (text.includes("x-large") || text.includes("extra large") || text.includes("xlarge")) {
    return "X-Large";
  }

  if (text.includes("large")) return "Large";
  if (text.includes("medium")) return "Medium";
  if (text.includes("small")) return "Small";

  return null;
}

function isClearlyPuppy({ ageYears, ageText }) {
  const n = Number(ageYears);
  if (Number.isFinite(n)) return n < 1.5;

  const text = String(ageText || "").toLowerCase();
  if (!text) return false;

  if (text.includes("puppy")) return true;

  const monthMatch = text.match(/(\d+)\s*months?/);
  if (monthMatch) return Number(monthMatch[1]) < 18;

  return false;
}

function breedIncludesAny(breed, phrases) {
  const text = String(breed || "").toLowerCase();
  if (!text) return false;
  return phrases.some((phrase) => text.includes(phrase));
}

function inferExpectedAdultSizeForPuppy(dogInput) {
  const currentSize = normalizeSizeLabel(dogInput.size);

  if (!isClearlyPuppy({ ageYears: dogInput.age_years, ageText: dogInput.age_text })) {
    return null;
  }

  // This is expected adult size inference for puppies only. It prevents young
  // large-breed puppies from being permanently treated as small based on current size.
  if (currentSize === "Large" || currentSize === "X-Large") return null;

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

  function ageStage() {
    const n = Number(dogInput.age_years);
    if (Number.isFinite(n)) {
      if (n < 1.5) return "puppy";
      if (n < 3) return "young";
      if (n >= 7) return "senior";
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
  } else if (
    normalizeSheddingValue(normalized.shedding_level?.value) === "unknown" &&
    breedIncludesAny(dogInput.breed, ["hairless", "chinese crested", "xoloitzcuintli", "xolo"])
  ) {
    setShedding("low", 0.78, "Hairless or very low-coat breed type indicates low shedding.");
  } else if (
    normalizeSheddingValue(normalized.shedding_level?.value) === "unknown" &&
    breedIncludesAny(dogInput.breed, ["poodle", "bichon", "maltese", "shih tzu", "yorkshire terrier", "yorkie"])
  ) {
    setShedding(mixedOrUnclearBreed ? "medium" : "low", mixedOrUnclearBreed ? 0.52 : 0.66, "Breed/coat type gives a cautious shedding estimate.");
  } else if (
    normalizeSheddingValue(normalized.shedding_level?.value) === "unknown" &&
    breedIncludesAny(dogInput.breed, [
      "husky",
      "german shepherd",
      "golden retriever",
      "labrador",
      "akita",
      "great pyrenees",
      "samoyed",
      "bernese",
      "newfoundland",
    ])
  ) {
    setShedding("high", 0.68, "Breed/coat type commonly indicates higher shedding.");
  } else if (
    normalizeSheddingValue(normalized.shedding_level?.value) === "unknown" &&
    breedIncludesAny(dogInput.breed, ["pit bull", "boxer", "chihuahua", "doberman", "greyhound"])
  ) {
    setShedding("low", 0.58, "Short-coated breed type gives a cautious low shedding estimate.");
  } else if (
    normalizeSheddingValue(normalized.shedding_level?.value) === "unknown" &&
    breedIncludesAny(dogInput.breed, ["beagle", "dachshund"])
  ) {
    setShedding("medium", 0.56, "Short-coated breed type gives a cautious medium shedding estimate.");
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
    (ageMonthsMatch && Number(ageMonthsMatch[1]) <= 6) ||
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
    setNumericTraitFromBio("max_alone_hours_estimate", 8, 0.82, "Bio explicitly gives an alone-time range up to a normal workday.");
  } else if (includesAny(["4-6 hours", "4 to 6 hours", "four to six hours", "5-6 hours", "5 to 6 hours"])) {
    setNumericTraitFromBio("max_alone_hours_estimate", 6, 0.8, "Bio explicitly gives an alone-time range around four to six hours.");
  } else if (includesAny(["less than 4 hours", "under 4 hours", "no more than 4 hours", "3-4 hours", "3 to 4 hours"])) {
    setNumericTraitFromBio("max_alone_hours_estimate", 4, 0.78, "Bio explicitly gives a shorter alone-time limit around three to four hours.");
  } else if (hasSevereAloneConcern) {
    setNumericTraitFromBio("max_alone_hours_estimate", 2, 0.74, "Clear distress, very young puppy, support, or monitoring needs indicate a short alone-time tolerance.");
  } else if (hasMildAloneConcern || (stage === "young" && includesAny(["still learning", "needs patience", "adjusting"]))) {
    setNumericTraitFromBio("max_alone_hours_estimate", 4, 0.58, "Mild alone-time, anxiety, or adjustment needs support a three-to-four-hour estimate.");
  } else if (hasStrongWorkdayEvidence) {
    setNumericTraitFromBio("max_alone_hours_estimate", 8, 0.72, "Strong adult/senior independence evidence supports a seven-to-eight-hour estimate.");
  } else if (hasModerateAloneEvidence) {
    setNumericTraitFromBio("max_alone_hours_estimate", 6, 0.58, "Calm, trained, or low-energy adult/senior evidence supports a five-to-six-hour estimate.");
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

function buildBioColumns(aiTraits) {
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
    bio_traits_source: "ai_bio_extraction",
    bio_traits_updated_at: new Date().toISOString(),
  };
}

function mergeExistingBioColumns(nextColumns, dog) {
  const merged = { ...nextColumns };

  for (const key of [
    "bio_good_with_kids",
    "bio_good_with_dogs",
    "bio_good_with_cats",
    "bio_potty_trained",
  ]) {
    if (merged[key] === "unknown" && BIO_VALUES.has(dog?.[key]) && dog[key] !== "unknown") {
      merged[key] = dog[key];
    }
  }

  for (const key of ["bio_energy_level", "bio_exercise_needs", "bio_training_needs"]) {
    const existing = normalizeEnergyLikeValue(dog?.[key]);
    if (merged[key] === "unknown" && existing !== "unknown") {
      merged[key] = existing;
    }
  }

  const existingShedding = normalizeSheddingValue(dog?.bio_shedding_level);
  if (merged.bio_shedding_level === "unknown" && existingShedding !== "unknown") {
    merged.bio_shedding_level = existingShedding;
  }

  return merged;
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
  if (inferredAdultSize && inferredAdultSize !== normalizeSizeLabel(dog.size)) {
    aiTraits.caution_notes = [
      `AI inferred likely adult puppy size as ${inferredAdultSize}, but did not overwrite the shelter/API size field.`,
      ...aiTraits.caution_notes,
    ].slice(0, 8);
  }
  const bioColumns = mergeExistingBioColumns(buildBioColumns(aiTraits), dog);

  const updatePayload = {
    ai_traits: aiTraits,
    ai_enriched_at: new Date().toISOString(),
    ai_enrichment_version: AI_ENRICHMENT_VERSION,
    ai_confidence_score: aiTraits.overall_confidence,
    needs_human_review: aiTraits.needs_human_review,
    ...bioColumns,
  };

  const { error } = await supabase
    .from("dogs")
    .update(updatePayload)
    .eq("id", dog.id);

  if (error) throw error;

  return { aiTraits, bioColumns, inferredAdultSize, elapsed };
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
      bio_traits_updated_at,
      needs_human_review,
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

      const { aiTraits, bioColumns, inferredAdultSize, elapsed } = result;
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
      console.log(`   bio_energy_level: ${bioColumns.bio_energy_level}`);
      console.log(`   bio_shedding_level: ${bioColumns.bio_shedding_level}`);
      console.log(`   bio_max_alone_hours: ${bioColumns.bio_max_alone_hours ?? "unknown"}`);
      console.log(`   bio_exercise_needs: ${bioColumns.bio_exercise_needs}`);
      console.log(`   bio_training_needs: ${bioColumns.bio_training_needs}`);
      if (inferredAdultSize) console.log(`   inferred adult puppy size note: ${inferredAdultSize}`);
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
