const UNAVAILABLE_TEXT_RULES = [
  {
    kind: "pending",
    reason: "Listing text indicates adoption pending",
    pattern: /\b(?:adoption\s+pending|pending\s+adoption|application\s+pending|pending\s+application)\b/i,
  },
  {
    kind: "hold",
    reason: "Listing text indicates the dog is on hold",
    pattern: /\b(?:on\s+hold|adoption\s+hold|hold\s+for\s+adoption)\b/i,
  },
  {
    kind: "courtesy",
    reason: "Listing is marked as a courtesy post",
    pattern: /\bcourtesy\s+(?:post|posting|listing)\b/i,
  },
  {
    kind: "unavailable",
    reason: "Listing text indicates the dog is unavailable",
    pattern: /\b(?:no\s+longer\s+available|not\s+currently\s+available|unavailable\s+for\s+adoption)\b/i,
  },
  {
    kind: "adopted",
    reason: "Listing text indicates the dog was adopted",
    pattern: /\b(?:already\s+adopted|has\s+been\s+adopted|adoption\s+finalized)\b/i,
  },
];

function normalizeListingText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getDogAvailabilitySignal(dog) {
  const name = normalizeListingText(dog?.name);
  if (/\bpending\b/i.test(name)) {
    return {
      field: "name",
      kind: "pending",
      reason: "Listing name indicates adoption pending",
    };
  }
  if (/\badopted\b/i.test(name)) {
    return {
      field: "name",
      kind: "adopted",
      reason: "Listing name indicates the dog was adopted",
    };
  }
  if (/\bunavailable\b/i.test(name)) {
    return {
      field: "name",
      kind: "unavailable",
      reason: "Listing name indicates the dog is unavailable",
    };
  }

  const fields = [
    ["name", name],
    ["description", dog?.description],
    ["bio", dog?.bio],
    ["placement_note", dog?.placement_note],
    ["notes", dog?.notes],
  ];

  for (const [field, value] of fields) {
    const text = normalizeListingText(value);
    if (!text) continue;

    for (const rule of UNAVAILABLE_TEXT_RULES) {
      if (rule.pattern.test(text)) {
        return { field, kind: rule.kind, reason: rule.reason };
      }
    }
  }

  return null;
}
