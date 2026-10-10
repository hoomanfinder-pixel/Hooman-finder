const dns = require("node:dns").promises;
const http = require('node:http');
const https = require('node:https');
const net = require("node:net");

const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const USER_AGENT = "HoomanFinder-ShelterLogoVerifier/1.0 (+https://hoomanfinder.com)";
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/svg+xml"]);
const PROHIBITED_HOSTS = [
  /(^|\.)googleusercontent\.com$/i,
  /(^|\.)gstatic\.com$/i,
  /(^|\.)google\.com$/i,
  /(^|\.)bing\.com$/i,
  /(^|\.)duckduckgo\.com$/i,
];
const KNOWN_ASSET_HOSTS = [
  /(^|\.)wixstatic\.com$/i,
  /(^|\.)squarespace-cdn\.com$/i,
  /(^|\.)squarespace\.com$/i,
  /(^|\.)wsimg\.com$/i,
  /(^|\.)rescuegroups\.org$/i,
  /(^|\.)amazonaws\.com$/i,
];

function normalizeMime(value) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function normalizeShelterWebsite(value) {
  const raw = String(value || "").trim();
  if (!raw || /\s/.test(raw)) return null;
  let candidate = raw;
  if (/^\/\//.test(candidate)) candidate = `https:${candidate}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = `https://${candidate}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
  if (!parsed.hostname || parsed.hostname.includes(' ') || parsed.port) return null;
  parsed.hash = '';
  return parsed.href;
}

function isPrivateIpv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function isPrivateIp(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family !== 6) return true;
  const normalized = address.toLowerCase().split('%', 1)[0];
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
}

async function assertSafeNetworkUrl(value, { lookup = dns.lookup } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('invalid_url');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsafe_protocol');
  if (url.username || url.password) throw new Error('embedded_credentials');
  const allowedPort = !url.port || (url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443');
  if (!allowedPort) throw new Error('nonstandard_port');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (hostname.toLowerCase() === 'localhost' || hostname.toLowerCase().endsWith('.localhost')) throw new Error('private_host');
  const literalFamily = net.isIP(hostname);
  const addresses = literalFamily ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) throw new Error('private_address');
  return { url, addresses };
}

function pinnedRequest({ url, addresses }, { timeoutMs, maxBytes, accept, requestImpl = null }) {
  return new Promise((resolve, reject) => {
    const target = addresses[0];
    const transport = url.protocol === 'https:' ? https : http;
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const request = (requestImpl || transport.get)(url, {
      headers: { 'user-agent': USER_AGENT, accept, host: url.host },
      family: target.family || net.isIP(target.address),
      rejectUnauthorized: true,
      servername: net.isIP(hostname) ? undefined : hostname,
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family || net.isIP(target.address)),
    }, (response) => {
      const declared = Number(response.headers['content-length'] || 0);
      if (declared > maxBytes) {
        response.destroy();
        reject(new Error('response_too_large'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(new Error('response_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: { get: (name) => response.headers[String(name).toLowerCase()] || null },
        body: Buffer.concat(chunks),
      }));
      response.on('error', reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`request_timeout_${timeoutMs}ms`)));
    request.on('error', reject);
  });
}

async function readBoundedBody(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error('response_too_large');
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('response_too_large');
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('response_too_large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function fetchSafely(value, {
  fetchImpl = null,
  requestImpl = null,
  lookup = dns.lookup,
  timeoutMs = 10_000,
  maxRedirects = MAX_REDIRECTS,
  maxBytes = MAX_HTML_BYTES,
  accept = 'text/html,application/xhtml+xml',
} = {}) {
  let current = String(value);
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const safeTarget = await assertSafeNetworkUrl(current, { lookup });
    let response;
    let body;
    if (fetchImpl) {
      response = await fetchImpl(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': USER_AGENT, accept },
      });
    } else {
      const pinned = await pinnedRequest(safeTarget, { timeoutMs, maxBytes, accept, requestImpl });
      response = pinned;
      body = pinned.body;
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === maxRedirects) throw new Error('too_many_redirects');
      const location = response.headers.get('location');
      if (!location) throw new Error('redirect_without_location');
      current = new URL(location, current).href;
      continue;
    }
    if (response.status !== 200) throw new Error(`http_${response.status}`);
    return { response, finalUrl: current, body: body || await readBoundedBody(response, maxBytes) };
  }
  throw new Error('too_many_redirects');
}

function pngInfo(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  if (buffer.includes(Buffer.from('acTL'))) throw new Error('animated_image');
  return { type: 'image/png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegInfo(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) throw new Error('malformed_image');
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { type: 'image/jpeg', width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  throw new Error('malformed_image');
}

function webpInfo(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  if (buffer.includes(Buffer.from('ANIM')) || buffer.includes(Buffer.from('ANMF'))) throw new Error('animated_image');
  const kind = buffer.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { type: 'image/webp', width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  if (kind === 'VP8L' && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return { type: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8 ' && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return { type: 'image/webp', width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  throw new Error('malformed_image');
}

function avifInfo(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 4, 8) !== 'ftyp') return null;
  const brand = buffer.toString('ascii', 8, 12);
  const compat = buffer.toString('ascii', 16, Math.min(buffer.length, 64));
  if (brand !== 'avif' && !compat.includes('avif')) return null;
  if (brand === 'avis' || compat.includes('avis')) throw new Error('animated_image');
  for (let offset = 0; offset + 20 <= buffer.length; offset += 1) {
    if (buffer.toString('ascii', offset, offset + 4) === 'ispe' && offset + 12 <= buffer.length) {
      return { type: 'image/avif', width: buffer.readUInt32BE(offset + 8), height: buffer.readUInt32BE(offset + 12) };
    }
  }
  throw new Error('malformed_image');
}

function svgInfo(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!/<svg\b/i.test(text)) return null;
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\b)/i.test(text)) throw new Error('unsafe_svg');
  if (!/^<\?xml\b[^>]*>\s*/i.test(text) && !/^<svg\b/i.test(text)) throw new Error('malformed_svg');
  if (!/<\/svg>\s*$/i.test(text)) throw new Error('malformed_svg');
  if (/<(?:script|foreignObject|iframe|object|embed|audio|video)\b/i.test(text) || /\bon\w+\s*=/i.test(text)) throw new Error('unsafe_svg');
  if (/@import/i.test(text) || /(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|data:)/i.test(text) || /url\(\s*["']?\s*(?:https?:|\/\/|data:)/i.test(text)) throw new Error('external_svg_reference');
  const svgTag = text.match(/<svg\b[^>]*>/i)?.[0] || '';
  const number = (name) => Number(svgTag.match(new RegExp(`\\b${name}\\s*=\\s*["']([0-9.]+)`, 'i'))?.[1]);
  let width = number('width');
  let height = number('height');
  if (!width || !height) {
    const viewBox = svgTag.match(/\bviewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
    width = width || Number(viewBox?.[1]);
    height = height || Number(viewBox?.[2]);
  }
  if (!width || !height) throw new Error('missing_dimensions');
  return { type: 'image/svg+xml', width, height };
}

function inspectImage(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('empty_image');
  const info = pngInfo(buffer) || jpegInfo(buffer) || webpInfo(buffer) || avifInfo(buffer) || svgInfo(buffer);
  if (!info) throw new Error('unsupported_or_spoofed_image');
  const mime = normalizeMime(contentType);
  if (!ALLOWED_IMAGE_TYPES.has(mime) || mime !== info.type) throw new Error('mime_magic_mismatch');
  if (info.width < 32 || info.height < 32) throw new Error('image_too_small');
  if (info.width * info.height > 16_000_000) throw new Error('image_too_large');
  if (Math.max(info.width / info.height, info.height / info.width) > 15) throw new Error('extreme_aspect_ratio');
  return info;
}

async function fetchAndValidateImage(url, options = {}) {
  if (isProhibitedLogoUrl(url)) throw new Error('prohibited_source');
  const result = await fetchSafely(url, {
    ...options,
    maxBytes: MAX_IMAGE_BYTES,
    accept: 'image/avif,image/webp,image/png,image/jpeg,image/svg+xml',
  });
  return { ...inspectImage(result.body, result.response.headers.get('content-type')), finalUrl: result.finalUrl, bytes: result.body.length };
}

function registrableApprox(hostname) {
  const parts = hostname.toLowerCase().split('.').filter(Boolean);
  return parts.slice(-2).join('.');
}

function isSameSite(first, second) {
  try {
    return registrableApprox(new URL(first).hostname) === registrableApprox(new URL(second).hostname);
  } catch {
    return false;
  }
}

function isKnownAssetHost(value) {
  try { return KNOWN_ASSET_HOSTS.some((pattern) => pattern.test(new URL(value).hostname)); } catch { return false; }
}

function isProhibitedLogoUrl(value) {
  try {
    const url = new URL(value);
    const full = `${url.hostname}${url.pathname}`;
    return PROHIBITED_HOSTS.some((pattern) => pattern.test(url.hostname)) || /(?:favicon|apple-touch-icon|gravatar|placeholder|default[-_]?logo)/i.test(full);
  } catch {
    return true;
  }
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  MAX_HTML_BYTES,
  MAX_IMAGE_BYTES,
  USER_AGENT,
  assertSafeNetworkUrl,
  fetchAndValidateImage,
  fetchSafely,
  inspectImage,
  isKnownAssetHost,
  isPrivateIp,
  isProhibitedLogoUrl,
  isSameSite,
  normalizeShelterWebsite,
  pinnedRequest,
};
