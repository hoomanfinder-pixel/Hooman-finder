#!/usr/bin/env node
const { inspectShelter, isDue, lifecyclePriority, compareAndSetShelter } = require('./shelter-logo-discovery.cjs');

function arg(name, fallback) {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : fallback;
}

function boundedInteger(name, fallback, max) {
  const value = Number(arg(name, fallback));
  if (!Number.isInteger(value) || value < 0 || value > max) throw new Error(`--${name} must be between 0 and ${max}`);
  return value;
}

function validateWriteMode({ apply, writesEnabled }) {
  if (apply && !writesEnabled) throw new Error('--apply requires SHELTER_LOGO_WRITES_ENABLED=true');
  return apply && writesEnabled;
}

async function mapConcurrent(rows, concurrency, worker) {
  const output = new Array(rows.length);
  let cursor = 0;
  async function consume() {
    while (cursor < rows.length) {
      const index = cursor++;
      output[index] = await worker(rows[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, consume));
  return output;
}

function incrementSummary(summary, result) {
  if (result.action === 'verified_existing') summary.verified_existing += 1;
  else if (result.action === 'fill') { summary.discovered += 1; summary.filled += 1; }
  else if (result.action === 'replace') { summary.discovered += 1; summary.replaced += 1; }
  else if (result.action === 'fetch_failed') summary.fetch_failed += 1;
  else if (result.action === 'broken') summary.broken += 1;
  else if (result.action === 'no_candidate') summary.no_candidate += 1;
  else summary.rejected += 1;
}

async function main() {
  require('dotenv').config({ path: '.env.local' });
  const { createClient } = require('@supabase/supabase-js');
  const limit = boundedInteger('limit', 20, 20);
  const offset = boundedInteger('offset', 0, 10_000);
  const concurrency = boundedInteger('concurrency', 3, 3);
  const apply = process.argv.includes('--apply');
  const writesEnabled = process.env.SHELTER_LOGO_WRITES_ENABLED === 'true';
  validateWriteMode({ apply, writesEnabled });
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase credentials');
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.from('shelters').select('*').order('name').range(offset, offset + limit - 1);
  if (error) throw error;
  const due = data.filter((shelter) => isDue(shelter)).sort((a, b) => lifecyclePriority(a) - lifecyclePriority(b) || a.name.localeCompare(b.name));
  const summary = {
    mode: apply ? 'apply' : 'dry_run', considered: due.length, skipped_verified: data.length - due.length,
    discovered: 0, verified_existing: 0, filled: 0, replaced: 0, rejected: 0,
    no_candidate: 0, fetch_failed: 0, broken: 0, deferred: Math.max(0, data.length - due.length),
  };
  const results = await mapConcurrent(due, concurrency, async (shelter) => {
    const result = await inspectShelter(shelter);
    incrementSummary(summary, result);
    if (apply) await compareAndSetShelter(supabase, shelter, result);
    return {
      shelter_id: shelter.id, shelter: shelter.name, existing_url: shelter.logo_url || null,
      proposed_url: result.proposedUrl, official_source_page: result.sourceUrl,
      source_type: result.sourceType, discovery_method: result.discoveryMethod,
      validation: result.validation, existing_validation: result.existingValidation || null, action: result.action,
    };
  });
  const report = { summary, results };
  console.log(JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = require('node:fs');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Shelter logo ${summary.mode}\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`);
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { boundedInteger, incrementSummary, mapConcurrent, validateWriteMode };
