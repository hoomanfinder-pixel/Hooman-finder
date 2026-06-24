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
  return /[\u0000-\u001F\u007F<>"'`\\]/.test(value);
}

export function normalizeHttpsUrl(raw) {
  const trimmed = clean(raw);
  if (!trimmed || hasUnsafeCharacters(trimmed)) return "";

  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice(7)}`;
  if (trimmed.startsWith("https://")) return trimmed;

  return "";
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
