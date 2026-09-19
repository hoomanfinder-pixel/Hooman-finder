/* eslint-disable no-console */

// Deterministically selects a bounded, geographically varied pilot from the
// fresh discovery report. Organization IDs are discovered, not hand-entered.

const fs = require("fs");
const path = require("path");

const INPUT = path.join(process.cwd(), "reports", "rescuegroups-pilot-discovery.json");
const OUTPUT = path.join(process.cwd(), "reports", "rescuegroups-pilot-selection.json");
const STATE_QUOTAS = new Map([
  ["CA", 4],
  ["TX", 4],
  ["FL", 4],
  ["MN", 4],
  ["NH", 3],
  ["RI", 2],
  ["SD", 2],
]);
const MAX_COHORT_SIZE = 8;

function selectOrganizations(report) {
  const selected = [];
  for (const [state, quota] of STATE_QUOTAS) {
    const candidates = report.organizations
      .filter((org) => org.state === state && org.qualified && !org.already_known)
      .sort((a, b) => b.score - a.score || b.estimated_publishable_dogs - a.estimated_publishable_dogs || a.org_id.localeCompare(b.org_id));
    if (candidates.length < quota) {
      throw new Error(`${state} has ${candidates.length} qualified new organizations; ${quota} required.`);
    }
    selected.push(...candidates.slice(0, quota));
  }

  const queues = new Map([...STATE_QUOTAS.keys()].map((state) => [
    state,
    selected.filter((org) => org.state === state),
  ]));
  const cohorts = [];
  while ([...queues.values()].some((queue) => queue.length > 0)) {
    const cohort = [];
    while (cohort.length < MAX_COHORT_SIZE) {
      let added = false;
      for (const state of STATE_QUOTAS.keys()) {
        const queue = queues.get(state);
        if (queue.length > 0 && cohort.length < MAX_COHORT_SIZE) {
          cohort.push(queue.shift());
          added = true;
        }
      }
      if (!added) break;
    }
    cohorts.push(cohort);
  }

  return { selected, cohorts };
}

function main() {
  const report = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const { selected, cohorts } = selectOrganizations(report);
  const selectedIds = new Set(selected.map((org) => org.org_id));
  const rejected = report.organizations
    .filter((org) => !selectedIds.has(org.org_id))
    .map((org) => ({
      org_id: org.org_id,
      name: org.name,
      state: org.state,
      score: org.score,
      rejection_reasons: org.qualified
        ? [org.already_known ? "already_known" : "outside_bounded_state_quota"]
        : org.rejection_reasons,
    }));
  const output = {
    generated_at: new Date().toISOString(),
    source_report_generated_at: report.generated_at,
    states: [...STATE_QUOTAS.keys()],
    state_quotas: Object.fromEntries(STATE_QUOTAS),
    selected_organization_count: selected.length,
    expected_qualified_dogs: selected.reduce((sum, org) => sum + org.estimated_publishable_dogs, 0),
    max_organization_share_pct: Math.round(
      Math.max(...selected.map((org) => org.estimated_publishable_dogs)) /
      selected.reduce((sum, org) => sum + org.estimated_publishable_dogs, 0) * 10000
    ) / 100,
    selected,
    cohorts: cohorts.map((organizations, index) => ({
      name: String.fromCharCode(65 + index),
      organization_count: organizations.length,
      expected_qualified_dogs: organizations.reduce((sum, org) => sum + org.estimated_publishable_dogs, 0),
      organizations,
    })),
    rejected,
  };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({
    states: output.states,
    selected_organization_count: output.selected_organization_count,
    expected_qualified_dogs: output.expected_qualified_dogs,
    max_organization_share_pct: output.max_organization_share_pct,
    cohorts: output.cohorts.map((cohort) => ({ name: cohort.name, organizations: cohort.organization_count, expected_qualified_dogs: cohort.expected_qualified_dogs })),
  }, null, 2));
  console.log(`Wrote ${OUTPUT}`);
}

if (require.main === module) main();

module.exports = { selectOrganizations, STATE_QUOTAS };
