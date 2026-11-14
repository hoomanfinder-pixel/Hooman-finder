function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || null;
}

function assessRescueGroupsUrgencySignals(attributes) {
  const hasPriority = Object.hasOwn(attributes || {}, "priority");
  const hasFoster = Object.hasOwn(attributes || {}, "isNeedingFoster");
  const priority = clean(attributes?.priority);
  const sourceUrgent = attributes?.priority === 0 || priority === "0";
  const numericPriority =
    (typeof attributes?.priority === "number" && Number.isFinite(attributes.priority)) ||
    (typeof attributes?.priority === "string" && /^-?\d+(?:\.\d+)?$/.test(priority || ""));
  const priorityVerified = sourceUrgent || (
    hasPriority && priority !== null && numericPriority
  );
  const fosterNeeded = attributes?.isNeedingFoster === true;
  const fosterVerified = hasFoster && typeof attributes.isNeedingFoster === "boolean";

  return {
    sourceUrgent,
    fosterNeeded,
    priorityVerified,
    fosterVerified,
    unverifiedSignalCount: Number(!priorityVerified) + Number(!fosterVerified),
  };
}

module.exports = { assessRescueGroupsUrgencySignals };
