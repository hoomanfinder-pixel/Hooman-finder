// src/pages/Quiz.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import QuestionCard from "../components/QuestionCard";
import { rankDogs } from "../lib/matchingLogic";

const STORAGE_KEY = "hooman_quiz_answers_v3";

// Special values that should be mutually exclusive in multi-select questions
const EXCLUSIVE_MULTI = {
  play_styles: ["no_preference"],
  size_preference: ["any"],
  age_preference: ["any"],
  shedding_levels: ["no_preference"],
  pets_in_home: ["none", "not_sure"],
};

function safeParseJSON(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Safari-safe session id generator with fallback if crypto.randomUUID doesn't exist
function makeSessionId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }

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

export default function Quiz() {
  const navigate = useNavigate();

  // Load saved answers so "Edit quiz" works
  const initial = useMemo(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return safeParseJSON(raw);
  }, []);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ✅ Notes dropdown state
  const [showNotes, setShowNotes] = useState(false);

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
    yard: typeof initial.yard === "boolean" ? initial.yard : null, // null means “unknown”
  });

  const steps = [
    {
      key: "play_styles",
      title: "What play styles do you want in a dog?",
      description: "Pick all that apply. This helps match personality + lifestyle.",
      multiple: true,
      options: [
        { value: "fetch", label: "Fetch", help: "Likes toys, balls, chasing, bringing back." },
        { value: "tug", label: "Tug-of-war", help: "Enjoys interactive play with you." },
        { value: "chews", label: "Chews/destroys toys", help: "Needs durable toys + enrichment." },
        { value: "enjoys_all", label: "Enjoys all kinds of play", help: "Flexible + playful." },
        { value: "ignores_toys", label: "Mostly ignores toys", help: "Lower play-drive, chill vibe." },
        { value: "no_preference", label: "No preference", help: "I’m open to any play style." },
      ],
      canNext: (a) => Array.isArray(a.play_styles) && a.play_styles.length > 0,
    },

    {
      key: "energy_preference",
      title: "What energy level fits your life right now?",
      description: "This helps avoid the “too much dog” fear after adoption.",
      multiple: false,
      options: [
        { value: "low", label: "Low energy", help: "More relaxed, calmer day-to-day." },
        { value: "moderate", label: "Moderate", help: "Balanced—walks + play but not constant." },
        { value: "high", label: "High energy", help: "Active lifestyle, loves stimulation." },
        { value: "any", label: "Any / I’m flexible", help: "I can adapt." },
      ],
      canNext: (a) => !!a.energy_preference,
    },

    {
      key: "size_preference",
      title: "What size dog are you open to?",
      description: "Pick all that you’d genuinely consider adopting.",
      multiple: true,
      options: [
        { value: "small", label: "Small", help: "Easier to carry/handle, smaller space friendly." },
        { value: "medium", label: "Medium", help: "Most common ‘fits most lifestyles’ size." },
        { value: "large", label: "Large", help: "Big dog energy + bigger needs." },
        { value: "xlarge", label: "Extra large", help: "Giant breeds and very large mixes." },
        { value: "any", label: "Any size", help: "I’m open to all sizes." },
      ],
      canNext: (a) => Array.isArray(a.size_preference) && a.size_preference.length > 0,
    },

    {
      key: "age_preference",
      title: "What ages are you open to?",
      description: "Pick all that apply—this helps set realistic expectations.",
      multiple: true,
      options: [
        { value: "puppy", label: "Puppy (0–1)", help: "More training + time investment." },
        { value: "adult", label: "Adult (2–6)", help: "More predictable routine + temperament." },
        { value: "senior", label: "Senior (7+)", help: "Often calmer + lower energy." },
        { value: "any", label: "Any age", help: "I’m open." },
      ],
      canNext: (a) => Array.isArray(a.age_preference) && a.age_preference.length > 0,
    },

    {
      key: "potty_requirement",
      title: "How important is potty training?",
      description: "This is one of the biggest adoption stress points—be honest here.",
      multiple: false,
      options: [
        { value: "must", label: "Must be potty trained", help: "Only show dogs marked potty trained." },
        { value: "preferred", label: "Preferred", help: "Potty trained gets a boost, but not required." },
        { value: "no_matter", label: "Doesn’t matter", help: "I’m open to training." },
      ],
      canNext: (a) => !!a.potty_requirement,
    },

    {
      key: "kids_in_home",
      title: "Do you have kids in the home (or frequent kid visits)?",
      description: "We can filter out unsafe matches.",
      multiple: false,
      options: [
        { value: "yes", label: "Yes", help: "Only show dogs marked good with kids." },
        { value: "no", label: "No", help: "No restriction." },
      ],
      canNext: (a) => !!a.kids_in_home,
    },

    {
      key: "pets_in_home",
      title: "What animals will your dog need to be comfortable around?",
      description: "Pick all that apply. This helps avoid unsafe matches at home.",
      multiple: true,
      options: [
        { value: "dogs", label: "Other dogs", help: "You have dogs or frequent dog exposure." },
        { value: "cats", label: "Cats", help: "You have cats or frequent cat exposure." },
        { value: "small_animals", label: "Small animals", help: "Rabbits, birds, guinea pigs, etc." },
        { value: "none", label: "No other animals / not important", help: "No constraints." },
        { value: "not_sure", label: "Not sure / flexible", help: "No constraints." },
      ],
      canNext: (a) => Array.isArray(a.pets_in_home) && a.pets_in_home.length > 0,
    },

    {
      key: "first_time_owner",
      title: "Are you a first-time dog owner?",
      description: "We can give a small boost to first-time friendly dogs.",
      multiple: false,
      options: [
        { value: "yes", label: "Yes", help: "Prefer first-time adopter friendly dogs." },
        { value: "no", label: "No", help: "No preference." },
      ],
      canNext: (a) => !!a.first_time_owner,
    },

    {
      key: "allergy_sensitivity",
      title: "Do you have allergies?",
      description: "This reduces adoption anxiety by avoiding bad allergy matches.",
      multiple: false,
      options: [
        {
          value: "have_allergies",
          label: "I have allergies (need hypoallergenic / low-shedding)",
          help: "We’ll filter out heavy shedders and prioritize hypo/low shed.",
        },
        {
          value: "mild_allergies",
          label: "Mild allergies (some shedding is okay)",
          help: "We’ll avoid heavy shedders where possible.",
        },
        {
          value: "no_allergies",
          label: "No allergies / doesn’t matter",
          help: "No restriction.",
        },
      ],
      canNext: (a) => !!a.allergy_sensitivity,
    },

    {
      key: "shedding_levels",
      title: "What shedding levels are you comfortable with?",
      description: "Pick all that apply. (If you pick ‘No preference’, you’re open to all.)",
      multiple: true,
      options: [
        { value: "minimal", label: "Minimal shedding", help: "Prefer very little shedding." },
        { value: "moderate", label: "Moderate shedding", help: "Some shedding is okay." },
        { value: "heavy_ok", label: "Heavy shedding okay", help: "Shedding doesn’t bother me." },
        { value: "no_preference", label: "No preference", help: "I’m flexible." },
      ],
      canNext: (a) => Array.isArray(a.shedding_levels) && a.shedding_levels.length > 0,
    },

    {
      key: "noise_preference",
      title: "How do you feel about barking?",
      description: "This helps avoid stress with neighbors, roommates, or apartment living.",
      multiple: false,
      options: [
        { value: "alert_ok", label: "I like an alert dog (barking is fine)", help: "Vocal/alerting is okay." },
        { value: "some_ok", label: "Some barking is fine", help: "Normal dog barking is okay." },
        { value: "prefer_quiet", label: "I prefer a mostly quiet dog", help: "Lower vocal tendency preferred." },
        { value: "need_very_quiet", label: "I need a very quiet dog", help: "Strong preference for quiet." },
        { value: "no_pref", label: "No strong preference", help: "I’m flexible." },
      ],
      canNext: (a) => !!a.noise_preference,
    },

    {
      key: "alone_time",
      title: "On a typical weekday, how long will the dog be alone?",
      description: "This helps avoid separation anxiety mismatches.",
      multiple: false,
      options: [
        { value: "lt4", label: "Less than 4 hours", help: "Dog will rarely be alone for long." },
        { value: "4to6", label: "4–6 hours", help: "Moderate alone time." },
        { value: "6to8", label: "6–8 hours", help: "Longer workday schedule." },
        { value: "gt8", label: "8+ hours", help: "Dog may be alone most of the day." },
        { value: "not_sure", label: "Not sure", help: "Schedule varies." },
      ],
      canNext: (a) => !!a.alone_time,
    },
  ];

  const current = steps[step];

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

    const stepMeta = steps.find((s) => s.key === key);
    if (stepMeta?.multiple) {
      nextVal = applyExclusiveMulti(key, Array.isArray(val) ? val : []);
    }

    const next = { ...answers, [key]: nextVal };
    setAnswers(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function submitQuiz() {
    if (saving) return;

    setSaving(true);
    setError("");

    const session_id = makeSessionId();

    // Compute total_score + normalized_score based on current dogs table
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

    // Backward-compatible fields
    const pets = Array.isArray(answers.pets_in_home) ? answers.pets_in_home : [];
    const cats_in_home = pets.includes("cats") ? "yes" : "no";
    const has_pets = pets.includes("dogs") || pets.includes("cats") || pets.includes("small_animals");

    try {
      const payload = {
        session_id,

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

  function next() {
    if (step < steps.length - 1) setStep(step + 1);
    else submitQuiz();
  }

  function back() {
    if (step > 0) setStep(step - 1);
    else navigate("/");
  }

  const canGoNext = current.canNext(answers);

  return (
    <div className="min-h-screen bg-green-100">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-start justify-between">
          <button
            className="text-sm font-semibold text-green-800 hover:underline"
            onClick={() => navigate("/")}
          >
            ← Back to dogs
          </button>

          {/* ✅ Right side: Step + smaller notes pill directly under it */}
          <div className="flex flex-col items-end gap-2">
            <div className="text-sm text-gray-600">
              Step {step + 1} of {steps.length}
            </div>

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
        </div>

        {showNotes && (
          <div
            id="quiz-notes"
            className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-900"
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

        <QuestionCard
          stepLabel="Quiz"
          title={current.title}
          description={current.description}
          options={current.options}
          multiple={current.multiple}
          value={answers[current.key]}
          onChange={(val) => updateAnswer(current.key, val)}
          onBack={step === 0 ? () => navigate("/") : back}
          onNext={next}
          nextLabel={step === steps.length - 1 ? (saving ? "Saving..." : "See my matches") : "Next"}
          canGoNext={!saving && canGoNext}
        />

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
