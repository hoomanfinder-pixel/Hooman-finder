// src/utils/formatAge.js

export function formatAge(ageYears) {
  const n = Number(ageYears);
  if (!Number.isFinite(n)) return "Unknown";

  // If < 1 year, show months
  if (n < 1) {
    const months = Math.max(1, Math.round(n * 12)); // 0.5 -> 6
    return `${months} mo`;
  }

  // If >= 1 year, show years (no trailing .0)
  const years = Math.round(n * 10) / 10; // keep 1 decimal if your data ever has it
  const label = years === 1 ? "yr" : "yrs";
  return `${years} ${label}`;
}
