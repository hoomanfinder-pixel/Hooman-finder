// src/utils/decodeHtmlEntities.js

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
};

const ENTITY_PATTERN = /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g;

// Single-pass replace: each match is a complete entity (name, decimal, or hex)
// consumed once, so already-plain "&" characters and unrecognized "&foo;"
// sequences are left untouched rather than reprocessed.
export function decodeHtmlEntities(value) {
  if (!value) return "";

  return String(value).replace(ENTITY_PATTERN, (match, body) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const codePoint = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(codePoint)) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }

    const name = body.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : match;
  });
}
