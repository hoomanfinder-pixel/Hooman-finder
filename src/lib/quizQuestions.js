// src/lib/quizQuestions.js

export const QUIZ_MODES = {
  DEALBREAKERS: "dealbreakers",
  REFINE: "refine",
};

export const QUESTION_TYPES = {
  SINGLE: "single",
  MULTI: "multi",
};

// These MUST match Supabase column names.
export const ALL_QUESTIONS = [
  // ============================================================
  // DEAL BREAKERS (7)
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
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" },
      { value: "extra_large", label: "Extra large" },
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
      { value: "puppy", label: "Puppy (0–1)" },
      { value: "adult", label: "Adult (2–6)" },
      { value: "senior", label: "Senior (7+)" },
      { value: "flexible", label: "Any age / flexible" },
    ],
  },

  {
    id: "kids_in_home",
    mode: QUIZ_MODES.DEALBREAKERS,
    type: QUESTION_TYPES.SINGLE,
    title: "Kids in the home?",
    description: "We'll avoid unsafe matches if needed.",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "sometimes", label: "Sometimes / visiting" },
    ],
  },

  {
    id: "kids_age_band",
    mode: QUIZ_MODES.DEALBREAKERS,
    type: QUESTION_TYPES.SINGLE,
    title: "If yes, what ages are the kids?",
    description: "This helps avoid mismatch with toddlers vs teens.",
    options: [
      { value: "baby", label: "Baby (0–1)" },
      { value: "toddler", label: "Toddler (2–4)" },
      { value: "elementary", label: "Elementary (5–10)" },
      { value: "teen", label: "Teen (11+)" },
      { value: "not_sure", label: "Not sure / varies" },
      { value: "flexible", label: "No preference / flexible" },
    ],
  },

  {
    id: "pets_in_home",
    mode: QUIZ_MODES.DEALBREAKERS,
    type: QUESTION_TYPES.MULTI,
    title: "What animals will your dog need to be comfortable around?",
    description: "Pick all that apply.",
    // NOTE: none/not_sure are “soft exclusive” in meaning, but we’ll keep them NON-exclusive
    // unless you explicitly want them to wipe other picks.
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

  {
    id: "separation_anxiety_willingness",
    mode: QUIZ_MODES.DEALBREAKERS,
    type: QUESTION_TYPES.SINGLE,
    title: "If a dog has separation anxiety, are you willing to work through it?",
    options: [
      { value: "yes", label: "Yes, I’m willing" },
      { value: "maybe", label: "Maybe (depends)" },
      { value: "no", label: "No, I need a dog that can be alone" },
      { value: "not_sure", label: "Not sure" },
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
      { value: "low", label: "Low (0–1 hrs/week)" },
      { value: "medium", label: "Medium (1–3 hrs/week)" },
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
    id: "daily_walk_minutes",
    mode: QUIZ_MODES.REFINE,
    refineSection: "Care & Lifestyle",
    type: QUESTION_TYPES.SINGLE,
    title: "On most days, how much walking/exercise can you realistically do?",
    options: [
      { value: "0_15", label: "0–15 minutes/day" },
      { value: "15_30", label: "15–30 minutes/day" },
      { value: "30_60", label: "30–60 minutes/day" },
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
      { value: "cuddly", label: "Cuddly / chill" },
      { value: "fetch", label: "Fetch / toys" },
      { value: "hikes", label: "Hikes / outdoors" },
      { value: "training_games", label: "Training / brain games" },
      { value: "dog_park", label: "Dog park / social play" },
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
      { value: "4_6", label: "4–6 hours" },
      { value: "6_8", label: "6–8 hours" },
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
      { value: "low", label: "Low ($0–$75)" },
      { value: "medium", label: "Medium ($75–$200)" },
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

export function getQuestionsForMode(mode) {
  const m = mode === QUIZ_MODES.REFINE ? QUIZ_MODES.REFINE : QUIZ_MODES.DEALBREAKERS;
  return ALL_QUESTIONS.filter((q) => q.mode === m);
}

export function getCompletionCounts(mode, answersById) {
  const qs = getQuestionsForMode(mode);

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
