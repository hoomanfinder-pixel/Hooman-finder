// One-off review script: selects a diverse sample of public dogs, runs the
// real enrich-dogs-ai.cjs pipeline against them in dry-run mode, and prints
// a before/after table per dog. Writes nothing to Supabase. Not part of the
// regular npm scripts; deleted after use.
require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");
const enrich = require("./enrich-dogs-ai.cjs");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SAMPLE_SIZE = 20;

// Fixed to the exact same 20 dogs selected in the first review pass, so this
// rerun is a true before/after comparison of the code changes, not a new
// random sample.
const FIXED_IDS = [
  "de3092c9-6f34-41bf-9b0f-c626009899f3",
  "b5d68b68-2db3-424d-a43a-880baa71490b",
  "f86e3e2a-5737-42b7-87e6-f1f11b6429db",
  "854f1679-7a4a-47eb-a80b-28f3ab36dc41",
  "afa8e566-dec7-409b-955e-a470ceab02f0",
  "a8e1695d-bbc0-4006-9c88-3505be245188",
  "48fd1846-55ec-431d-9489-eb8dab7cf7a1",
  "b3274cec-6f84-4440-99c3-822849efd265",
  "6755067d-c9a0-4098-8e90-503c53e9166e",
  "9f1ab755-45d1-4a5b-9e9e-b92eacfce032",
  "34b6dd8d-149f-4ea2-add6-c36b6b88c816",
  "c9bc09a7-eef1-4a6c-aa59-1438d431e2e5",
  "192c0012-72d0-490e-b33f-aa9502c3b210",
  "6c22afa2-d36f-4ada-b01e-9b321a942e42",
  "6cf79f64-124f-4b5b-9e1f-6564f2ede107",
  "4bca0462-a9a1-4056-83b5-d9403b74f28e",
  "c478725e-41ca-43d0-b5cd-6a3a7bc079ef",
  "bb5f69bb-8a3a-467a-814c-06246082b0bd",
  "ae3eee97-e7f1-4ff4-9139-7a8c9633c24a",
  "edd49656-d1ba-4204-8d3a-f7ea78b2496a",
];

const LONG_COAT_BREEDS = ["poodle", "bichon", "maltese", "shih tzu", "yorkshire terrier", "yorkie"];
const DOUBLE_COAT_BREEDS = ["husky", "german shepherd", "golden retriever", "akita", "great pyrenees", "samoyed", "bernese", "newfoundland"];
const SHORT_COAT_BREEDS = ["pit bull", "boxer", "chihuahua", "doberman", "greyhound", "beagle", "labrador"];

function breedIncludesAny(breed, phrases) {
  const text = String(breed || "").toLowerCase();
  return phrases.some((p) => text.includes(p));
}

function coatCategory(breed) {
  if (breedIncludesAny(breed, LONG_COAT_BREEDS)) return "long/high-maintenance";
  if (breedIncludesAny(breed, DOUBLE_COAT_BREEDS)) return "medium/double-coat";
  if (breedIncludesAny(breed, SHORT_COAT_BREEDS)) return "short";
  return "unclassified";
}

function bioDetailLevel(description) {
  const len = String(description || "").trim().length;
  if (len === 0) return "none";
  if (len < 60) return "limited";
  if (len > 250) return "detailed";
  return "medium";
}

function isMixedBreed(breed) {
  return /\bmix|mixed\b/i.test(String(breed || ""));
}

async function fetchCandidates() {
  const { data, error } = await supabase
    .from("dogs")
    .select(`
      id, name, breed, gender, age_years, age_text, size,
      energy_level, activity_level, exercise_needs, obedience_training,
      shedding_level, barking_level, grooming_level, max_alone_hours,
      good_with_kids, good_with_dogs, good_with_cats, good_with_small_animals,
      potty_trained, first_time_friendly, hypoallergenic,
      description, placement_note, qualities, play_styles,
      shelter_name, ai_traits, ai_enriched_at, ai_enrichment_version,
      bio_good_with_kids, bio_good_with_dogs, bio_good_with_cats,
      bio_first_time_friendly, bio_potty_trained, bio_energy_level,
      bio_shedding_level, bio_max_alone_hours, bio_max_alone_hours_label,
      bio_exercise_needs, bio_training_needs, bio_barking_level,
      bio_grooming_level, bio_size,
      adoptable, adoption_pending, availability_status, urgency_level,
      source_url, adoption_url, source, external_id, rescuegroups_id, rescuegroups_org_id,
      shelters ( name )
    `)
    .eq("adoptable", true)
    .or("adoption_pending.is.null,adoption_pending.eq.false")
    .in("availability_status", ["available", "active", "unknown"])
    .neq("urgency_level", "Adopted")
    .limit(4000);

  if (error) throw error;
  return data || [];
}

// Mirrors src/lib/dogVisibility.js isPubliclyVisibleDog (minus the text-availability-signal
// check, which requires description scanning identical to dogAvailability.js; applied inline).
function clean(v) { return v === null || v === undefined ? "" : String(v).trim(); }
function lower(v) { return clean(v).toLowerCase(); }
const TRUSTED_LISTING_HOSTS = ["rescuegroups.org", "petfinder.com", "adoptapet.com", "shelterluv.com", "petango.com"];
function hasReliableUrl(v) {
  const url = clean(v);
  if (!url.startsWith("https://")) return false;
  try { const { hostname } = new URL(url); return TRUSTED_LISTING_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`)); } catch { return false; }
}
const UNAVAILABLE_TEXT_RULES = [
  /\b(?:adoption\s+pending|pending\s+adoption|application\s+pending|pending\s+application)\b/i,
  /\b(?:on\s+hold|adoption\s+hold|hold\s+for\s+adoption)\b/i,
  /\bcourtesy\s+(?:post|posting|listing)\b/i,
  /\b(?:no\s+longer\s+available|not\s+currently\s+available|unavailable\s+for\s+adoption)\b/i,
  /\b(?:already\s+adopted|has\s+been\s+adopted|adoption\s+finalized)\b/i,
];
function normalizeListingText(v) { return String(v || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ").trim(); }
function hasAvailabilitySignal(dog) {
  const name = normalizeListingText(dog.name);
  if (/\bpending\b/i.test(name) || /\badopted\b/i.test(name) || /\bunavailable\b/i.test(name)) return true;
  const fields = [name, dog.description, dog.placement_note];
  for (const v of fields) { const t = normalizeListingText(v); if (t && UNAVAILABLE_TEXT_RULES.some((re) => re.test(t))) return true; }
  return false;
}

function isPubliclyVisible(dog) {
  if (dog.adoptable !== true) return false;
  if (dog.adoption_pending === true) return false;
  if (lower(dog.urgency_level) === "adopted") return false;
  if (!["active", "available", "unknown"].includes(lower(dog.availability_status))) return false;
  if (hasAvailabilitySignal(dog)) return false;

  const hasRgIdentity = Boolean(clean(dog.rescuegroups_id) || clean(dog.rescuegroups_org_id));
  const hasTrustedSynced = hasRgIdentity || (lower(dog.source) === "rescuegroups" && Boolean(clean(dog.external_id)));
  const verified = dog.verified === true || dog.availability_verified === true || ["current", "trusted", "verified"].includes(lower(dog.source_confidence));
  const hasVerifiedListing = verified && (hasReliableUrl(dog.source_url) || hasReliableUrl(dog.adoption_url));
  return hasTrustedSynced || hasVerifiedListing;
}

function selectSample(dogs) {
  const pool = dogs.filter(isPubliclyVisible);

  const tagged = pool.map((dog) => ({
    dog,
    unenriched: !dog.ai_enriched_at || !dog.ai_traits,
    mixed: isMixedBreed(dog.breed),
    coat: coatCategory(dog.breed),
    bio: bioDetailLevel(dog.description),
  }));

  if (FIXED_IDS.length) {
    const byId = new Map(tagged.map((t) => [t.dog.id, t]));
    return FIXED_IDS.map((id) => byId.get(id)).filter(Boolean);
  }

  const quotas = [
    { key: "unenriched", test: (t) => t.unenriched, need: 8 },
    { key: "mixed", test: (t) => t.mixed, need: 4 },
    { key: "coat:short", test: (t) => t.coat === "short", need: 3 },
    { key: "coat:medium/double-coat", test: (t) => t.coat === "medium/double-coat", need: 3 },
    { key: "coat:long/high-maintenance", test: (t) => t.coat === "long/high-maintenance", need: 3 },
    { key: "bio:detailed", test: (t) => t.bio === "detailed", need: 4 },
    { key: "bio:limited", test: (t) => t.bio === "limited" || t.bio === "none", need: 4 },
  ];

  const picked = [];
  const pickedIds = new Set();

  function tryPick(t) {
    if (pickedIds.has(t.dog.id)) return false;
    if (picked.length >= SAMPLE_SIZE) return false;
    picked.push(t);
    pickedIds.add(t.dog.id);
    return true;
  }

  // Greedily satisfy quotas in order.
  for (const quota of quotas) {
    let satisfied = picked.filter(quota.test).length;
    for (const t of tagged) {
      if (satisfied >= quota.need) break;
      if (!quota.test(t)) continue;
      if (tryPick(t)) satisfied += 1;
    }
  }

  // Fill remaining slots with a spread of whatever's left.
  for (const t of tagged) {
    if (picked.length >= SAMPLE_SIZE) break;
    tryPick(t);
  }

  return picked.slice(0, SAMPLE_SIZE);
}

function fmt(v) {
  if (v === null || v === undefined || v === "" || v === "unknown") return "unknown";
  return String(v);
}

function beforeSnapshot(dog) {
  return {
    energy: fmt(dog.energy_level || dog.activity_level),
    bio_energy: fmt(dog.bio_energy_level),
    exercise_needs: fmt(dog.exercise_needs),
    bio_exercise_needs: fmt(dog.bio_exercise_needs),
    shedding: fmt(dog.shedding_level),
    bio_shedding: fmt(dog.bio_shedding_level),
    trainability_structured: fmt(dog.obedience_training),
    bio_training_needs: fmt(dog.bio_training_needs),
    barking: fmt(dog.barking_level),
    bio_barking: fmt(dog.bio_barking_level),
    grooming: fmt(dog.grooming_level),
    bio_grooming: fmt(dog.bio_grooming_level),
    alone_hours: fmt(dog.max_alone_hours),
    bio_alone_hours: fmt(dog.bio_max_alone_hours_label),
    good_with_dogs: dog.good_with_dogs === true ? "true" : dog.good_with_dogs === false ? "false" : "unknown",
    bio_good_with_dogs: fmt(dog.bio_good_with_dogs),
    good_with_cats: dog.good_with_cats === true ? "true" : dog.good_with_cats === false ? "false" : "unknown",
    bio_good_with_cats: fmt(dog.bio_good_with_cats),
    good_with_kids: dog.good_with_kids === true ? "true" : dog.good_with_kids === false ? "false" : "unknown",
    bio_good_with_kids: fmt(dog.bio_good_with_kids),
    potty_trained: dog.potty_trained === true ? "true" : dog.potty_trained === false ? "false" : "unknown",
    bio_potty_trained: fmt(dog.bio_potty_trained),
    first_time_friendly: dog.first_time_friendly === true ? "true" : dog.first_time_friendly === false ? "false" : "unknown",
    bio_first_time_friendly: fmt(dog.bio_first_time_friendly),
    size: fmt(dog.size),
    bio_size: fmt(dog.bio_size),
  };
}

async function main() {
  console.log("Fetching public dog candidates...");
  const all = await fetchCandidates();
  const sample = selectSample(all);

  console.log(`Selected ${sample.length} dogs for dry-run review.\n`);
  console.log("Selection composition:");
  console.log(`  Zero prior AI enrichment: ${sample.filter((t) => t.unenriched).length}`);
  console.log(`  Mixed breed: ${sample.filter((t) => t.mixed).length}`);
  console.log(`  Short coat: ${sample.filter((t) => t.coat === "short").length}`);
  console.log(`  Medium/double coat: ${sample.filter((t) => t.coat === "medium/double-coat").length}`);
  console.log(`  Long/high-maintenance coat: ${sample.filter((t) => t.coat === "long/high-maintenance").length}`);
  console.log(`  Unclassified coat: ${sample.filter((t) => t.coat === "unclassified").length}`);
  console.log(`  Detailed bio: ${sample.filter((t) => t.bio === "detailed").length}`);
  console.log(`  Limited/no bio: ${sample.filter((t) => t.bio === "limited" || t.bio === "none").length}`);
  console.log(`  Medium bio: ${sample.filter((t) => t.bio === "medium").length}`);
  console.log("");
  console.log("Dog IDs selected:", sample.map((t) => t.dog.id).join(", "));
  console.log("");

  const results = [];

  for (const t of sample) {
    const dog = t.dog;
    const before = beforeSnapshot(dog);

    process.stdout.write(`Enriching ${dog.name || dog.id}... `);

    try {
      const dogInput = enrich.asDogInput(dog);
      const content = await enrich.callOpenAI(enrich.buildPrompt(dogInput));
      const parsed = enrich.safeParseJson(content);
      const aiTraits = enrich.normalizeAiTraits(parsed, dogInput);
      const inferredAdultSize = enrich.inferExpectedAdultSizeForPuppy(dogInput);
      const { merged: bioColumns, carriedForwardFields } = enrich.mergeExistingBioColumns(
        enrich.buildBioColumns(aiTraits, inferredAdultSize),
        dog
      );

      // Mirrors enrichOneDog()'s carry-forward review flag so this standalone
      // review script shows exactly what a real run would persist.
      if (carriedForwardFields.length) {
        aiTraits.needs_human_review = true;
        aiTraits.caution_notes = [
          `Carried forward from a previous run without fresh supporting evidence, so this needs a human check rather than being treated as verified: ${carriedForwardFields.map((k) => enrich.bioFieldLabel(k)).join(", ")}.`,
          ...aiTraits.caution_notes,
        ].slice(0, 8);
      }

      console.log("done");

      results.push({
        dog,
        tags: t,
        before,
        after: bioColumns,
        aiTraits,
        carriedForwardFields,
      });
    } catch (err) {
      console.log(`FAILED: ${err.message || err}`);
      results.push({ dog, tags: t, before, error: err.message || String(err) });
    }
  }

  console.log("\n\n========== BEFORE / AFTER REPORT ==========\n");

  for (const r of results) {
    const { dog, tags, before, after, aiTraits, error } = r;
    console.log(`\n---\n### ${dog.name || dog.id} (id: ${dog.id})`);
    console.log(`Breed: ${dog.breed || "unknown"} | Coat category: ${tags.coat} | Mixed: ${tags.mixed} | Bio: ${tags.bio} | Prior enrichment: ${tags.unenriched ? "none" : dog.ai_enrichment_version || "yes"}`);
    console.log(`Description (${(dog.description || "").length} chars): ${(dog.description || "(none)").slice(0, 200)}${(dog.description || "").length > 200 ? "..." : ""}`);

    if (error) {
      console.log(`ERROR: ${error}`);
      continue;
    }

    console.log(`Overall confidence: ${aiTraits.overall_confidence} | needs_human_review: ${aiTraits.needs_human_review}`);
    if (aiTraits.caution_notes?.length) {
      console.log(`Caution notes: ${aiTraits.caution_notes.join(" | ")}`);
    }

    const rows = [
      ["Energy", before.bio_energy, after.bio_energy_level, aiTraits.energy_level?.confidence, aiTraits.energy_level?.evidence],
      ["Exercise needs", before.bio_exercise_needs, after.bio_exercise_needs, aiTraits.exercise_needs?.confidence, aiTraits.exercise_needs?.evidence],
      ["Shedding", before.bio_shedding, after.bio_shedding_level, aiTraits.shedding_level?.confidence, aiTraits.shedding_level?.evidence],
      ["Trainability", before.bio_training_needs, after.bio_training_needs, aiTraits.training_needs?.confidence, aiTraits.training_needs?.evidence],
      ["Barking (NEW)", before.bio_barking, after.bio_barking_level, aiTraits.barking_level?.confidence, aiTraits.barking_level?.evidence],
      ["Grooming (NEW)", before.bio_grooming, after.bio_grooming_level, aiTraits.grooming_level?.confidence, aiTraits.grooming_level?.evidence],
      ["Alone time", before.bio_alone_hours, after.bio_max_alone_hours_label, aiTraits.max_alone_hours_estimate?.confidence, aiTraits.max_alone_hours_estimate?.evidence],
      ["Good w/ dogs", before.bio_good_with_dogs, after.bio_good_with_dogs, aiTraits.good_with_dogs?.confidence, aiTraits.good_with_dogs?.evidence],
      ["Good w/ cats", before.bio_good_with_cats, after.bio_good_with_cats, aiTraits.good_with_cats?.confidence, aiTraits.good_with_cats?.evidence],
      ["Good w/ kids", before.bio_good_with_kids, after.bio_good_with_kids, aiTraits.good_with_kids?.confidence, aiTraits.good_with_kids?.evidence],
      ["Potty trained", before.bio_potty_trained, after.bio_potty_trained, aiTraits.potty_trained?.confidence, aiTraits.potty_trained?.evidence],
      ["First-time friendly", before.bio_first_time_friendly, after.bio_first_time_friendly, aiTraits.first_time_friendly?.confidence, aiTraits.first_time_friendly?.evidence],
      ["Size (puppy est.)", before.bio_size, after.bio_size || "none", null, ""],
    ];

    console.log("\nField | Before | After | Confidence | Changed | Evidence");
    for (const [field, bef, aft, conf, evidence] of rows) {
      const changed = String(bef) !== String(aft) ? "YES" : "";
      console.log(`  ${field} | ${bef} | ${aft} | ${conf ?? "-"} | ${changed} | ${evidence || ""}`);
    }
  }

  console.log("\n\n(Nothing was written to Supabase.)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
