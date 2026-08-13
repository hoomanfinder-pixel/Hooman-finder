// rescuegroups-rescues.cjs

const { RESCUEGROUPS_SOURCES } = require("./scripts/rescuegroups-sources.cjs");

// Backwards-compatible export name for the scheduled sync. The registry is
// intentionally limited to represented organizations whose non-zero current
// RescueGroups rosters were verified before activation.
const RESCUES = RESCUEGROUPS_SOURCES;

module.exports = { RESCUES };
