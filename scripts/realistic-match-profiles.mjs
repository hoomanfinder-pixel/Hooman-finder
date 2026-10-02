const BASE = {
  landlord_restrictions: "none", crate_ok: "yes", reactivity_comfort: "mild_ok",
  behavior_tolerance: ["jumping", "leash_pulling", "accidents"], adoption_city: "Detroit, MI",
  adoption_travel_radius: "100_miles", weekend_activity_style: "moderately_active",
  play_styles: ["fetch_returns", "scent_sniffing"], stairs: "few",
  monthly_pet_budget_range: "medium", medical_needs_ok: "maybe", medication_comfort: "yes",
};

const ARCHETYPES = [
  ["Apartment novice, allergy-sensitive, long workday", { housing_type:"apartment", yard:"no", first_time_owner:"yes", kids_in_home:["no_children"], pets_in_home:["none"], potty_requirement:"must_be_trained", dog_social_preference:"flexible", separation_anxiety_willingness:"no", training_commitment_level:"low", noise_preference:"need_very_quiet", daily_walk_minutes:"15_30", energy_preference:"low", alone_time:"8_plus", allergy_sensitivity:"have_allergies", shedding_preference:"minimal", landlord_restrictions:"weight_limit", reactivity_comfort:"no", behavior_tolerance:["accidents"], crate_ok:"maybe" }],
  ["Apartment cat household", { housing_type:"apartment", yard:"no", first_time_owner:"no", kids_in_home:["no_children"], pets_in_home:["cats"], potty_requirement:"preferred", dog_social_preference:"selective_ok", separation_anxiety_willingness:"maybe", training_commitment_level:"medium", noise_preference:"prefer_quiet", daily_walk_minutes:"30_60", energy_preference:"moderate", alone_time:"6_8", allergy_sensitivity:"no_allergies", shedding_preference:"moderate" }],
  ["Townhouse with preschooler and cat", { housing_type:"townhouse", yard:"no", first_time_owner:"yes", kids_in_home:["3_5"], pets_in_home:["cats"], potty_requirement:"must_be_trained", dog_social_preference:"selective_ok", separation_anxiety_willingness:"no", training_commitment_level:"medium", noise_preference:"prefer_quiet", daily_walk_minutes:"30_60", energy_preference:"moderate", alone_time:"4_6", allergy_sensitivity:"mild_allergies", shedding_preference:"moderate", reactivity_comfort:"no" }],
  ["House with young children and dog", { housing_type:"house", yard:"yes", first_time_owner:"no", kids_in_home:["under_3","3_5"], pets_in_home:["dogs"], potty_requirement:"preferred", dog_social_preference:"very_dog_friendly", separation_anxiety_willingness:"maybe", training_commitment_level:"medium", noise_preference:"some_ok", daily_walk_minutes:"30_60", energy_preference:"moderate", alone_time:"4_6", allergy_sensitivity:"no_allergies", shedding_preference:"heavy_ok" }],
  ["House with school-age children, dog and cat", { housing_type:"house", yard:"yes", first_time_owner:"no", kids_in_home:["6_9","10_12"], pets_in_home:["dogs","cats"], potty_requirement:"preferred", dog_social_preference:"very_dog_friendly", separation_anxiety_willingness:"yes", training_commitment_level:"high", noise_preference:"some_ok", daily_walk_minutes:"60_plus", energy_preference:"high", alone_time:"lt4", allergy_sensitivity:"no_allergies", shedding_preference:"heavy_ok", weekend_activity_style:"outdoorsy" }],
  ["Retired quiet household", { housing_type:"house", yard:"yes", first_time_owner:"no", kids_in_home:["no_children"], pets_in_home:["none"], potty_requirement:"must_be_trained", dog_social_preference:"only_dog", separation_anxiety_willingness:"maybe", training_commitment_level:"low", noise_preference:"prefer_quiet", daily_walk_minutes:"15_30", energy_preference:"low", alone_time:"lt4", allergy_sensitivity:"no_allergies", shedding_preference:"moderate", stairs:"none", reactivity_comfort:"no" }],
  ["Active experienced rural adopter", { housing_type:"house", yard:"yes", first_time_owner:"no", kids_in_home:["no_children"], pets_in_home:["none"], potty_requirement:"flexible", dog_social_preference:"flexible", separation_anxiety_willingness:"yes", training_commitment_level:"high", noise_preference:"alert_ok", daily_walk_minutes:"60_plus", energy_preference:"high", alone_time:"4_6", allergy_sensitivity:"no_allergies", shedding_preference:"heavy_ok", weekend_activity_style:"outdoorsy", reactivity_comfort:"yes", behavior_tolerance:["flexible"] }],
  ["First-time family with visiting children", { housing_type:"house", yard:"yes", first_time_owner:"yes", kids_in_home:["children_visit"], pets_in_home:["none"], potty_requirement:"preferred", dog_social_preference:"flexible", separation_anxiety_willingness:"maybe", training_commitment_level:"medium", noise_preference:"some_ok", daily_walk_minutes:"30_60", energy_preference:"moderate", alone_time:"4_6", allergy_sensitivity:"no_allergies", shedding_preference:"moderate" }],
  ["Older children and cat, moderate lifestyle", { housing_type:"townhouse", yard:"yes", first_time_owner:"no", kids_in_home:["13_plus"], pets_in_home:["cats"], potty_requirement:"preferred", dog_social_preference:"selective_ok", separation_anxiety_willingness:"maybe", training_commitment_level:"medium", noise_preference:"some_ok", daily_walk_minutes:"30_60", energy_preference:"moderate", alone_time:"6_8", allergy_sensitivity:"no_allergies", shedding_preference:"moderate" }],
  ["Long-hours experienced adopter", { housing_type:"house", yard:"no", first_time_owner:"no", kids_in_home:["no_children"], pets_in_home:["none"], potty_requirement:"must_be_trained", dog_social_preference:"flexible", separation_anxiety_willingness:"no", training_commitment_level:"medium", noise_preference:"some_ok", daily_walk_minutes:"30_60", energy_preference:"moderate", alone_time:"8_plus", allergy_sensitivity:"no_allergies", shedding_preference:"heavy_ok" }],
  ["Small-animal household", { housing_type:"house", yard:"yes", first_time_owner:"no", kids_in_home:["no_children"], pets_in_home:["small_pets"], potty_requirement:"preferred", dog_social_preference:"selective_ok", separation_anxiety_willingness:"maybe", training_commitment_level:"medium", noise_preference:"some_ok", daily_walk_minutes:"30_60", energy_preference:"moderate", alone_time:"4_6", allergy_sensitivity:"no_allergies", shedding_preference:"moderate" }],
  ["Multi-pet experienced household", { housing_type:"house", yard:"yes", first_time_owner:"no", kids_in_home:["no_children"], pets_in_home:["dogs","cats","small_pets"], potty_requirement:"preferred", dog_social_preference:"very_dog_friendly", separation_anxiety_willingness:"yes", training_commitment_level:"high", noise_preference:"some_ok", daily_walk_minutes:"60_plus", energy_preference:"moderate", alone_time:"lt4", allergy_sensitivity:"no_allergies", shedding_preference:"heavy_ok", reactivity_comfort:"yes" }],
  ["Very low-management household", { housing_type:"townhouse", yard:"no", first_time_owner:"yes", kids_in_home:["no_children"], pets_in_home:["none"], potty_requirement:"must_be_trained", dog_social_preference:"flexible", separation_anxiety_willingness:"no", training_commitment_level:"low", noise_preference:"need_very_quiet", daily_walk_minutes:"0_15", energy_preference:"low", alone_time:"6_8", allergy_sensitivity:"no_allergies", shedding_preference:"minimal", medical_needs_ok:"no", medication_comfort:"no", reactivity_comfort:"no", behavior_tolerance:["accidents"] }],
  ["High-tolerance foster-experienced adopter", { housing_type:"house", yard:"yes", first_time_owner:"no", kids_in_home:["no_children"], pets_in_home:["none"], potty_requirement:"flexible", dog_social_preference:"flexible", separation_anxiety_willingness:"yes", training_commitment_level:"high", noise_preference:"alert_ok", daily_walk_minutes:"60_plus", energy_preference:"flexible", alone_time:"lt4", allergy_sensitivity:"no_allergies", shedding_preference:"flexible", medical_needs_ok:"yes", medication_comfort:"yes", reactivity_comfort:"yes", behavior_tolerance:["flexible"] }],
  ["Allergy-sensitive family with older children", { housing_type:"house", yard:"yes", first_time_owner:"no", kids_in_home:["10_12","13_plus"], pets_in_home:["none"], potty_requirement:"must_be_trained", dog_social_preference:"flexible", separation_anxiety_willingness:"maybe", training_commitment_level:"medium", noise_preference:"prefer_quiet", daily_walk_minutes:"30_60", energy_preference:"moderate", alone_time:"4_6", allergy_sensitivity:"have_allergies", shedding_preference:"minimal", medical_needs_ok:"no" }],
  ["Permissive moderate adopter", { housing_type:"house", yard:"not_sure", first_time_owner:"no", kids_in_home:["no_children"], pets_in_home:["none"], potty_requirement:"flexible", dog_social_preference:"flexible", separation_anxiety_willingness:"yes", training_commitment_level:"medium", noise_preference:"no_preference", daily_walk_minutes:"30_60", energy_preference:"flexible", alone_time:"not_sure", allergy_sensitivity:"no_allergies", shedding_preference:"flexible", medical_needs_ok:"yes", medication_comfort:"yes", reactivity_comfort:"yes", behavior_tolerance:["flexible"] }],
];

const VARIANTS = [
  ["small adult", ["small"], ["adult"]], ["small senior", ["small"], ["senior"]],
  ["medium adult", ["medium"], ["adult"]], ["medium puppy", ["medium"], ["puppy"]],
  ["large adult", ["large"], ["adult"]], ["large puppy", ["large"], ["puppy"]],
  ["extra-large adult", ["extra_large"], ["adult"]], ["size/age flexible", ["flexible"], ["flexible"]],
];

export function buildRealisticMatchProfiles() {
  const profiles = [];
  for (let a = 0; a < ARCHETYPES.length; a += 1) {
    for (let v = 0; v < VARIANTS.length; v += 1) {
      const [archetype, answers] = ARCHETYPES[a];
      const [variant, sizes, ages] = VARIANTS[v];
      profiles.push({
        id: `R${String(profiles.length + 1).padStart(3, "0")}`,
        archetype,
        variant,
        answers: { ...BASE, ...answers, size_preference: sizes, age_preference: ages },
      });
    }
  }
  return profiles;
}

export const REALISTIC_PROFILE_COUNT = ARCHETYPES.length * VARIANTS.length;
