import { isPubliclyVisibleDog } from "./src/lib/dogVisibility.js";
import {
  buildDogProfileMetadata,
  getConfirmedDogProfile,
  truncateDogProfileText,
} from "./src/lib/dogProfileSeo.js";

const DOG_SELECT = [
  "id",
  "name",
  "description",
  "breed",
  "age_text",
  "age_years",
  "size",
  "placement_city",
  "placement_state",
  "placement_location",
  "shelter_id",
  "shelter_name",
  "shelter_website",
  "photo_url",
  "adoption_url",
  "source_url",
  "placement_note",
  "adoptable",
  "adoption_pending",
  "urgency_level",
  "availability_status",
  "rescuegroups_id",
  "rescuegroups_org_id",
  "source",
  "external_id",
  "shelters(id,name,city,state,apply_url,website)",
].join(",");

export const config = {
  matcher: ["/dog/:id", "/dogs/:id"],
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function replaceTag(html, pattern, replacement) {
  return pattern.test(html)
    ? html.replace(pattern, replacement)
    : html.replace("</head>", `    ${replacement}\n  </head>`);
}

export function buildDogMetadata(dog, id) {
  const publiclyVisible = isPubliclyVisibleDog(dog);
  return buildDogProfileMetadata(dog, id, { publiclyVisible });
}

function factItem(label, value) {
  if (!value) return "";
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

export function buildDogSnapshotHtml(dog) {
  const profile = getConfirmedDogProfile(dog);
  if (!profile.name) return "";

  const facts = [profile.breed, profile.age, profile.size, profile.location].filter(Boolean);
  const factSummary = facts.length
    ? `${profile.name} is an adoptable dog: ${facts.join(" · ")}.`
    : `${profile.name} is currently listed for adoption.`;
  const factList = [
    factItem("Breed", profile.breed),
    factItem("Age", profile.age),
    factItem("Size", profile.size),
    factItem("Location", profile.location),
  ].filter(Boolean).join("");
  const image = profile.image
    ? `<img src="${escapeHtml(profile.image)}" alt="${escapeHtml(`${profile.name}, an adoptable dog`)}" loading="eager" decoding="async" />`
    : "";
  const shelter = profile.shelterName
    ? `<p>Listed by <strong>${escapeHtml(profile.shelterName)}</strong>.</p>`
    : "";
  const bioPreview = truncateDogProfileText(profile.description, 900);
  const bio = bioPreview
    ? `<section aria-labelledby="dog-snapshot-about"><h2 id="dog-snapshot-about">About ${escapeHtml(profile.name)}</h2><p>${escapeHtml(bioPreview)}</p></section>`
    : "";
  const adoptionLink = profile.adoptionUrl
    ? `<p><a href="${escapeHtml(profile.adoptionUrl)}" target="_blank" rel="noreferrer">${escapeHtml(profile.adoptionLabel || "View official adoption listing")}</a></p>`
    : "";

  return [
    '<main data-dog-profile-snapshot="true">',
    "<article>",
    image,
    '<p>Adoptable dog profile</p>',
    `<h1>${escapeHtml(profile.name)}</h1>`,
    `<p>${escapeHtml(factSummary)}</p>`,
    factList ? `<dl>${factList}</dl>` : "",
    shelter,
    bio,
    adoptionLink,
    "</article>",
    "</main>",
  ].filter(Boolean).join("");
}

export function injectDogSnapshot(html, snapshotHtml) {
  if (!snapshotHtml) return html;

  return html.replace(
    /<div\b(?=[^>]*\bid=["']root["'])[^>]*>\s*<\/div>/i,
    (root) => root.replace(">", ' data-server-rendered-dog="true">').replace("</div>", `${snapshotHtml}</div>`)
  );
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

export function injectDogDocument(html, dog, metadata) {
  const withMetadata = injectDogMetadata(html, metadata);
  if (metadata.noindex) return withMetadata;
  return injectDogSnapshot(withMetadata, buildDogSnapshotHtml(dog));
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

    return new Response(request.method === "HEAD" ? null : injectDogDocument(html, dog, metadata), {
      status: shellResponse.status,
      headers,
    });
  } catch (error) {
    console.error("Could not render dog metadata.", error);
    return shellResponse;
  }
}
