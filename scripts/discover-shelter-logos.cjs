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

function parseShelterIds(value) {
  if (!value) return [];
  const ids = [...new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean))];
  if (!ids.length || ids.length > 20) throw new Error('--shelter-ids must contain between 1 and 20 UUIDs');
  for (const id of ids) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error(`Invalid shelter UUID: ${id}`);
    }
  }
  return ids;
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
  const shelterIds = parseShelterIds(arg('shelter-ids', ''));
  const apply = process.argv.includes('--apply');
  const fillsOnly = process.argv.includes('--fills-only');
  const writesEnabled = process.env.SHELTER_LOGO_WRITES_ENABLED === 'true';
  validateWriteMode({ apply, writesEnabled });
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase credentials');
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let shelterQuery = supabase.from('shelters').select('*').order('name');
  shelterQuery = shelterIds.length
    ? shelterQuery.in('id', shelterIds)
    : shelterQuery.range(offset, offset + limit - 1);
  const { data, error } = await shelterQuery;
  if (error) throw error;
  if (shelterIds.length && data.length !== shelterIds.length) {
    const found = new Set(data.map(({ id }) => id));
    throw new Error(`Shelter allowlist mismatch; missing: ${shelterIds.filter((id) => !found.has(id)).join(', ')}`);
  }
  const due = data.filter((shelter) => isDue(shelter)).sort((a, b) => lifecyclePriority(a) - lifecyclePriority(b) || a.name.localeCompare(b.name));
  const summary = {
    mode: apply ? 'apply' : 'dry_run', considered: due.length, skipped_verified: data.length - due.length,
    discovered: 0, verified_existing: 0, filled: 0, replaced: 0, rejected: 0,
    no_candidate: 0, fetch_failed: 0, broken: 0, deferred: Math.max(0, data.length - due.length),
    apply_attempted: 0, applied: 0, skipped_changed_state: 0, failed: 0,
  };
  const results = await mapConcurrent(due, concurrency, async (shelter) => {
    const result = await inspectShelter(shelter);
    incrementSummary(summary, result);
    let applyOutcome = 'dry_run';
    let applyError = null;
    if (apply && (!fillsOnly || result.action === 'fill')) {
      summary.apply_attempted += 1;
      try {
        await compareAndSetShelter(supabase, shelter, result);
        summary.applied += 1;
        applyOutcome = 'applied';
      } catch (error) {
        applyError = error.message;
        if (error.message === 'compare_and_set_conflict') {
          summary.skipped_changed_state += 1;
          applyOutcome = 'skipped_changed_state';
        } else {
          summary.failed += 1;
          applyOutcome = 'failed';
        }
      }
    } else if (apply) {
      applyOutcome = 'skipped_not_fill';
    }
    return {
      shelter_id: shelter.id, shelter: shelter.name, existing_url: shelter.logo_url || null,
      current_logo_source_url: shelter.logo_source_url || null,
      current_logo_source_type: shelter.logo_source_type || null,
      current_logo_verification_status: shelter.logo_verification_status || null,
      current_logo_checked_at: shelter.logo_checked_at || null,
      proposed_url: result.proposedUrl, official_source_page: result.sourceUrl,
      source_type: result.sourceType, discovery_method: result.discoveryMethod,
      validation: result.validation, existing_validation: result.existingValidation || null, action: result.action,
      apply_outcome: applyOutcome, apply_error: applyError,
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

module.exports = { boundedInteger, incrementSummary, mapConcurrent, parseShelterIds, validateWriteMode };
