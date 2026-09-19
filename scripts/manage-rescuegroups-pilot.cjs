/* eslint-disable no-console */

require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { ensureShelterForSource } = require("./rescuegroups-shelter-utils.cjs");

const INPUT = path.join(process.cwd(), "reports", "rescuegroups-pilot-selection.json");
const DISABLED_REASON = "Controlled multistate pilot: registered pending cohort activation";
const MODES = new Set(["status", "register-disabled", "enable-cohort", "disable-cohort"]);

function parseArguments(argv) {
  const mode = argv[2] || "status";
  const cohortArgument = argv.find((value) => value.startsWith("--cohort="));
  const cohort = cohortArgument?.slice("--cohort=".length).trim().toUpperCase() || null;
  if (!MODES.has(mode)) throw new Error(`Unsupported mode ${mode}.`);
  if (["enable-cohort", "disable-cohort"].includes(mode) && !cohort) {
    throw new Error(`${mode} requires --cohort=A, B, or C.`);
  }
  return { mode, cohort };
}

async function loadStatus(client, selection) {
  const ids = selection.selected.map((org) => org.org_id);
  const { data, error } = await client
    .from("ingestion_sources")
    .select("id,external_org_id,shelter_id,display_name,enabled,publication_eligible,last_sync_status,last_sync_attempt_at,last_successful_sync_at,last_error,disabled_reason")
    .eq("source_type", "rescuegroups")
    .in("external_org_id", ids);
  if (error) throw error;
  return data || [];
}

async function registerDisabled(client, selection) {
  const existing = await loadStatus(client, selection);
  if (existing.length > 0) {
    throw new Error(`Refusing registration because ${existing.length} selected organizations already exist in the registry.`);
  }

  for (const org of selection.selected) {
    const shelterId = await ensureShelterForSource(client, {
      rescuegroups_org_id: org.org_id,
      name: org.name,
      city: org.city,
      state: org.state,
      website: org.organization_url,
      apply_url: org.organization_url,
    });
    if (!shelterId) throw new Error(`Could not resolve shelter for ${org.name} (${org.org_id}).`);
    const { error } = await client.from("ingestion_sources").insert({
      source_type: "rescuegroups",
      external_org_id: org.org_id,
      shelter_id: shelterId,
      display_name: org.name,
      enabled: false,
      publication_eligible: false,
      last_sync_status: "disabled",
      disabled_reason: DISABLED_REASON,
    });
    if (error) throw new Error(`Could not register ${org.name} (${org.org_id}): ${error.message}`);
    console.log(`Registered disabled: ${org.name} (${org.org_id}) -> ${shelterId}`);
  }
}

async function setCohortState(client, selection, cohortName, enabled) {
  const cohort = selection.cohorts.find((entry) => entry.name === cohortName);
  if (!cohort) throw new Error(`Unknown cohort ${cohortName}.`);
  const expectedIds = cohort.organizations.map((org) => String(org.org_id));
  const status = await loadStatus(client, selection);
  const byId = new Map(status.map((row) => [String(row.external_org_id), row]));
  const missing = expectedIds.filter((id) => !byId.has(id));
  if (missing.length > 0) throw new Error(`Cohort ${cohortName} has unregistered organizations: ${missing.join(", ")}`);

  for (const id of expectedIds) {
    const row = byId.get(id);
    if (enabled && row.enabled && row.publication_eligible) {
      console.log(`Already enabled: ${row.display_name} (${id})`);
      continue;
    }
    const update = enabled
      ? { enabled: true, publication_eligible: true, last_sync_status: "never", disabled_reason: null }
      : { enabled: false, publication_eligible: false, last_sync_status: "disabled", disabled_reason: `Controlled pilot cohort ${cohortName} disabled by operator` };
    const { error } = await client.from("ingestion_sources").update(update).eq("id", row.id);
    if (error) throw new Error(`Could not ${enabled ? "enable" : "disable"} ${row.display_name}: ${error.message}`);
    console.log(`${enabled ? "Enabled" : "Disabled"}: ${row.display_name} (${id})`);
  }
}

async function main() {
  for (const key of ["VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[key]) throw new Error(`Missing ${key}.`);
  }
  const { mode, cohort } = parseArguments(process.argv);
  const selection = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const client = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (mode === "register-disabled") await registerDisabled(client, selection);
  if (mode === "enable-cohort") await setCohortState(client, selection, cohort, true);
  if (mode === "disable-cohort") await setCohortState(client, selection, cohort, false);

  const status = await loadStatus(client, selection);
  console.log(JSON.stringify({
    mode,
    registered: status.length,
    enabled: status.filter((row) => row.enabled).length,
    publication_eligible: status.filter((row) => row.publication_eligible).length,
    success: status.filter((row) => row.last_sync_status === "success").length,
    failed: status.filter((row) => ["failed", "partial"].includes(row.last_sync_status)).length,
    sources: status.sort((a, b) => a.external_org_id.localeCompare(b.external_org_id)),
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Pilot management failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { parseArguments };
