export const FALLBACK_DOG_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
    <rect width="100%" height="100%" fill="#F1F5F9"/>
    <text x="50%" y="50%" text-anchor="middle" font-family="Arial" font-size="22" fill="#475569">
      Photo unavailable
    </text>
  </svg>
`);

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function hasUnsafeCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }

  return /[<>"'`\\]/.test(value);
}

export function normalizeHttpsUrl(raw) {
  const trimmed = clean(raw);
  if (!trimmed || hasUnsafeCharacters(trimmed)) return "";

  let normalized = "";
  if (trimmed.startsWith("//")) normalized = `https:${trimmed}`;
  if (trimmed.startsWith("http://")) normalized = `https://${trimmed.slice(7)}`;
  if (trimmed.startsWith("https://")) normalized = trimmed;

  if (!normalized) return "";

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" || !parsed.hostname) return "";
  } catch {
    return "";
  }

  return normalized;
}

export function normalizeExternalUrl(raw) {
  return normalizeHttpsUrl(raw);
}

export function normalizeImageUrl(raw, { allowRelative = true } = {}) {
  const trimmed = clean(raw);
  if (!trimmed || hasUnsafeCharacters(trimmed)) return "";

  if (trimmed.startsWith("data:")) {
    return trimmed.startsWith("data:image/") ? trimmed : "";
  }

  if (trimmed.startsWith("blob:")) return trimmed;

  const httpsUrl = normalizeHttpsUrl(trimmed);
  if (httpsUrl) return httpsUrl;

  if (allowRelative && trimmed.startsWith("/")) return trimmed;

  return "";
}
