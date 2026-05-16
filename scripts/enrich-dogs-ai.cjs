// scripts/enrich-dogs-ai.cjs
// AI dog trait enrichment using plain fetch instead of the OpenAI SDK.
//
// Run:
//   node scripts/enrich-dogs-ai.cjs --limit=1 --force
//   node scripts/enrich-dogs-ai.cjs --limit=3 --force

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const AI_ENRICHMENT_VERSION = "dog-ai-traits-v2";
const DEFAULT_LIMIT = 10;
const MODEL = "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

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
- If something is implied but not certain, use "maybe".
- Existing boolean fields are only provided when true. Missing/null means unknown.
- Never claim good_with_kids, good_with_cats, good_with_dogs, potty_trained, or first_time_friendly unless there is evidence.
- For first_time_friendly:
  - "true" only with clear easygoing/manageable/beginner-friendly behavior or training evidence.
  - "false" only with clear experienced-adopter/breed-experience/major behavior needs.
  - "maybe" is okay for mild positive signs like loving/family-friendly language or manageable energy.
  - "unknown" when generic, copied, mismatched, or not enough behavior detail.
- "great addition to any family" can support "maybe" for first_time_friendly, but not "true" by itself.
- "research the breed before applying" should lower confidence and suggest review.
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

function normalizeTraitObject(obj, fallbackValue = "unknown") {
  if (!obj || typeof obj !== "object") {
    return { value: fallbackValue, confidence: 0, evidence: "" };
  }

  return {
    ...obj,
    value: obj.value ?? fallbackValue,
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
    max_alone_hours_estimate: normalizeTraitObject(parsed.max_alone_hours_estimate, null),
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

  const description = String(dogInput.description || "");
  const descriptionLower = description.toLowerCase();

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

  const existingEnergy = String(dogInput.current_energy_level || "").toLowerCase();

  if (["low", "moderate", "high"].includes(existingEnergy)) {
    normalized.energy_level = {
      value: existingEnergy,
      confidence: Math.max(normalized.energy_level?.confidence || 0, 0.8),
      evidence: `Existing structured energy level is ${existingEnergy}.`,
    };
  } else if (!["low", "moderate", "high", "unknown"].includes(String(normalized.energy_level?.value || "").toLowerCase())) {
    normalized.energy_level = {
      value: "unknown",
      confidence: 0,
      evidence: "AI returned an invalid energy value, so it was treated as unknown.",
    };
  }

  const firstTimeValue = String(normalized.first_time_friendly?.value || "").toLowerCase();
  const firstTimeEvidence = String(normalized.first_time_friendly?.evidence || "").toLowerCase();

  const firstTimeBasedOnlyOnGenericFamilyLanguage =
    firstTimeValue === "maybe" &&
    (
      firstTimeEvidence.includes("great addition to any family") ||
      firstTimeEvidence.includes("addition to any family") ||
      firstTimeEvidence.includes("loving")
    );

  if (firstTimeBasedOnlyOnGenericFamilyLanguage) {
    normalized.first_time_friendly = {
      ...normalized.first_time_friendly,
      value: "maybe",
      confidence: Math.min(normalized.first_time_friendly.confidence || 0.5, 0.55),
      evidence: normalized.first_time_friendly.evidence || "Generic family-friendly language suggests possible fit, but behavior details are limited.",
    };
  }

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
      evidence.includes("not compatible");

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

  const { error } = await supabase
    .from("dogs")
    .update({
      ai_traits: aiTraits,
      ai_enriched_at: new Date().toISOString(),
      ai_enrichment_version: AI_ENRICHMENT_VERSION,
      ai_confidence_score: aiTraits.overall_confidence,
    })
    .eq("id", dog.id);

  if (error) throw error;

  return { aiTraits, elapsed };
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

      const { aiTraits, elapsed } = result;
      updated += 1;

      const tags = Array.isArray(aiTraits.match_tags)
        ? aiTraits.match_tags.join(", ")
        : "";

      console.log(`✅ Updated ${dog.name || dog.id} in ${elapsed}s`);
      console.log(`   Confidence: ${aiTraits.overall_confidence}`);
      console.log(`   Review: ${aiTraits.needs_human_review ? "yes" : "no"}`);
      console.log(
        `   First-time friendly: ${aiTraits.first_time_friendly?.value || "unknown"} (${aiTraits.first_time_friendly?.confidence ?? 0})`
      );
      console.log(
        `   Potty trained: ${aiTraits.potty_trained?.value || "unknown"} (${aiTraits.potty_trained?.confidence ?? 0})`
      );
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