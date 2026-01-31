// src/pages/Quiz.jsx
import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import OptionSelect from "../components/OptionSelect";
import AccordionSection from "../components/AccordionSection";
import { rankDogs } from "../lib/matchingLogic";

const STORAGE_KEY = "hooman_quiz_answers_v5";

// Multi-select questions that contain exclusive values (e.g., "no_preference")
const EXCLUSIVE_MULTI = {
  play_styles: ["no_preference"],
  size_preference: ["any"],
  age_preference: ["any"],
  shedding_levels: ["no_preference"],
  pets_in_home: ["none", "not_sure"],
  behavior_tolerance: ["no_preference"],
};

function safeParseJSON(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function makeSessionId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  const rand = Math.random().toString(16).slice(2);
  const time = Date.now().toString(16);
  return `sess_${time}_${rand}`;
}

function computeSheddingPreferenceFromLevels(levels) {
  const arr = Array.isArray(levels) ? levels : [];
  if (arr.includes("no_preference")) return "no_preference";
  if (arr.includes("minimal")) return "minimal";
  if (arr.includes("moderate")) return "moderate";
  if (arr.includes("heavy_ok")) return "heavy_ok";
  return "no_preference";
}

function formatSupabaseError(e) {
  if (!e) return "Unknown error.";
  if (typeof e === "string") return e;

  const parts = [];
  if (e.message) parts.push(e.message);
  if (e.details) parts.push(e.details);
  if (e.hint) parts.push(e.hint);
  if (e.code) parts.push(`(code: ${e.code})`);

  return parts.filter(Boolean).join(" • ") || "Something went wrong.";
}

// ---------- display helpers ----------
function titleCaseWords(s) {
  return String(s)
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function prettyValue(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = String(v).replaceAll("_", " ").replaceAll("-", " ");
  return titleCaseWords(s);
}

function prettyArray(arr, { flexToken = "Flexible", max = 2 } = {}) {
  const a = Array.isArray(arr) ? arr : [];
  if (!a.length) return "";
  if (a.includes("no_preference") || a.includes("any") || a.includes("not_sure")) return flexToken;
  const shown = a.slice(0, max).map(prettyValue).join(", ");
  return a.length > max ? `${shown}…` : shown;
}
// -----------------------------------

export default function Quiz() {
  const navigate = useNavigate();

  const initial = useMemo(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return safeParseJSON(raw);
  }, []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  // Quick mode (expand all)
  const [quickMode, setQuickMode] = useState(false);

  // Which TIER accordion is open when not in quick mode
  const [openTierId, setOpenTierId] = useState("tier_dealbreakers");

  // Refs for scroll-to-tier
  const tierRefs = useRef({});

  const [answers, setAnswers] = useState({
    play_styles: Array.isArray(initial.play_styles) ? initial.play_styles : [],
    energy_preference: initial.energy_preference || "",
    size_preference: Array.isArray(initial.size_preference) ? initial.size_preference : [],
    age_preference: Array.isArray(initial.age_preference) ? initial.age_preference : [],
    potty_requirement: initial.potty_requirement || "",
    kids_in_home: initial.kids_in_home || "",
    pets_in_home: Array.isArray(initial.pets_in_home) ? initial.pets_in_home : [],
    first_time_owner: initial.first_time_owner || "",
    allergy_sensitivity: initial.allergy_sensitivity || "",
    shedding_levels: Array.isArray(initial.shedding_levels) ? initial.shedding_levels : [],
    noise_preference: initial.noise_preference || "",
    alone_time: initial.alone_time || "",
    yard: typeof initial.yard === "boolean" ? initial.yard : null,

    kids_age_band: initial.kids_age_band || "",
    dog_social_preference: initial.dog_social_preference || "",

    housing_type: initial.housing_type || "",
    landlord_restrictions: initial.landlord_restrictions || "",
    stairs: initial.stairs || "",

    daily_walk_minutes: initial.daily_walk_minutes || "",
    weekend_activity_style: initial.weekend_activity_style || "",

    training_commitment_level: initial.training_commitment_level || "",
    behavior_tolerance: Array.isArray(initial.behavior_tolerance) ? initial.behavior_tolerance : [],
    reactivity_comfort: initial.reactivity_comfort || "",

    crate_ok: initial.crate_ok || "",
    separation_anxiety_willingness: initial.separation_anxiety_willingness || "",

    monthly_pet_budget_range: initial.monthly_pet_budget_range || "",
    medical_needs_ok: initial.medical_needs_ok || "",
    medication_comfort: initial.medication_comfort || "",
  });

  // --------------------------
  // Question definitions
  // --------------------------
  const questions = [
    // ----------------
    // Deal-breakers group
    // ----------------
    // Preferences
    {
      key: "size_preference",
      section: "sec_preferences",
      title: "What size dog are you open to?",
      multiple: true,
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" },
        { value: "xlarge", label: "Extra large" },
        { value: "any", label: "Any size / flexible" },
      ],
    },
    {
      key: "age_preference",
      section: "sec_preferences",
      title: "What ages are you open to?",
      multiple: true,
      options: [
        { value: "puppy", label: "Puppy (0–1)" },
        { value: "adult", label: "Adult (2–6)" },
        { value: "senior", label: "Senior (7+)" },
        { value: "any", label: "Any age / flexible" },
      ],
    },

    // Household
    {
      key: "kids_in_home",
      section: "sec_household",
      title: "Do you have kids in the home (or frequent kid visits)?",
      description: "We can filter out unsafe matches.",
      multiple: false,
      options: [
        { value: "yes", label: "Yes", help: "Only show dogs marked good with kids." },
        { value: "no", label: "No", help: "No restriction." },
      ],
    },
    {
      key: "kids_age_band",
      section: "sec_household",
      title: "If yes, what ages are the kids?",
      description: "This helps avoid mismatch with toddlers vs teens.",
      multiple: false,
      options: [
        { value: "baby", label: "Baby (0–1)" },
        { value: "toddler", label: "Toddler (2–4)" },
        { value: "elementary", label: "Elementary (5–10)" },
        { value: "teen", label: "Teen (11+)" },
        { value: "not_sure", label: "Not sure / varies" },
        { value: "no_preference", label: "No preference / flexible" },
      ],
      isVisible: (a) => a.kids_in_home === "yes",
    },
    {
      key: "pets_in_home",
      section: "sec_household",
      title: "What animals will your dog need to be comfortable around?",
      description: "Pick all that apply.",
      multiple: true,
      options: [
        { value: "dogs", label: "Other dogs" },
        { value: "cats", label: "Cats" },
        { value: "small_animals", label: "Small animals" },
        { value: "none", label: "No other animals / not important" },
        { value: "not_sure", label: "Not sure / flexible" },
      ],
    },

    // Potty + Alone-time deal breakers
    {
      key: "potty_requirement",
      section: "sec_potty_alone",
      title: "How important is potty training?",
      multiple: false,
      options: [
        { value: "must", label: "Must be potty trained" },
        { value: "preferred", label: "Preferred" },
        { value: "no_matter", label: "Doesn’t matter / I’m open to training" },
      ],
    },
    {
      key: "alone_time",
      section: "sec_potty_alone",
      title: "On a typical weekday, how long will the dog be alone?",
      multiple: false,
      options: [
        { value: "lt4", label: "Less than 4 hours" },
        { value: "4to6", label: "4–6 hours" },
        { value: "6to8", label: "6–8 hours" },
        { value: "gt8", label: "8+ hours" },
        { value: "not_sure", label: "Not sure / varies" },
      ],
    },
    {
      key: "separation_anxiety_willingness",
      section: "sec_potty_alone",
      title: "If a dog has separation anxiety, are you willing to work through it?",
      multiple: false,
      options: [
        { value: "yes", label: "Yes, I’m willing" },
        { value: "maybe", label: "Maybe (depends)" },
        { value: "no", label: "No, I need a dog that can be alone" },
        { value: "not_sure", label: "Not sure" },
      ],
    },

    // Housing hard constraints
    {
      key: "housing_type",
      section: "sec_housing_constraints",
      title: "What best describes your home right now?",
      multiple: false,
      options: [
        { value: "apartment", label: "Apartment" },
        { value: "townhouse", label: "Townhouse / duplex" },
        { value: "house", label: "House" },
        { value: "other", label: "Other / not sure" },
      ],
    },
    {
      key: "landlord_restrictions",
      section: "sec_housing_constraints",
      title: "Any landlord / HOA restrictions?",
      multiple: false,
      options: [
        { value: "none", label: "None" },
        { value: "weight_limit", label: "Weight limit" },
        { value: "breed_restrictions", label: "Breed restrictions" },
        { value: "unknown", label: "Not sure / unknown" },
      ],
    },

    // ----------------
    // Improve matches group
    // ----------------
    {
      key: "dog_social_preference",
      section: "sec_improve_social_owner",
      title: "How should your dog feel about other dogs?",
      multiple: false,
      options: [
        { value: "must_love_dogs", label: "Must be very dog-friendly" },
        { value: "selective_ok", label: "Selective is okay" },
        { value: "prefer_only_dog", label: "Prefer a dog that can be the only dog" },
        { value: "no_preference", label: "No preference / flexible" },
      ],
    },
    {
      key: "first_time_owner",
      section: "sec_improve_social_owner",
      title: "Are you a first-time dog owner?",
      multiple: false,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "not_sure", label: "Not sure" },
      ],
    },

    // Crate (Improve Matches)
    {
      key: "crate_ok",
      section: "sec_improve_crate",
      title: "Are you open to crate training (or using a crate when needed)?",
      multiple: false,
      options: [
        { value: "yes", label: "Yes" },
        { value: "maybe", label: "Maybe / depends" },
        { value: "no", label: "No" },
        { value: "not_sure", label: "Not sure" },
      ],
    },

    // Activity
    {
      key: "daily_walk_minutes",
      section: "sec_improve_activity",
      title: "On most days, how much walking/exercise can you realistically do?",
      multiple: false,
      options: [
        { value: "0to15", label: "0–15 minutes/day" },
        { value: "15to30", label: "15–30 minutes/day" },
        { value: "30to60", label: "30–60 minutes/day" },
        { value: "60plus", label: "60+ minutes/day" },
        { value: "not_sure", label: "Not sure / varies" },
      ],
    },
    {
      key: "weekend_activity_style",
      section: "sec_improve_activity",
      title: "Weekends are usually…",
      multiple: false,
      options: [
        { value: "homebody", label: "Homebody / chill" },
        { value: "moderate", label: "Moderately active" },
        { value: "outdoorsy", label: "Outdoorsy / very active" },
        { value: "not_sure", label: "Not sure / varies" },
      ],
    },
    {
      key: "energy_preference",
      section: "sec_improve_activity",
      title: "What energy level fits your life right now?",
      multiple: false,
      options: [
        { value: "low", label: "Low energy" },
        { value: "moderate", label: "Moderate" },
        { value: "high", label: "High energy" },
        { value: "any", label: "Any / I’m flexible" },
      ],
    },
    {
      key: "play_styles",
      section: "sec_improve_activity",
      title: "What play styles do you want in a dog?",
      multiple: true,
      options: [
        { value: "fetch", label: "Fetch" },
        { value: "tug", label: "Tug-of-war" },
        { value: "chews", label: "Chews/destroys toys" },
        { value: "enjoys_all", label: "Enjoys all kinds of play" },
        { value: "ignores_toys", label: "Mostly ignores toys" },
        { value: "no_preference", label: "No preference / I’m flexible" },
      ],
    },

    // Training & Behavior
    {
      key: "training_commitment_level",
      section: "sec_improve_behavior",
      title: "How much training time are you willing to put in (weekly)?",
      multiple: false,
      options: [
        { value: "low", label: "Low (0–1 hrs/week)" },
        { value: "medium", label: "Medium (1–3 hrs/week)" },
        { value: "high", label: "High (3+ hrs/week)" },
        { value: "not_sure", label: "Not sure" },
      ],
    },
    {
      key: "reactivity_comfort",
      section: "sec_improve_behavior",
      title: "If a dog is reactive (barks/lunges on leash), are you comfortable working on it?",
      multiple: false,
      options: [
        { value: "no", label: "No, I need a very easy dog" },
        { value: "mild_ok", label: "Mild is okay" },
        { value: "willing_to_work", label: "Yes, I can work on it" },
        { value: "not_sure", label: "Not sure" },
      ],
    },
    {
      key: "behavior_tolerance",
      section: "sec_improve_behavior",
      title: "What challenges are you okay working through?",
      multiple: true,
      options: [
        { value: "jumping", label: "Jumping" },
        { value: "barking", label: "Barking/vocal" },
        { value: "chewing", label: "Chewing/destroying" },
        { value: "leash_pulling", label: "Leash pulling" },
        { value: "accidents", label: "Accidents while adjusting" },
        { value: "no_preference", label: "No preference / flexible" },
      ],
    },

    // ----------------
    // Fine-tune group
    // ----------------
    {
      key: "noise_preference",
      section: "sec_finetune_comfort",
      title: "How do you feel about barking?",
      multiple: false,
      options: [
        { value: "alert_ok", label: "I like an alert dog (barking is fine)" },
        { value: "some_ok", label: "Some barking is fine" },
        { value: "prefer_quiet", label: "I prefer a mostly quiet dog" },
        { value: "need_very_quiet", label: "I need a very quiet dog" },
        { value: "no_pref", label: "No strong preference" },
      ],
    },

    // Yard + Stairs (Fine-tune)
    {
      key: "yard",
      section: "sec_finetune_home",
      title: "Do you have access to a yard or fenced outdoor space?",
      multiple: false,
      options: [
        { key: "yard_yes", value: true, label: "Yes" },
        { key: "yard_no", value: false, label: "No" },
        { key: "yard_flex", value: null, label: "Not sure / doesn’t matter" },
      ],
    },
    {
      key: "stairs",
      section: "sec_finetune_home",
      title: "Stairs situation?",
      multiple: false,
      options: [
        { value: "none", label: "No stairs" },
        { value: "some", label: "A few stairs" },
        { value: "many", label: "Multiple flights" },
        { value: "not_sure", label: "Not sure / varies" },
      ],
    },

    // Allergies / shedding
    {
      key: "allergy_sensitivity",
      section: "sec_finetune_allergies",
      title: "Do you have allergies?",
      multiple: false,
      options: [
        { value: "have_allergies", label: "I have allergies (need hypoallergenic / low-shedding)" },
        { value: "mild_allergies", label: "Mild allergies (some shedding is okay)" },
        { value: "no_allergies", label: "No allergies / doesn’t matter" },
      ],
    },
    {
      key: "shedding_levels",
      section: "sec_finetune_allergies",
      title: "What shedding levels are you comfortable with?",
      multiple: true,
      options: [
        { value: "minimal", label: "Minimal shedding" },
        { value: "moderate", label: "Moderate shedding" },
        { value: "heavy_ok", label: "Heavy shedding okay" },
        { value: "no_preference", label: "No preference / flexible" },
      ],
    },

    // Budget & medical
    {
      key: "monthly_pet_budget_range",
      section: "sec_finetune_cost_medical",
      title: "Monthly pet budget comfort (roughly)?",
      multiple: false,
      options: [
        { value: "low", label: "Low ($0–$75)" },
        { value: "medium", label: "Medium ($75–$200)" },
        { value: "high", label: "High ($200+)" },
        { value: "not_sure", label: "Not sure" },
      ],
    },
    {
      key: "medical_needs_ok",
      section: "sec_finetune_cost_medical",
      title: "Are you open to a dog with medical needs?",
      multiple: false,
      options: [
        { value: "yes", label: "Yes" },
        { value: "maybe", label: "Maybe (depends)" },
        { value: "no", label: "No, I need low medical needs" },
        { value: "not_sure", label: "Not sure" },
      ],
    },
    {
      key: "medication_comfort",
      section: "sec_finetune_cost_medical",
      title: "Are you comfortable giving medication if needed?",
      multiple: false,
      options: [
        { value: "yes", label: "Yes" },
        { value: "maybe", label: "Maybe" },
        { value: "no", label: "No" },
        { value: "not_sure", label: "Not sure" },
      ],
    },
  ];

  const allQuestionsByKey = useMemo(() => {
    const map = {};
    for (const q of questions) map[q.key] = q;
    return map;
  }, [questions]);

  function applyExclusiveMulti(key, nextVal) {
    const exclusives = EXCLUSIVE_MULTI[key] || [];
    if (!Array.isArray(nextVal) || exclusives.length === 0) return nextVal;

    const set = new Set(nextVal);
    const pickedExclusive = exclusives.find((x) => set.has(x));
    if (pickedExclusive) return [pickedExclusive];

    exclusives.forEach((x) => set.delete(x));
    return Array.from(set);
  }

  function updateAnswer(key, val) {
    let nextVal = val;

    const meta = allQuestionsByKey[key];
    if (meta?.multiple) {
      nextVal = applyExclusiveMulti(key, Array.isArray(val) ? val : []);
    }

    const next = { ...answers, [key]: nextVal };
    setAnswers(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  // ---- "answered count" for quality meter (no required gating) ----
  function isAnswered(q, a) {
    if (q.isVisible && !q.isVisible(a)) return false; // if hidden, don't count
    const v = a[q.key];
    if (q.multiple) return Array.isArray(v) && v.length > 0;
    if (typeof v === "boolean") return true; // boolean counts if set true/false
    return v !== "" && v !== null && v !== undefined;
  }

  const visibleQuestions = questions.filter((q) => !q.isVisible || q.isVisible(answers));
  const answeredCount = visibleQuestions.filter((q) => isAnswered(q, answers)).length;
  const totalCount = visibleQuestions.length;
  const answeredPct = totalCount ? Math.round((answeredCount / totalCount) * 100) : 0;

  function sectionStatus(sectionId) {
    const qs = visibleQuestions.filter((q) => q.section === sectionId);
    if (!qs.length) return "empty";
    const answered = qs.filter((q) => isAnswered(q, answers)).length;
    if (answered === 0) return "empty";
    if (answered === qs.length) return "complete";
    return "partial";
  }

  function tierStatus(sectionIds) {
    const qs = visibleQuestions.filter((q) => sectionIds.includes(q.section));
    if (!qs.length) return "empty";
    const answered = qs.filter((q) => isAnswered(q, answers)).length;
    if (answered === 0) return "empty";
    if (answered === qs.length) return "complete";
    return "partial";
  }

  function openTier(id) {
    setOpenTierId(id);
    requestAnimationFrame(() => {
      const el = tierRefs.current[id];
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  // --------------------------
  // Display blocks (subsections inside tiers)
  // --------------------------
  const SECTION_META = [
    // Deal Breakers
    { id: "sec_preferences", title: "Size & Age" },
    { id: "sec_household", title: "Household Safety" },
    { id: "sec_potty_alone", title: "Potty + Alone Time" },
    { id: "sec_housing_constraints", title: "Housing Constraints" },

    // Improve Matches
    { id: "sec_improve_social_owner", title: "Dog Social + Owner Experience" },
    { id: "sec_improve_crate", title: "Crate Training" },
    { id: "sec_improve_activity", title: "Activity & Energy" },
    { id: "sec_improve_behavior", title: "Training & Behavior" },

    // Fine-Tune
    { id: "sec_finetune_comfort", title: "Comfort & Noise" },
    { id: "sec_finetune_home", title: "Home Logistics" },
    { id: "sec_finetune_allergies", title: "Allergies & Shedding" },
    { id: "sec_finetune_cost_medical", title: "Budget & Medical" },
  ];

  const tierDefs = [
    {
      id: "tier_dealbreakers",
      title: "Deal Breakers",
      helper: "Hard filters. Answer a few here and you’ll get solid matches.",
      sectionIds: ["sec_preferences", "sec_household", "sec_potty_alone", "sec_housing_constraints"],
      summary: (a) => {
        const parts = [];
        parts.push(`Size: ${prettyArray(a.size_preference, { flexToken: "Any" }) || "—"}`);
        parts.push(`Age: ${prettyArray(a.age_preference, { flexToken: "Any" }) || "—"}`);

        if (a.kids_in_home) parts.push(`Kids: ${a.kids_in_home === "yes" ? "Yes" : "No"}`);
        const pets = Array.isArray(a.pets_in_home) ? a.pets_in_home : [];
        if (pets.length) {
          if (pets.includes("none")) parts.push("Pets: None");
          else if (pets.includes("not_sure")) parts.push("Pets: Flexible");
          else parts.push(`Pets: ${pets.map(prettyValue).join(", ")}`);
        }

        if (a.potty_requirement) parts.push(`Potty: ${prettyValue(a.potty_requirement)}`);

        const aloneMap = {
          lt4: "<4 hrs",
          "4to6": "4–6 hrs",
          "6to8": "6–8 hrs",
          gt8: "8+ hrs",
          not_sure: "Varies",
        };
        if (a.alone_time) parts.push(`Alone: ${aloneMap[a.alone_time] ?? prettyValue(a.alone_time)}`);

        if (a.landlord_restrictions) parts.push(`Restrictions: ${prettyValue(a.landlord_restrictions)}`);
        if (a.housing_type) parts.push(`Home: ${prettyValue(a.housing_type)}`);

        return parts.filter(Boolean).join(" • ");
      },
    },
    {
      id: "tier_improve",
      title: "Improve Matches",
      helper: "This is where results get noticeably smarter.",
      sectionIds: [
        "sec_improve_social_owner",
        "sec_improve_crate",
        "sec_improve_activity",
        "sec_improve_behavior",
      ],
      summary: (a) => {
        const parts = [];
        if (a.energy_preference) parts.push(`Energy: ${prettyValue(a.energy_preference)}`);
        const ps = Array.isArray(a.play_styles) ? a.play_styles : [];
        if (ps.length) parts.push(`Play: ${prettyArray(ps, { flexToken: "Flexible" })}`);
        if (a.training_commitment_level) parts.push(`Training: ${prettyValue(a.training_commitment_level)}`);
        if (a.reactivity_comfort) parts.push(`Reactivity: ${prettyValue(a.reactivity_comfort)}`);
        if (a.crate_ok) parts.push(`Crate: ${prettyValue(a.crate_ok)}`);
        if (a.dog_social_preference) parts.push(`Dog-social: ${prettyValue(a.dog_social_preference)}`);
        return parts.filter(Boolean).join(" • ");
      },
    },
    {
      id: "tier_finetune",
      title: "Fine-Tune",
      helper: "If you want to refine your matches even more.",
      sectionIds: [
        "sec_finetune_comfort",
        "sec_finetune_home",
        "sec_finetune_allergies",
        "sec_finetune_cost_medical",
      ],
      summary: (a) => {
        const parts = [];
        if (a.noise_preference) parts.push(`Barking: ${prettyValue(a.noise_preference)}`);

        if (a.yard === true) parts.push("Yard: Yes");
        else if (a.yard === false) parts.push("Yard: No");
        else if (a.yard === null) parts.push("Yard: Flexible");

        if (a.stairs) parts.push(`Stairs: ${prettyValue(a.stairs)}`);

        if (a.allergy_sensitivity) parts.push(`Allergies: ${prettyValue(a.allergy_sensitivity)}`);
        const shed = Array.isArray(a.shedding_levels) ? a.shedding_levels : [];
        if (shed.length) parts.push(`Shedding: ${prettyArray(shed, { flexToken: "Any" })}`);

        if (a.monthly_pet_budget_range) parts.push(`Budget: ${prettyValue(a.monthly_pet_budget_range)}`);
        if (a.medical_needs_ok) parts.push(`Medical: ${prettyValue(a.medical_needs_ok)}`);

        return parts.filter(Boolean).join(" • ");
      },
    },
  ];

  function questionsForSection(sectionId) {
    return questions.filter((q) => q.section === sectionId);
  }

  // --------------------------
  // Submit: ALWAYS ALLOWED
  // --------------------------
  async function submitQuiz() {
    if (saving) return;

    setSaving(true);
    setError("");

    const session_id = makeSessionId();

    // Compute score: rankDogs should naturally use whatever is answered.
    let total_score = null;
    let normalized_score = null;

    try {
      const dogsRes = await supabase
        .from("dogs")
        .select(
          [
            "id",
            "play_styles",
            "energy_level",
            "size",
            "age_years",
            "potty_trained",
            "good_with_kids",
            "good_with_cats",
            "first_time_friendly",
            "hypoallergenic",
            "shedding_level",
            "good_with_dogs",
            "good_with_small_animals",
            "barking_level",
            "max_alone_hours",
          ].join(",")
        );

      if (!dogsRes.error && Array.isArray(dogsRes.data) && dogsRes.data.length) {
        const ranked = rankDogs(dogsRes.data, answers);
        const top = ranked[0];
        if (top) {
          total_score = top.rawScore ?? null;
          normalized_score = typeof top.scorePct === "number" ? top.scorePct / 100 : null;
        }
      }
    } catch {
      // ignore scoring failure
    }

    // Backward-compatible fields derived from pets_in_home
    const pets = Array.isArray(answers.pets_in_home) ? answers.pets_in_home : [];
    const cats_in_home = pets.includes("cats") ? "yes" : "no";
    const has_pets = pets.includes("dogs") || pets.includes("cats") || pets.includes("small_animals");

    try {
      const payload = {
        session_id,

        // existing fields (keep)
        play_styles: answers.play_styles,
        energy_preference: answers.energy_preference,
        size_preference: answers.size_preference,
        age_preference: answers.age_preference,
        potty_requirement: answers.potty_requirement,
        kids_in_home: answers.kids_in_home,

        cats_in_home,
        first_time_owner: answers.first_time_owner,
        allergy_sensitivity: answers.allergy_sensitivity,
        shedding_levels: answers.shedding_levels,
        shedding_preference: computeSheddingPreferenceFromLevels(answers.shedding_levels),

        has_kids: answers.kids_in_home === "yes",
        has_pets,

        pets_in_home: pets,
        noise_preference: answers.noise_preference,
        alone_time: answers.alone_time,
        yard: typeof answers.yard === "boolean" ? answers.yard : null,

        total_score,
        normalized_score,

        // new fields
        kids_age_band: answers.kids_in_home === "yes" ? (answers.kids_age_band || null) : null,
        dog_social_preference: answers.dog_social_preference || null,

        housing_type: answers.housing_type || null,
        landlord_restrictions: answers.landlord_restrictions || null,
        stairs: answers.stairs || null,

        daily_walk_minutes: answers.daily_walk_minutes || null,
        weekend_activity_style: answers.weekend_activity_style || null,

        training_commitment_level: answers.training_commitment_level || null,
        behavior_tolerance: Array.isArray(answers.behavior_tolerance) ? answers.behavior_tolerance : [],
        reactivity_comfort: answers.reactivity_comfort || null,

        crate_ok: answers.crate_ok || null,
        separation_anxiety_willingness: answers.separation_anxiety_willingness || null,

        monthly_pet_budget_range: answers.monthly_pet_budget_range || null,
        medical_needs_ok: answers.medical_needs_ok || null,
        medication_comfort: answers.medication_comfort || null,

        extra_answers: {},

        // completion quality for analytics
        completion_count: answeredCount,
        completion_total: totalCount,
        completion_pct: answeredPct,
      };

      const res = await supabase.from("quiz_responses").insert([payload]);
      if (res.error) throw res.error;

      navigate(`/results?session=${session_id}`);
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-green-100">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 border-b border-green-200 bg-green-100/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <button
              className="text-sm font-semibold text-green-800 hover:underline"
              onClick={() => navigate("/")}
            >
              ← Back to dogs
            </button>

            <div className="flex flex-col items-end gap-2">
              <div className="text-sm text-gray-700">
                {answeredCount}/{totalCount} answered • Better matches with more answers
              </div>

              <div className="h-2 w-44 overflow-hidden rounded-full bg-green-200">
                <div className="h-full bg-green-600 transition-all" style={{ width: `${answeredPct}%` }} />
              </div>

              <button
                type="button"
                onClick={() => setQuickMode((v) => !v)}
                className="rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-semibold text-green-800 hover:bg-green-100"
              >
                Quick mode: {quickMode ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-medium text-green-800 hover:bg-green-100"
              aria-expanded={showNotes}
              aria-controls="quiz-notes"
            >
              ℹ️ Things to know
              <span className="text-[10px] leading-none">{showNotes ? "▲" : "▼"}</span>
            </button>
          </div>

          {showNotes && (
            <div
              id="quiz-notes"
              className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-900"
            >
              <ul className="space-y-2">
                <li>
                  <span className="font-semibold">Behavior can differ.</span> Dogs may act differently in a home than in a shelter.
                </li>
                <li>
                  <span className="font-semibold">Traits aren’t guaranteed.</span> These are best-known traits based on what the rescue has observed so far.
                </li>
                <li>
                  <span className="font-semibold">Accidents can happen.</span> Even potty-trained dogs may have accidents when introduced to a new space.
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-3xl px-6 py-6">
        <div className="grid gap-4">
          {tierDefs.map((tier, tierIdx) => {
            const isOpen = quickMode ? true : openTierId === tier.id;
            const status = tierStatus(tier.sectionIds);

            const tierSections = SECTION_META.filter((s) => tier.sectionIds.includes(s.id));

            return (
              <div
                key={tier.id}
                ref={(el) => {
                  tierRefs.current[tier.id] = el;
                }}
              >
                <AccordionSection
                  id={tier.id}
                  title={tier.title}
                  status={status}
                  summary={tier.summary(answers)}
                  isOpen={isOpen}
                  onToggle={() => {
                    if (quickMode) return;
                    setOpenTierId((curr) => (curr === tier.id ? "" : tier.id));
                  }}
                >
                  <div className="grid gap-6">
                    {/* helper line */}
                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                      {tier.helper}
                    </div>

                    {/* original subsections inside the tier */}
                    <div className="grid gap-6">
                      {tierSections.map((sec) => {
                        const sStatus = sectionStatus(sec.id);
                        const statusText =
                          sStatus === "complete" ? "Complete" : sStatus === "partial" ? "In progress" : "Not started";

                        return (
                          <div key={sec.id} className="rounded-2xl border border-green-200 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                              <h3 className="text-base font-bold text-green-900">{sec.title}</h3>
                              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-800">
                                {statusText}
                              </span>
                            </div>

                            <div className="mt-4 grid gap-4">
                              {questionsForSection(sec.id).map((q) => {
                                const visible = q.isVisible ? q.isVisible(answers) : true;
                                if (!visible) return null;

                                return (
                                  <OptionSelect
                                    key={q.key}
                                    title={q.title}
                                    description={q.description}
                                    options={q.options}
                                    multiple={q.multiple}
                                    value={answers[q.key]}
                                    onChange={(val) => updateAnswer(q.key, val)}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* next tier button */}
                    {!quickMode && tierIdx < tierDefs.length - 1 && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => openTier(tierDefs[tierIdx + 1].id)}
                          className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </div>
                </AccordionSection>
              </div>
            );
          })}
        </div>

        {error && <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {/* Sticky bottom submit bar */}
        <div className="sticky bottom-0 mt-6 pb-4">
          <div className="rounded-2xl border border-green-200 bg-white p-4 shadow">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-700">
                {answeredCount === 0
                  ? "Answer what you want — more answers = better matches."
                  : `You’ve answered ${answeredCount}/${totalCount}. More answers = better matches.`}
              </div>

              <button
                type="button"
                onClick={submitQuiz}
                disabled={saving}
                className={[
                  "rounded-lg px-5 py-2 text-sm font-semibold text-white",
                  saving ? "bg-gray-300" : "bg-green-600 hover:bg-green-700",
                ].join(" ")}
              >
                {saving ? "Saving..." : "See my matches"}
              </button>
            </div>

            {answeredCount > 0 && answeredCount < totalCount && (
              <div className="mt-2 text-xs text-gray-500">
                Tip: answering “Deal Breakers” + “Improve Matches” usually improves results the most.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
