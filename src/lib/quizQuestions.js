// src/lib/quizQuestions.js

export const QUIZ_MODES = {
  DEALBREAKERS: "dealbreakers",
  REFINE: "refine",
};

export const QUESTION_TYPES = {
  SINGLE: "single",
  MULTI: "multi",
  TEXT: "text",
};

// These MUST match Supabase column names.
export const ALL_QUESTIONS = [
  // ============================================================
  // DEAL BREAKERS (6)
  // ============================================================

  {
    id: "size_preference",
    mode: QUIZ_MODES.DEALBREAKERS,
    type: QUESTION_TYPES.MULTI,
    title: "Preferred size",
    description: "Pick all sizes you're open to.",
    // ✅ If "flexible" is selected, it becomes the only selection (and vice versa)
    exclusiveValues: ["flexible"],
    options: [
      { value: "small", label: "Small", icon: "🐶" },
      { value: "medium", label: "Medium", icon: "🐾" },
      { value: "large", label: "Large", icon: "🐕" },
      { value: "extra_large", label: "Extra large", icon: "🐕" },
      { value: "flexible", label: "Any size / flexible" },
    ],
  },

  {
    id: "age_preference",
    mode: QUIZ_MODES.DEALBREAKERS,
    type: QUESTION_TYPES.MULTI,
    title: "Preferred age",
    description: "Pick all ages you're open to.",
    exclusiveValues: ["flexible"],
    options: [
      { value: "puppy", label: "Puppy (0 to 1)" },
      { value: "adult", label: "Adult (2 to 6)" },
      { value: "senior", label: "Senior (7+)" },
      { value: "flexible", label: "Any age / flexible" },
    ],
  },

  {
    id: "kids_in_home",
    mode: QUIZ_MODES.DEALBREAKERS,
    type: QUESTION_TYPES.MULTI,
    title: "What ages are the children in your home?",
    description: "Select all that apply, or choose the youngest age if you want the strictest match.",
    exclusiveValues: ["no_children"],
    options: [
      { value: "no_children", label: "No children in the home" },
      { value: "under_3", label: "Under 3" },
      { value: "3_5", label: "3 to 5" },
      { value: "6_9", label: "6 to 9" },
      { value: "10_12", label: "10 to 12" },
      { value: "13_plus", label: "13+" },
      { value: "children_visit", label: "Children visit sometimes" },
    ],
  },

  {
    id: "pets_in_home",
    mode: QUIZ_MODES.DEALBREAKERS,
    type: QUESTION_TYPES.MULTI,
    title: "What animals will your dog need to be comfortable around?",
    description: "Pick all that apply.",
    exclusiveValues: ["none", "not_sure"],
    options: [
      { value: "dogs", label: "Other dogs" },
      { value: "cats", label: "Cats" },
      { value: "small_pets", label: "Small animals" },
      { value: "none", label: "No other animals / not important" },
      { value: "not_sure", label: "Not sure / flexible" },
    ],
  },

  {
    id: "potty_requirement",
    mode: QUIZ_MODES.DEALBREAKERS,
    type: QUESTION_TYPES.SINGLE,
    title: "How important is potty training?",
    options: [
      { value: "must_be_trained", label: "Must be potty trained" },
      { value: "preferred", label: "Preferred" },
      { value: "flexible", label: "Doesn’t matter / I’m open to training" },
    ],
  },

  // ============================================================
  // REFINE (Accordion groups: 3 sections)
  // refineSection must match Quiz.jsx expected titles exactly:
  // - "Household & Compatibility"
  // - "Behavior & Training"
  // - "Care & Lifestyle"
  // ============================================================

  // -------------------------
  // Household & Compatibility
  // -------------------------

  {
    id: "dog_social_preference",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Household & Compatibility",
    type: QUESTION_TYPES.SINGLE,
    title: "How should your dog feel about other dogs?",
    options: [
      { value: "very_dog_friendly", label: "Must be very dog-friendly" },
      { value: "selective_ok", label: "Selective is okay" },
      { value: "only_dog", label: "Prefer an only-dog home" },
      { value: "flexible", label: "No preference / flexible" },
    ],
  },

  {
    id: "first_time_owner",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Household & Compatibility",
    type: QUESTION_TYPES.SINGLE,
    title: "Are you a first-time dog owner?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "not_sure", label: "Not sure" },
    ],
  },

  {
    id: "housing_type",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Household & Compatibility",
    type: QUESTION_TYPES.SINGLE,
    title: "What best describes your home right now?",
    options: [
      { value: "apartment", label: "Apartment" },
      { value: "townhouse", label: "Townhouse / duplex" },
      { value: "house", label: "House" },
      { value: "other", label: "Other / not sure" },
    ],
  },

  {
    id: "landlord_restrictions",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Household & Compatibility",
    type: QUESTION_TYPES.SINGLE,
    title: "Any landlord / HOA restrictions?",
    options: [
      { value: "none", label: "None" },
      { value: "weight_limit", label: "Weight limit" },
      { value: "breed_restrictions", label: "Breed restrictions" },
      { value: "not_sure", label: "Not sure / unknown" },
    ],
  },

  // -------------------------
  // Behavior & Training
  // -------------------------

  // ✅ MOVED HERE from Deal Breakers
  {
    id: "separation_anxiety_willingness",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Behavior & Training",
    type: QUESTION_TYPES.SINGLE,
    title: "If a dog has separation anxiety, are you willing to work through it?",
    options: [
      { value: "yes", label: "Yes, I’m willing" },
      { value: "maybe", label: "Maybe (depends)" },
      { value: "no", label: "No, I need a dog that can be alone" },
      { value: "not_sure", label: "Not sure" },
    ],
  },

  {
    id: "crate_ok",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Behavior & Training",
    type: QUESTION_TYPES.SINGLE,
    title: "Are you open to crate training (or using a crate when needed)?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "maybe", label: "Maybe / depends" },
      { value: "no", label: "No" },
      { value: "not_sure", label: "Not sure" },
    ],
  },

  {
    id: "training_commitment_level",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Behavior & Training",
    type: QUESTION_TYPES.SINGLE,
    title: "How much training time are you willing to put in (weekly)?",
    options: [
      { value: "low", label: "Low (0 to 1 hrs/week)" },
      { value: "medium", label: "Medium (1 to 3 hrs/week)" },
      { value: "high", label: "High (3+ hrs/week)" },
      { value: "not_sure", label: "Not sure" },
    ],
  },

  {
    id: "reactivity_comfort",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Behavior & Training",
    type: QUESTION_TYPES.SINGLE,
    title: "If a dog is reactive (barks/lunges on leash), are you comfortable working on it?",
    options: [
      { value: "no", label: "No, I need a very easy dog" },
      { value: "mild_ok", label: "Mild is okay" },
      { value: "yes", label: "Yes, I can work on it" },
      { value: "not_sure", label: "Not sure" },
    ],
  },

  {
    id: "behavior_tolerance",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Behavior & Training",
    type: QUESTION_TYPES.MULTI,
    title: "What challenges are you okay working through?",
    description: "Pick all that apply.",
    // ✅ If flexible is selected, it becomes the only selection (and vice versa)
    exclusiveValues: ["flexible"],
    options: [
      { value: "jumping", label: "Jumping" },
      { value: "barking", label: "Barking/vocal" },
      { value: "chewing", label: "Chewing/destroying" },
      { value: "leash_pulling", label: "Leash pulling" },
      { value: "accidents", label: "Accidents while adjusting" },
      { value: "flexible", label: "No preference / flexible" },
    ],
  },

  {
    id: "noise_preference",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Behavior & Training",
    type: QUESTION_TYPES.SINGLE,
    title: "Comfort & noise",
    description: "How do you feel about barking?",
    options: [
      { value: "alert_ok", label: "I like an alert dog (barking is fine)" },
      { value: "some_ok", label: "Some barking is fine" },
      { value: "prefer_quiet", label: "I prefer a mostly quiet dog" },
      { value: "need_very_quiet", label: "I need a very quiet dog" },
      { value: "no_preference", label: "No strong preference" },
    ],
  },

  // -------------------------
  // Care & Lifestyle
  // -------------------------

  {
    id: "adoption_city",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.TEXT,
    title: "What city are you looking near?",
    description: "This is saved with your quiz, but does not change match ranking yet.",
    placeholder: "City, MI",
    inputMode: "text",
  },

  {
    id: "adoption_travel_radius",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.SINGLE,
    title: "How far are you willing to travel to adopt?",
    description: "Stored for your adoption search preferences.",
    options: [
      { value: "10_miles", label: "10 miles" },
      { value: "25_miles", label: "25 miles" },
      { value: "50_miles", label: "50 miles" },
      { value: "100_miles", label: "100 miles" },
      { value: "anywhere_michigan", label: "Anywhere in Michigan" },
      { value: "no_preference", label: "No preference" },
    ],
  },

  {
    id: "daily_walk_minutes",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.SINGLE,
    title: "On most days, how much walking/exercise can you realistically do?",
    options: [
      { value: "0_15", label: "0 to 15 minutes/day" },
      { value: "15_30", label: "15 to 30 minutes/day" },
      { value: "30_60", label: "30 to 60 minutes/day" },
      { value: "60_plus", label: "60+ minutes/day" },
      { value: "not_sure", label: "Not sure / varies" },
    ],
  },

  {
    id: "weekend_activity_style",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.SINGLE,
    title: "Weekends are usually…",
    options: [
      { value: "homebody", label: "Homebody / chill" },
      { value: "moderately_active", label: "Moderately active" },
      { value: "outdoorsy", label: "Outdoorsy / very active" },
      { value: "not_sure", label: "Not sure / varies" },
    ],
  },

  {
    id: "energy_preference",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.SINGLE,
    title: "What energy level fits your life right now?",
    options: [
      { value: "low", label: "Low energy" },
      { value: "moderate", label: "Moderate" },
      { value: "high", label: "High energy" },
      { value: "flexible", label: "Any / I’m flexible" },
    ],
  },

  {
    id: "play_styles",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.MULTI,
    title: "Preferred play style",
    description: "Pick all play styles you'd enjoy.",
    // ✅ no_preference is exclusive
    exclusiveValues: ["no_preference"],
    options: [
      { value: "fetch_returns", label: "Fetch and brings it back" },
      { value: "tug", label: "Tug-of-war" },
      { value: "chase_flirt_pole", label: "Chase games / flirt pole" },
      { value: "scent_sniffing", label: "Scent games / sniffing" },
      { value: "puzzle_brain_games", label: "Puzzle toys / brain games" },
      { value: "social_play", label: "Dog park / social play" },
      { value: "low_key_play", label: "Cuddly / low-key play" },
      { value: "no_preference", label: "No preference" },
    ],
  },

  {
    id: "yard",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.SINGLE,
    title: "Do you have access to a yard or fenced outdoor space?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "not_sure", label: "Not sure / doesn’t matter" },
    ],
  },

  {
    id: "stairs",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.SINGLE,
    title: "Stairs situation?",
    options: [
      { value: "none", label: "No stairs" },
      { value: "few", label: "A few stairs" },
      { value: "many", label: "Multiple flights" },
      { value: "not_sure", label: "Not sure / varies" },
    ],
  },

  {
    id: "alone_time",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.SINGLE,
    title: "On a typical weekday, how long will the dog be alone?",
    options: [
      { value: "lt4", label: "Less than 4 hours" },
      { value: "4_6", label: "4 to 6 hours" },
      { value: "6_8", label: "6 to 8 hours" },
      { value: "8_plus", label: "8+ hours" },
      { value: "not_sure", label: "Not sure / varies" },
    ],
  },

  {
    id: "allergy_sensitivity",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.SINGLE,
    title: "Allergy sensitivity",
    options: [
      {
        value: "needs_low_shedding",
        label: "I have allergies (need hypoallergenic / low-shedding)",
      },
      { value: "mild", label: "Mild allergies (some shedding is okay)" },
      { value: "none", label: "No allergies / doesn’t matter" },
    ],
  },

  {
    id: "shedding_preference",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.SINGLE,
    title: "What shedding levels are you comfortable with?",
    options: [
      { value: "minimal", label: "Minimal shedding" },
      { value: "moderate", label: "Moderate shedding" },
      { value: "heavy_ok", label: "Heavy shedding okay" },
      { value: "flexible", label: "No preference / flexible" },
    ],
  },

  {
    id: "monthly_pet_budget_range",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.SINGLE,
    title: "Monthly pet budget comfort (roughly)?",
    options: [
      { value: "low", label: "Low ($0 to $75)" },
      { value: "medium", label: "Medium ($75 to $200)" },
      { value: "high", label: "High ($200+)" },
      { value: "not_sure", label: "Not sure" },
    ],
  },

  {
    id: "medical_needs_ok",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.SINGLE,
    title: "Are you open to a dog with medical needs?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "maybe", label: "Maybe (depends)" },
      { value: "no", label: "No, I need low medical needs" },
      { value: "not_sure", label: "Not sure" },
    ],
  },

  {
    id: "medication_comfort",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.SINGLE,
    title: "Are you comfortable giving medication if needed?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "maybe", label: "Maybe" },
      { value: "no", label: "No" },
      { value: "not_sure", label: "Not sure" },
    ],
  },
];

function isQuestionVisible(question, answersById) {
  if (!question || typeof question.showIf !== "function") return true;
  try {
    return !!question.showIf(answersById || {});
  } catch {
    // fail open so you never brick the quiz
    return true;
  }
}

// ✅ Now supports conditionals:
// - getQuestionsForMode(mode) works like before
// - getQuestionsForMode(mode, answersById) hides questions with showIf false
export function getQuestionsForMode(mode, answersById = null) {
  const m = mode === QUIZ_MODES.REFINE ? QUIZ_MODES.REFINE : QUIZ_MODES.DEALBREAKERS;
  const base = ALL_QUESTIONS.filter((q) => q.mode === m);

  if (!answersById) return base;
  return base.filter((q) => isQuestionVisible(q, answersById));
}

// ✅ Completion counts should use ONLY visible questions
export function getCompletionCounts(mode, answersById) {
  const qs = getQuestionsForMode(mode, answersById);

  let answered = 0;
  for (const q of qs) {
    const v = answersById?.[q.id];

    if (q.type === QUESTION_TYPES.MULTI) {
      if (Array.isArray(v) && v.length > 0) answered += 1;
      continue;
    }

    // SINGLE
    if (v !== undefined && v !== null && String(v).trim().length > 0) answered += 1;
  }

  return { answered, total: qs.length };
}
