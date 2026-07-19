import { isPubliclyVisibleDog } from "./src/lib/dogVisibility.js";

const SITE_URL = "https://hoomanfinder.com";
const DEFAULT_IMAGE = `${SITE_URL}/home-hero-adopter-dog-hd.jpg`;
const DOG_SELECT = [
  "id",
  "name",
  "description",
  "breed",
  "photo_url",
  "adoptable",
  "adoption_pending",
  "urgency_level",
  "availability_status",
  "rescuegroups_id",
  "rescuegroups_org_id",
  "source",
  "external_id",
].join(",");

export const config = {
  matcher: ["/dog/:id", "/dogs/:id"],
};

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function decodeHtmlEntities(value) {
  return clean(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–");
}

function plainText(value) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateAtWord(value, maxLength) {
  if (value.length <= maxLength) return value;
  const sliced = value.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  const shortened = lastSpace >= maxLength * 0.7 ? sliced.slice(0, lastSpace) : sliced;
  return `${shortened.trim()}…`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validImageUrl(value) {
  const raw = clean(value);

  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function replaceTag(html, pattern, replacement) {
  return pattern.test(html)
    ? html.replace(pattern, replacement)
    : html.replace("</head>", `    ${replacement}\n  </head>`);
}

export function buildDogMetadata(dog, id) {
  const name = plainText(dog?.name) || "Adoptable Dog";
  const breed = plainText(dog?.breed) || "dog";
  const bio = plainText(dog?.description);
  const canonicalUrl = `${SITE_URL}/dog/${encodeURIComponent(id)}`;
  const publiclyVisible = isPubliclyVisibleDog(dog);
  const title = publiclyVisible
    ? `${name} - Adoptable ${breed} | Hooman Finder`
    : `${name} - Adoption Status Unavailable | Hooman Finder`;
  const fallbackDescription = `Meet ${name}, an adoptable ${breed}. View photos and adoption details on Hooman Finder.`;
  const description = publiclyVisible
    ? truncateAtWord(bio ? `Meet ${name}. ${bio}` : fallbackDescription, 160)
    : `${name} may no longer be available. Browse currently adoptable dogs on Hooman Finder.`;
  const image = validImageUrl(dog?.photo_url) || DEFAULT_IMAGE;
  const imageAlt = publiclyVisible
    ? `${name}, adoptable ${breed}`
    : `${name}, dog with unavailable adoption status`;

  return {
    canonicalUrl,
    description,
    image,
    imageAlt,
    noindex: !publiclyVisible,
    title,
  };
}

export function injectDogMetadata(html, metadata) {
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const canonicalUrl = escapeHtml(metadata.canonicalUrl);
  const image = escapeHtml(metadata.image);
  const imageAlt = escapeHtml(metadata.imageAlt);

  let result = html;
  result = replaceTag(result, /<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  result = replaceTag(
    result,
    /<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/i,
    `<meta name="description" content="${description}" />`
  );
  result = replaceTag(
    result,
    /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i,
    `<link rel="canonical" href="${canonicalUrl}" />`
  );
  result = replaceTag(
    result,
    /<meta\b(?=[^>]*\bproperty=["']og:title["'])[^>]*>/i,
    `<meta property="og:title" content="${title}" />`
  );
  result = replaceTag(
    result,
    /<meta\b(?=[^>]*\bproperty=["']og:description["'])[^>]*>/i,
    `<meta property="og:description" content="${description}" />`
  );
  result = replaceTag(
    result,
    /<meta\b(?=[^>]*\bproperty=["']og:url["'])[^>]*>/i,
    `<meta property="og:url" content="${canonicalUrl}" />`
  );
  result = replaceTag(
    result,
    /<meta\b(?=[^>]*\bproperty=["']og:image["'])[^>]*>/i,
    `<meta property="og:image" content="${image}" />`
  );
  result = replaceTag(
    result,
    /<meta\b(?=[^>]*\bproperty=["']og:image:alt["'])[^>]*>/i,
    `<meta property="og:image:alt" content="${imageAlt}" />`
  );
  result = replaceTag(
    result,
    /<meta\b(?=[^>]*\bname=["']twitter:title["'])[^>]*>/i,
    `<meta name="twitter:title" content="${title}" />`
  );
  result = replaceTag(
    result,
    /<meta\b(?=[^>]*\bname=["']twitter:description["'])[^>]*>/i,
    `<meta name="twitter:description" content="${description}" />`
  );
  result = replaceTag(
    result,
    /<meta\b(?=[^>]*\bname=["']twitter:image["'])[^>]*>/i,
    `<meta name="twitter:image" content="${image}" />`
  );
  result = replaceTag(
    result,
    /<meta\b(?=[^>]*\bname=["']twitter:image:alt["'])[^>]*>/i,
    `<meta name="twitter:image:alt" content="${imageAlt}" />`
  );

  if (metadata.noindex) {
    result = replaceTag(
      result,
      /<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/i,
      '<meta name="robots" content="noindex, nofollow" />'
    );
  }

  return result;
}

async function fetchDog(id) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const query = new URLSearchParams({
    id: `eq.${id}`,
    limit: "1",
    select: DOG_SELECT,
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/dogs?${query}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase returned ${response.status}.`);
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function fetchAppShell(request) {
  const shellUrl = new URL("/spa.html", request.url);
  return fetch(shellUrl, {
    headers: {
      "user-agent": request.headers.get("user-agent") || "Hooman-Finder-Metadata",
    },
  });
}

export default async function middleware(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/dogs?\/([^/]+)\/?$/);
  if (!match) return undefined;

  let id;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }

  const shellResponse = await fetchAppShell(request);
  if (!shellResponse.ok) return shellResponse;

  try {
    const dog = await fetchDog(id);
    if (!dog) return shellResponse;

    const html = await shellResponse.text();
    const metadata = buildDogMetadata(dog, id);
    const headers = new Headers(shellResponse.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    headers.delete("etag");
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set(
      "cache-control",
      "public, max-age=0, s-maxage=300, stale-while-revalidate=86400"
    );
    headers.set(
      "vercel-cdn-cache-control",
      "public, s-maxage=300, stale-while-revalidate=86400"
    );

    return new Response(request.method === "HEAD" ? null : injectDogMetadata(html, metadata), {
      status: shellResponse.status,
      headers,
    });
  } catch (error) {
    console.error("Could not render dog metadata.", error);
    return shellResponse;
  }
}
