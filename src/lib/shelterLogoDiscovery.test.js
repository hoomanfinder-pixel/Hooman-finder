import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validator = require('../../scripts/shelter-logo-validator.cjs');
const discovery = require('../../scripts/shelter-logo-discovery.cjs');
const cli = require('../../scripts/discover-shelter-logos.cjs');

function png(width = 64, height = 64, animated = false) {
  const buffer = Buffer.alloc(animated ? 36 : 24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  if (animated) buffer.write('acTL', 28, 'ascii');
  return buffer;
}

function webp(width = 64, height = 64, animated = false) {
  const buffer = Buffer.alloc(36);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(28, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  if (animated) buffer.write('ANIM', 30, 'ascii');
  return buffer;
}

function jpeg(width = 64, height = 64) {
  const buffer = Buffer.alloc(23);
  buffer.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  buffer.set([0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00], 11);
  buffer.set([0xff, 0xd9], 21);
  return buffer;
}

function avif(width = 64, height = 64, animated = false) {
  const buffer = Buffer.alloc(48);
  buffer.writeUInt32BE(24, 0);
  buffer.write('ftyp', 4, 'ascii');
  buffer.write(animated ? 'avis' : 'avif', 8, 'ascii');
  buffer.write('avif', 16, 'ascii');
  buffer.write('ispe', 28, 'ascii');
  buffer.writeUInt32BE(width, 36);
  buffer.writeUInt32BE(height, 40);
  return buffer;
}

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

function scriptedRequest(responses, captures = []) {
  let index = 0;
  return {
    captures,
    requestImpl(url, options, callback) {
      const responseSpec = responses[index++];
      if (!responseSpec) throw new Error(`unexpected request to ${url.href}`);
      const request = new EventEmitter();
      request.setTimeout = () => {};
      request.destroy = (error) => { if (error) request.emit('error', error); };
      options.lookup(url.hostname, {}, (error, address, family) => {
        captures.push({ url: url.href, hostname: url.hostname, options, error, address, family });
      });
      const response = new EventEmitter();
      response.statusCode = responseSpec.status;
      response.headers = responseSpec.headers || {};
      response.destroy = (error) => { if (error) response.emit('error', error); };
      queueMicrotask(() => {
        callback(response);
        if (responseSpec.body) response.emit('data', Buffer.from(responseSpec.body));
        response.emit('end');
      });
      return request;
    },
  };
}

test('website normalization accepts safe absolute and hostname-only values', () => {
  assert.equal(validator.normalizeShelterWebsite('example.org'), 'https://example.org/');
  assert.equal(validator.normalizeShelterWebsite('http://example.org/path#x'), 'http://example.org/path');
  assert.equal(validator.normalizeShelterWebsite('https://user:pass@example.org'), null);
  assert.equal(validator.normalizeShelterWebsite('709 Lorillard Ave'), null);
  assert.equal(validator.normalizeShelterWebsite('ftp://example.org'), null);
});

test('URL safety rejects local, private, credentialed, nonstandard-port, and DNS-rebound targets', async () => {
  await assert.rejects(() => validator.assertSafeNetworkUrl('http://localhost/x'), /private_host/);
  await assert.rejects(() => validator.assertSafeNetworkUrl('http://127.0.0.1/x'), /private_address/);
  await assert.rejects(() => validator.assertSafeNetworkUrl('http://[::1]/x'), /private_address/);
  await assert.rejects(() => validator.assertSafeNetworkUrl('https://user:pass@example.org/x', { lookup: publicLookup }), /embedded_credentials/);
  await assert.rejects(() => validator.assertSafeNetworkUrl('https://example.org:8443/x', { lookup: publicLookup }), /nonstandard_port/);
  await assert.rejects(() => validator.assertSafeNetworkUrl('https://example.org/x', { lookup: async () => [{ address: '10.0.0.2' }] }), /private_address/);
});

test('safe fetch revalidates redirect targets and enforces redirect and byte limits', async () => {
  const redirectPrivate = async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } });
  await assert.rejects(() => validator.fetchSafely('https://example.org', { fetchImpl: redirectPrivate, lookup: publicLookup }), /private_address/);
  let lookups = 0;
  const changingLookup = async () => [{ address: ++lookups === 1 ? '93.184.216.34' : '10.0.0.2' }];
  const redirectPublicName = async () => new Response(null, { status: 302, headers: { location: 'https://other.example/final' } });
  await assert.rejects(() => validator.fetchSafely('https://example.org', { fetchImpl: redirectPublicName, lookup: changingLookup }), /private_address/);
  const loop = async () => new Response(null, { status: 302, headers: { location: 'https://example.org/again' } });
  await assert.rejects(() => validator.fetchSafely('https://example.org', { fetchImpl: loop, lookup: publicLookup, maxRedirects: 1 }), /too_many_redirects/);
  const large = async () => new Response('x'.repeat(30), { status: 200, headers: { 'content-type': 'text/html' } });
  await assert.rejects(() => validator.fetchSafely('https://example.org', { fetchImpl: large, lookup: publicLookup, maxBytes: 20 }), /response_too_large/);
});

test('DNS rebinding after validation cannot change the production connection target', async () => {
  let dnsCalls = 0;
  const lookup = async () => [{ address: ++dnsCalls === 1 ? '93.184.216.34' : '10.0.0.9', family: 4 }];
  const scripted = scriptedRequest([{ status: 200, headers: { 'content-type': 'text/html' }, body: 'safe' }]);
  const result = await validator.fetchSafely('https://public.example/', { lookup, requestImpl: scripted.requestImpl });
  assert.equal(result.body.toString(), 'safe');
  assert.equal(dnsCalls, 1, 'the socket must not perform a second authoritative DNS lookup');
  assert.equal(scripted.captures[0].address, '93.184.216.34');
  assert.equal(scripted.captures[0].family, 4);
});

test('production redirect to a privately resolving hostname is blocked before connection', async () => {
  const lookup = async (hostname) => [{ address: hostname === 'private.example' ? '169.254.169.254' : '93.184.216.34', family: 4 }];
  const scripted = scriptedRequest([{ status: 302, headers: { location: 'http://private.example/metadata' } }]);
  await assert.rejects(
    () => validator.fetchSafely('https://public.example/', { lookup, requestImpl: scripted.requestImpl }),
    /private_address/,
  );
  assert.equal(scripted.captures.length, 1, 'no request may be opened to the private redirect target');
});

test('production redirect pins each independently validated public destination', async () => {
  const lookup = async (hostname) => [{ address: hostname === 'other.example' ? '142.250.72.14' : '93.184.216.34', family: 4 }];
  const scripted = scriptedRequest([
    { status: 302, headers: { location: 'https://other.example/final' } },
    { status: 200, headers: { 'content-type': 'text/html' }, body: 'done' },
  ]);
  const result = await validator.fetchSafely('https://public.example/', { lookup, requestImpl: scripted.requestImpl });
  assert.equal(result.finalUrl, 'https://other.example/final');
  assert.deepEqual(scripted.captures.map(({ address }) => address), ['93.184.216.34', '142.250.72.14']);
});

test('pinned HTTPS keeps the original hostname for Host, SNI, and certificate validation', async () => {
  const scripted = scriptedRequest([{ status: 200, headers: { 'content-type': 'text/html' }, body: 'tls' }]);
  await validator.fetchSafely('https://shelter.example/path', { lookup: publicLookup, requestImpl: scripted.requestImpl });
  const [{ hostname, options }] = scripted.captures;
  assert.equal(hostname, 'shelter.example');
  assert.equal(options.headers.host, 'shelter.example');
  assert.equal(options.servername, 'shelter.example');
  assert.equal(options.rejectUnauthorized, true);
});

test('image validation accepts supported static formats with matching MIME', () => {
  assert.equal(validator.inspectImage(png(), 'image/png').type, 'image/png');
  assert.equal(validator.inspectImage(jpeg(), 'image/jpeg').type, 'image/jpeg');
  assert.equal(validator.inspectImage(webp(), 'image/webp').type, 'image/webp');
  assert.equal(validator.inspectImage(avif(), 'image/avif').type, 'image/avif');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M0 0h1"/></svg>');
  assert.equal(validator.inspectImage(svg, 'image/svg+xml').type, 'image/svg+xml');
});

test('image validation rejects spoofing, trackers, bombs, extreme ratios, and animation', () => {
  assert.throws(() => validator.inspectImage(Buffer.from('<html>no</html>'), 'image/png'), /unsupported_or_spoofed/);
  assert.throws(() => validator.inspectImage(png(), 'text/html'), /mime_magic_mismatch/);
  assert.throws(() => validator.inspectImage(png(1, 1), 'image/png'), /image_too_small/);
  assert.throws(() => validator.inspectImage(png(5000, 5000), 'image/png'), /image_too_large/);
  assert.throws(() => validator.inspectImage(png(1000, 32), 'image/png'), /extreme_aspect_ratio/);
  assert.throws(() => validator.inspectImage(png(64, 64, true), 'image/png'), /animated_image/);
  assert.throws(() => validator.inspectImage(webp(64, 64, true), 'image/webp'), /animated_image/);
  assert.throws(() => validator.inspectImage(avif(64, 64, true), 'image/avif'), /animated_image/);
});

test('SVG validation rejects scripts, handlers, foreignObject, external references, and malformed files', () => {
  const wrap = (body) => Buffer.from(`<svg viewBox="0 0 64 64">${body}</svg>`);
  for (const unsafe of [
    '<script>alert(1)</script>', '<path onclick="x()"/>', '<foreignObject/>',
    '<image href="https://evil.example/x.png"/>', '<image href="data:image/png;base64,x"/>',
    '<style>@import url(x);path{fill:url(//evil.example/x)}</style>',
  ]) assert.throws(() => validator.inspectImage(wrap(unsafe), 'image/svg+xml'));
  assert.throws(() => validator.inspectImage(Buffer.from('<!DOCTYPE svg><svg viewBox="0 0 64 64"></svg>'), 'image/svg+xml'), /unsafe_svg/);
  assert.throws(() => validator.inspectImage(Buffer.from('<svg viewBox="0 0 64 64">'), 'image/svg+xml'), /malformed_svg/);
});

test('discovery extracts only structured or strong header candidates and treats OG as support', () => {
  const html = `
    <script type="application/ld+json">{"@type":"Organization","logo":"/structured.png"}</script>
    <header><img class="site-logo" src="https://cdn.wixstatic.com/header.png" alt="Rescue logo"></header>
    <main><img src="/dog.jpg" alt="Adoptable dog"></main>
    <meta property="og:image" content="/structured.png">`;
  const candidates = discovery.extractLogoCandidates(html, 'https://rescue.example.org/');
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].url, 'https://rescue.example.org/structured.png');
  assert.deepEqual(candidates[0].evidence.sort(), ['open_graph', 'organization_logo']);
  assert.ok(candidates.every(({ url }) => !url.endsWith('dog.jpg')));
});

test('discovery caps remotely fetched candidates at five', () => {
  const images = Array.from({ length: 8 }, (_, index) => `<img class="site-logo" src="/logo-${index}.png">`).join('');
  assert.equal(discovery.extractLogoCandidates(`<header>${images}</header>`, 'https://rescue.example/').length, 5);
});

test('canonical homepage stays same-site and falls back to the official origin root', () => {
  assert.equal(discovery.canonicalHomepage('', 'https://rescue.example/adopt/dogs?x=1'), 'https://rescue.example/');
  assert.equal(discovery.canonicalHomepage('<link rel="canonical" href="https://rescue.example/about">', 'https://rescue.example/adopt'), 'https://rescue.example/');
  assert.equal(discovery.canonicalHomepage('<link rel="canonical" href="https://evil.example/">', 'https://rescue.example/adopt'), 'https://rescue.example/');
  assert.equal(discovery.canonicalHomepage('', 'https://rescue.example/'), null);
});

test('discovery rejects prohibited proxies, favicons, guessed paths, unrelated CDNs, and OG-only evidence', () => {
  const html = `
    <script type="application/ld+json">{"@type":"Organization","logo":"https://lh3.googleusercontent.com/logo.png"}</script>
    <header><img class="logo" src="/favicon.ico"><img class="logo" src="https://unrelated.example.net/logo.png"></header>
    <meta property="og:image" content="/social-card.png">`;
  const candidates = discovery.extractLogoCandidates(html, 'https://rescue.example.org/');
  assert.equal(candidates.length, 1);
  const validated = candidates.map((candidate) => ({ ...candidate, validation: { ok: true } }));
  assert.equal(discovery.chooseDeterministicCandidate(validated), null);
  assert.equal(validator.isProhibitedLogoUrl('https://example.org/logo.png'), false, 'normal logo paths are not guessed or globally prohibited');
});

test('deterministic selection rejects ambiguous equal-ranked candidates', () => {
  const base = { score: 400, validation: { ok: true } };
  assert.equal(discovery.chooseDeterministicCandidate([{ ...base, url: 'https://x.example/a.png' }, { ...base, url: 'https://x.example/b.png' }]), null);
  assert.equal(discovery.chooseDeterministicCandidate([{ ...base, url: 'https://x.example/a.png' }]).url, 'https://x.example/a.png');
});

test('lifecycle retries unchecked and broken immediately and spaces normal retries and verification', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  assert.equal(discovery.isDue({}, now), true);
  assert.equal(discovery.isDue({ logo_checked_at: now, logo_verification_status: 'broken' }, now), true);
  assert.equal(discovery.isDue({ logo_checked_at: now, logo_verification_status: 'fetch_failed' }, now), false);
  assert.equal(discovery.isDue({ logo_checked_at: '2026-09-01T00:00:00Z', logo_verification_status: 'rejected' }, now), true);
  assert.equal(discovery.isDue({ logo_checked_at: '2026-08-01T00:00:00Z', logo_verification_status: 'verified' }, now), false);
  assert.equal(discovery.isDue({ logo_checked_at: '2026-06-01T00:00:00Z', logo_verification_status: 'verified' }, now), true);
});

test('legacy healthy logos are verified without replacement', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('.png')) return new Response(png(), { status: 200, headers: { 'content-type': 'image/png' } });
    throw new Error('website must not be fetched when legacy logo is healthy');
  };
  const result = await discovery.inspectShelter({ website: 'https://rescue.example', logo_url: 'https://rescue.example/logo.png' }, { fetchImpl, lookup: publicLookup });
  assert.equal(result.action, 'verified_existing');
  assert.equal(result.proposedUrl, 'https://rescue.example/logo.png');
  assert.equal(result.sourceType, 'legacy');
});

test('broken legacy logos can be replaced only by one validated high-confidence official candidate', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('old.png')) return new Response('missing', { status: 404 });
    if (url === 'https://rescue.example/') return new Response('<header><img class="site-logo" src="/new.png"></header>', { status: 200, headers: { 'content-type': 'text/html' } });
    if (url.endsWith('new.png')) return new Response(png(), { status: 200, headers: { 'content-type': 'image/png' } });
    throw new Error(`unexpected URL ${url}`);
  };
  const result = await discovery.inspectShelter({ website: 'rescue.example', logo_url: 'https://rescue.example/old.png' }, { fetchImpl, lookup: publicLookup });
  assert.equal(result.action, 'replace');
  assert.equal(result.proposedUrl, 'https://rescue.example/new.png');
  assert.equal(result.status, 'verified');
});

test('an optional homepage failure does not discard a successfully fetched official subpage', async () => {
  const fetchImpl = async (url) => {
    if (url === 'https://rescue.example/adopt') return new Response('<header><img class="site-logo" src="/logo.png"></header>', { status: 200, headers: { 'content-type': 'text/html' } });
    if (url === 'https://rescue.example/') return new Response('missing', { status: 404 });
    if (url.endsWith('/logo.png')) return new Response(png(), { status: 200, headers: { 'content-type': 'image/png' } });
    throw new Error(`unexpected URL ${url}`);
  };
  const result = await discovery.inspectShelter({ website: 'https://rescue.example/adopt', logo_url: null }, { fetchImpl, lookup: publicLookup });
  assert.equal(result.action, 'fill');
  assert.equal(result.proposedUrl, 'https://rescue.example/logo.png');
});

test('persistence updates only logo lifecycle fields and carries both compare-and-set guards', async () => {
  const calls = [];
  const query = {
    eq(key, value) { calls.push(['eq', key, value]); return this; },
    is(key, value) { calls.push(['is', key, value]); return this; },
    select(value) { calls.push(['select', value]); return this; },
    async maybeSingle() { return { data: { id: 's1' }, error: null }; },
  };
  const supabase = { from(table) { assert.equal(table, 'shelters'); return { update(payload) { calls.push(['update', payload]); return query; } }; } };
  const shelter = { id: 's1', logo_url: null, logo_verification_status: null };
  const result = { action: 'fill', proposedUrl: 'https://rescue.example/logo.png', sourceUrl: 'https://rescue.example/', sourceType: 'official_website', status: 'verified', checkedAt: '2026-10-09T12:00:00Z' };
  await discovery.compareAndSetShelter(supabase, shelter, result);
  const payload = calls.find(([kind]) => kind === 'update')[1];
  assert.deepEqual(Object.keys(payload).sort(), ['logo_checked_at', 'logo_source_type', 'logo_source_url', 'logo_url', 'logo_verification_status']);
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'id' && call[2] === 's1'));
  assert.ok(calls.some((call) => call[0] === 'is' && call[1] === 'logo_url'));
  for (const field of ['logo_url', 'logo_source_url', 'logo_source_type', 'logo_verification_status', 'logo_checked_at']) {
    assert.ok(calls.some((call) => call[0] === 'is' && call[1] === field), `missing guard for ${field}`);
  }
});

test('persistence fails closed when compare-and-set matches no shelter row', async () => {
  const query = {
    eq() { return this; }, is() { return this; }, select() { return this; },
    async maybeSingle() { return { data: null, error: null }; },
  };
  const supabase = { from() { return { update() { return query; } }; } };
  await assert.rejects(
    () => discovery.compareAndSetShelter(supabase, { id: 's1', logo_url: 'old', logo_verification_status: 'verified' }, { action: 'broken', status: 'broken', checkedAt: new Date().toISOString() }),
    /compare_and_set_conflict/,
  );
});

test('CLI bounds limit and concurrency and apply is gated in source', () => {
  assert.equal(cli.boundedInteger('missing-test-arg', 20, 20), 20);
  assert.equal(cli.validateWriteMode({ apply: false, writesEnabled: false }), false);
  assert.throws(() => cli.validateWriteMode({ apply: true, writesEnabled: false }), /requires SHELTER_LOGO_WRITES_ENABLED/);
  assert.equal(cli.validateWriteMode({ apply: true, writesEnabled: true }), true);
  assert.deepEqual(cli.parseShelterIds('7d90d385-c672-40dd-a995-0cd307ba2876,7d90d385-c672-40dd-a995-0cd307ba2876'), ['7d90d385-c672-40dd-a995-0cd307ba2876']);
  assert.throws(() => cli.parseShelterIds('not-a-uuid'), /Invalid shelter UUID/);
  const source = fs.readFileSync(path.join(ROOT, 'scripts/discover-shelter-logos.cjs'), 'utf8');
  assert.match(source, /SHELTER_LOGO_WRITES_ENABLED === 'true'/);
  assert.match(source, /apply && !writesEnabled/);
  assert.match(source, /boundedInteger\('limit', 20, 20\)/);
  assert.match(source, /boundedInteger\('concurrency', 3, 3\)/);
  assert.match(source, /shelterQuery\.in\('id', shelterIds\)/);
  assert.match(source, /fillsOnly \|\| result\.action === 'fill'/);
  assert.doesNotMatch(source, /OpenAI|--force/);
});

test('migration is additive, nullable, idempotent, and does not backfill logo data', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261009130000_add_shelter_logo_provenance.sql'), 'utf8');
  for (const column of ['logo_source_url', 'logo_source_type', 'logo_verification_status', 'logo_checked_at']) {
    assert.match(sql, new RegExp(`add column if not exists ${column}`));
  }
  for (const value of ['shelter_provided', 'official_website', 'official_provider', 'official_social', 'legacy', 'unverified', 'verified', 'fetch_failed', 'rejected', 'broken']) {
    assert.match(sql, new RegExp(`'${value}'`));
  }
  assert.doesNotMatch(sql, /update\s+public\.shelters/i);
  assert.doesNotMatch(sql, /default/i);
});

test('workflow remains manual-only, dry-run by default, bounded, and reports summaries', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/discover-shelter-logos.yml'), 'utf8');
  assert.match(workflow, /# schedule:/);
  assert.doesNotMatch(workflow, /^\s{2}schedule:/m);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /default:\s*false/);
  assert.match(workflow, /default:\s*20/);
  assert.match(workflow, /--concurrency=3/);
  assert.match(workflow, /timeout-minutes:\s*20/);
  assert.match(workflow, /SHELTER_LOGO_WRITES_ENABLED/);
  assert.match(workflow, /github\.event_name == 'schedule'/);
  const source = fs.readFileSync(path.join(ROOT, 'scripts/discover-shelter-logos.cjs'), 'utf8');
  for (const key of ['considered', 'skipped_verified', 'discovered', 'verified_existing', 'filled', 'replaced', 'rejected', 'no_candidate', 'fetch_failed', 'broken', 'deferred']) assert.match(source, new RegExp(key));
});
