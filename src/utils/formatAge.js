// src/utils/formatAge.js

function parsedAgeYearsFromText(ageText) {
  const text = String(ageText || "").toLowerCase().trim();
  if (!text) return null;

  const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*year/);
  const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*month/);
  const weekMatch = text.match(/(\d+(?:\.\d+)?)\s*week/);
  const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*day/);

  if (!yearMatch && !monthMatch && !weekMatch && !dayMatch) return null;

  const years = Number(yearMatch?.[1] || 0);
  const months = Number(monthMatch?.[1] || 0);
  const weeks = Number(weekMatch?.[1] || 0);
  const days = Number(dayMatch?.[1] || 0);
  return years + months / 12 + weeks / 52 + days / 365;
}

// age_years has been observed inconsistent with age_text on some historical
// rows (e.g. a raw month count stored as whole years). When the two disagree
// by more than half a year, the unit-aware text parse is preferred.
export function resolveAgeYears(ageYears, ageText) {
  const raw = Number(ageYears);
  const parsed = parsedAgeYearsFromText(ageText);

  if (parsed === null) return Number.isFinite(raw) ? raw : null;
  if (!Number.isFinite(raw)) return parsed;
  if (Math.abs(raw - parsed) > 0.5) return parsed;

  return raw;
}

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
