const {
  fetchAndValidateImage,
  fetchSafely,
  isKnownAssetHost,
  isProhibitedLogoUrl,
  isSameSite,
  normalizeShelterWebsite,
} = require('./shelter-logo-validator.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 30 * DAY_MS;
const REVERIFY_AFTER_MS = 90 * DAY_MS;
const SOURCE_SCORES = {
  shelter_provided: 500,
  organization_logo: 400,
  header_logo: 300,
  official_provider: 275,
  open_graph: 25,
};

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

function parseAttributes(tag) {
  const result = {};
  for (const match of String(tag).matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

function resolveCandidateUrl(value, pageUrl) {
  try {
    const resolved = new URL(decodeHtml(value), pageUrl);
    return ['http:', 'https:'].includes(resolved.protocol) ? resolved.href : null;
  } catch {
    return null;
  }
}

function organizationLogos(node, output = []) {
  if (Array.isArray(node)) {
    for (const item of node) organizationLogos(item, output);
    return output;
  }
  if (!node || typeof node !== 'object') return output;
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  if (types.some((type) => /^(?:organization|animalShelter|localBusiness)$/i.test(String(type || '')))) {
    const logo = typeof node.logo === 'object' ? (node.logo.url || node.logo.contentUrl) : node.logo;
    if (typeof logo === 'string') output.push(logo);
  }
  for (const value of Object.values(node)) organizationLogos(value, output);
  return output;
}

function addCandidate(map, rawUrl, pageUrl, evidence, score, sourceType = 'official_website') {
  const url = resolveCandidateUrl(rawUrl, pageUrl);
  if (!url || isProhibitedLogoUrl(url)) return;
  if (!isSameSite(url, pageUrl) && !isKnownAssetHost(url)) return;
  const existing = map.get(url) || { url, pageUrl, sourceType, evidence: [], score: 0 };
  if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
  existing.score = Math.max(existing.score, score) + (evidence === 'open_graph' ? 10 : 0);
  if (sourceType === 'official_provider') existing.sourceType = sourceType;
  map.set(url, existing);
}

function extractLogoCandidates(html, pageUrl) {
  const candidates = new Map();
  for (const match of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      for (const logo of organizationLogos(JSON.parse(match[1]))) {
        addCandidate(candidates, logo, pageUrl, 'organization_logo', SOURCE_SCORES.organization_logo);
      }
    } catch {
      // Invalid page metadata is ignored; it never becomes a candidate.
    }
  }

  const strongRegions = [...String(html).matchAll(/<(?:header|nav)\b[^>]*>([\s\S]*?)<\/(?:header|nav)>/gi)].map((match) => match[0]);
  for (const region of strongRegions) {
    for (const match of region.matchAll(/<img\b[^>]*>/gi)) {
      const attrs = parseAttributes(match[0]);
      const signal = `${attrs.alt || ''} ${attrs.id || ''} ${attrs.class || ''} ${attrs.src || ''}`;
      if (!/\b(?:logo|brand|site-logo|header-logo)\b/i.test(signal)) continue;
      const sourceType = /(^|\.)rescuegroups\.org$/i.test(new URL(pageUrl).hostname) ? 'official_provider' : 'official_website';
      addCandidate(candidates, attrs.src || attrs['data-src'], pageUrl, 'header_logo', SOURCE_SCORES[sourceType === 'official_provider' ? 'official_provider' : 'header_logo'], sourceType);
    }
  }

  for (const match of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if (!/^og:(?:image|logo)$/i.test(attrs.property || attrs.name || '')) continue;
    addCandidate(candidates, attrs.content, pageUrl, 'open_graph', SOURCE_SCORES.open_graph);
  }
  return [...candidates.values()].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url)).slice(0, 5);
}

function chooseDeterministicCandidate(candidates) {
  const acceptable = candidates.filter((candidate) => candidate.validation?.ok && candidate.score >= SOURCE_SCORES.official_provider);
  if (!acceptable.length) return null;
  const bestScore = Math.max(...acceptable.map(({ score }) => score));
  const best = acceptable.filter(({ score }) => score === bestScore);
  return best.length === 1 ? best[0] : null;
}

function isDue(shelter, now = new Date()) {
  if (!shelter.logo_checked_at) return true;
  const age = now.getTime() - new Date(shelter.logo_checked_at).getTime();
  if (!Number.isFinite(age) || age < 0) return true;
  if (shelter.logo_verification_status === 'verified') return age >= REVERIFY_AFTER_MS;
  if (shelter.logo_verification_status === 'broken') return true;
  return age >= RETRY_AFTER_MS;
}

function lifecyclePriority(shelter) {
  if (!shelter.logo_checked_at) return 0;
  if (shelter.logo_verification_status === 'broken') return 1;
  if (!shelter.logo_url) return 2;
  if (['fetch_failed', 'rejected', 'unverified'].includes(shelter.logo_verification_status)) return 3;
  return 4;
}

async function validateCandidate(candidate, adapters = {}) {
  try {
    const validation = await fetchAndValidateImage(candidate.url, adapters);
    return { ...candidate, validation: { ok: true, ...validation } };
  } catch (error) {
    return { ...candidate, validation: { ok: false, error: error.message } };
  }
}

async function fetchOfficialPage(url, adapters = {}) {
  const result = await fetchSafely(url, adapters);
  const mime = String(result.response.headers.get('content-type') || '').toLowerCase();
  if (!mime.startsWith('text/html') && !mime.startsWith('application/xhtml+xml')) throw new Error('non_html_page');
  return { url: result.finalUrl, html: result.body.toString('utf8') };
}

function canonicalHomepage(html, pageUrl) {
  const match = String(html).match(/<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i);
  const href = match ? parseAttributes(match[0]).href : null;
  const resolved = href ? resolveCandidateUrl(href, pageUrl) : null;
  const parsed = new URL(resolved && isSameSite(resolved, pageUrl) ? resolved : pageUrl);
  parsed.pathname = '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed.href === pageUrl ? null : parsed.href;
}

async function inspectShelter(shelter, adapters = {}) {
  const checkedAt = new Date().toISOString();
  const website = normalizeShelterWebsite(shelter.website);
  const existing = shelter.logo_url ? { url: shelter.logo_url, pageUrl: website, sourceType: shelter.logo_source_type || 'legacy', evidence: ['legacy'], score: SOURCE_SCORES.shelter_provided } : null;
  let existingValidation = null;
  if (existing) existingValidation = await validateCandidate(existing, adapters);

  if (existingValidation?.validation.ok && !isProhibitedLogoUrl(existing.url)) {
    return {
      action: 'verified_existing',
      checkedAt,
      existingUrl: shelter.logo_url,
      proposedUrl: shelter.logo_url,
      sourceUrl: shelter.logo_source_url || website,
      sourceType: shelter.logo_source_type || 'legacy',
      discoveryMethod: 'legacy_validation',
      validation: existingValidation.validation,
      existingValidation: existingValidation.validation,
      status: 'verified',
    };
  }

  if (!website) {
    return {
      action: existing ? 'broken' : 'rejected', checkedAt, existingUrl: shelter.logo_url || null,
      proposedUrl: null, sourceUrl: null, sourceType: shelter.logo_source_type || null,
      discoveryMethod: null, validation: existingValidation?.validation || { ok: false, error: 'missing_or_invalid_website' },
      existingValidation: existingValidation?.validation || null,
      status: existing ? 'broken' : 'rejected',
    };
  }

  let pages;
  try {
    const first = await fetchOfficialPage(website, adapters);
    pages = [first];
    const canonical = canonicalHomepage(first.html, first.url);
    if (canonical && canonical !== first.url) {
      try {
        pages.push(await fetchOfficialPage(canonical, adapters));
      } catch {
        // The stored official page remains usable when the optional homepage
        // cannot be fetched. Candidate validation still fails closed below.
      }
    }
  } catch (error) {
    return {
      action: existing ? 'broken' : 'fetch_failed', checkedAt, existingUrl: shelter.logo_url || null,
      proposedUrl: null, sourceUrl: website, sourceType: shelter.logo_source_type || null,
      discoveryMethod: null, validation: { ok: false, error: error.message }, status: existing ? 'broken' : 'fetch_failed',
      existingValidation: existingValidation?.validation || null,
    };
  }

  const candidates = pages.flatMap((page) => extractLogoCandidates(page.html, page.url)).slice(0, 5);
  const validated = [];
  for (const candidate of candidates) validated.push(await validateCandidate(candidate, adapters));
  const winner = chooseDeterministicCandidate(validated);
  if (!winner) {
    return {
      action: existing ? 'broken' : (candidates.length ? 'rejected' : 'no_candidate'), checkedAt,
      existingUrl: shelter.logo_url || null, proposedUrl: null, sourceUrl: pages[0].url,
      sourceType: shelter.logo_source_type || null, discoveryMethod: null,
      validation: { ok: false, error: candidates.length ? 'no_unique_high_confidence_candidate' : 'no_candidate' },
      existingValidation: existingValidation?.validation || null,
      candidates: validated, status: existing ? 'broken' : 'rejected',
    };
  }
  return {
    action: existing ? 'replace' : 'fill', checkedAt, existingUrl: shelter.logo_url || null,
    proposedUrl: winner.validation.finalUrl, sourceUrl: winner.pageUrl, sourceType: winner.sourceType,
    discoveryMethod: winner.evidence.join('+'), validation: winner.validation, candidates: validated, status: 'verified',
    existingValidation: existingValidation?.validation || null,
  };
}

function buildLogoUpdate(result) {
  const update = {
    logo_source_url: result.sourceUrl || null,
    logo_source_type: result.sourceType || null,
    logo_verification_status: result.status,
    logo_checked_at: result.checkedAt,
  };
  if (['fill', 'replace'].includes(result.action)) update.logo_url = result.proposedUrl;
  return update;
}

async function compareAndSetShelter(supabase, shelter, result) {
  let query = supabase.from('shelters').update(buildLogoUpdate(result)).eq('id', shelter.id);
  query = shelter.logo_url == null ? query.is('logo_url', null) : query.eq('logo_url', shelter.logo_url);
  query = shelter.logo_verification_status == null
    ? query.is('logo_verification_status', null)
    : query.eq('logo_verification_status', shelter.logo_verification_status);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('compare_and_set_conflict');
  return data;
}

module.exports = {
  RETRY_AFTER_MS,
  REVERIFY_AFTER_MS,
  buildLogoUpdate,
  canonicalHomepage,
  chooseDeterministicCandidate,
  compareAndSetShelter,
  extractLogoCandidates,
  inspectShelter,
  isDue,
  lifecyclePriority,
  parseAttributes,
};
