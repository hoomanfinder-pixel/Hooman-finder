export function getMatchReasons(dog, answers, limit = 3) {
  if (!dog || !answers) return [];

  const reasons = [];

  // Energy
  if (
    answers.energy_preference &&
    dog.energy_level &&
    answers.energy_preference === dog.energy_level
  ) {
    reasons.push(`Matches your ${dog.energy_level} energy preference`);
  }

  // Size
  if (
    Array.isArray(answers.size_preference) &&
    answers.size_preference.includes(String(dog.size).toLowerCase())
  ) {
    reasons.push(`Fits your preferred dog size`);
  }

  // Age
  if (Array.isArray(answers.age_preference)) {
    const age =
      dog.age_years < 2 ? "puppy" :
      dog.age_years < 7 ? "adult" :
      "senior";

    if (answers.age_preference.includes(age)) {
      reasons.push(`Age fits what you’re looking for`);
    }
  }

  // Pets
  if (Array.isArray(answers.pets_in_home)) {
    if (
      answers.pets_in_home.includes("dogs") &&
      dog.good_with_dogs
    ) {
      reasons.push(`Good with other dogs`);
    }

    if (
      answers.pets_in_home.includes("cats") &&
      dog.good_with_cats
    ) {
      reasons.push(`Cat-friendly`);
    }

    if (
      answers.pets_in_home.includes("small_animals") &&
      dog.good_with_small_animals
    ) {
      reasons.push(`Okay with small animals`);
    }
  }

  // Noise
  if (
    answers.noise_preference &&
    dog.barking_level
  ) {
    if (
      answers.noise_preference === "prefer_quiet" &&
      dog.barking_level === "low"
    ) {
      reasons.push(`Lower barking tendency`);
    }

    if (
      answers.noise_preference === "alert_ok" &&
      dog.barking_level === "high"
    ) {
      reasons.push(`More alert / vocal`);
    }
  }

  // Alone time
  if (
    answers.alone_time &&
    typeof dog.max_alone_hours === "number"
  ) {
    const ok =
      (answers.alone_time === "lt4" && dog.max_alone_hours <= 4) ||
      (answers.alone_time === "4to6" && dog.max_alone_hours <= 6) ||
      (answers.alone_time === "6to8" && dog.max_alone_hours <= 8) ||
      answers.alone_time === "gt8";

    if (ok) {
      reasons.push(`Can handle your daily alone-time schedule`);
    }
  }

  // Allergies
  if (
    answers.allergy_sensitivity === "have_allergies" &&
    dog.hypoallergenic
  ) {
    reasons.push(`Better fit for allergy-sensitive homes`);
  }

  return reasons.slice(0, limit);
}
