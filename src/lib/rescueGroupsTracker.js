function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function getRescueGroupsTrackerUrl(dog) {
  if (clean(dog?.source).toLowerCase() !== "rescuegroups") return null;
  if (!clean(dog?.rescuegroups_id) || clean(dog?.rescuegroups_id) !== clean(dog?.external_id)) return null;

  const candidate = clean(dog?.tracker_image_url);
  if (!candidate.startsWith("https://")) return null;
  try {
    const url = new URL(candidate);
    return url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

export function buildRescueGroupsTrackerHtml(dog, escapeHtml = (value) => String(value)) {
  const url = getRescueGroupsTrackerUrl(dog);
  if (!url) return "";
  return `<img data-rescuegroups-tracker="true" src="${escapeHtml(url)}" alt="" width="1" height="1" aria-hidden="true" referrerpolicy="no-referrer-when-downgrade" style="position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none" />`;
}
