export function truncateAtWord(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length < maxLength) return text;

  const words = text.split(" ");
  let shortened = "";

  for (const word of words) {
    const candidate = shortened ? `${shortened} ${word}` : word;
    if (candidate.length >= maxLength) break;
    shortened = candidate;
  }

  return `${shortened || words[0]}…`;
}
