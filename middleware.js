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
  "gender",
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
  matcher: ["/((?!assets/|fonts/|.*\\.[a-zA-Z0-9]+$).*)"],
};

const INDEXABLE_STATIC_PATHS = new Set([
  "/",
  "/dogs",
  "/quiz",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/shelters/join",
]);
const NOINDEX_APP_PATHS = new Set(["/results", "/saved"]);

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
    factItem("Gender", profile.gender),
    factItem("Location", profile.location),
  ].filter(Boolean).join("");
  const image = profile.image
    ? `<img src="${escapeHtml(profile.image)}" alt="${escapeHtml(`${profile.name}, an adoptable dog`)}" loading="eager" decoding="async" />`
    : "";
  const shelterPath = profile.shelterId
    ? `/shelter/${encodeURIComponent(profile.shelterId)}`
    : "";
  const shelter = profile.shelterName
    ? `<p>Listed by ${shelterPath ? `<a href="${shelterPath}"><strong>${escapeHtml(profile.shelterName)}</strong></a>` : `<strong>${escapeHtml(profile.shelterName)}</strong>`}.</p>`
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
    `<nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/dogs">Dogs</a>${shelterPath ? ` / <a href="${shelterPath}">${escapeHtml(profile.shelterName || "Shelter")}</a>` : ""} / <span aria-current="page">${escapeHtml(profile.name)}</span></nav>`,
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

function jsonLdScript(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
}

function injectStructuredData(html, value) {
  return html.replace("</head>", `    ${jsonLdScript(value)}\n  </head>`);
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
  const profile = getConfirmedDogProfile(dog);
  const items = [
    ["Home", "/"],
    ["Dogs", "/dogs"],
    ...(profile.shelterId && profile.shelterName
      ? [[profile.shelterName, `/shelter/${profile.shelterId}`]]
      : []),
    [profile.name, `/dog/${dog.id}`],
  ];
  const structured = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemPage",
        name: metadata.title,
        url: metadata.canonicalUrl,
        description: metadata.description,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: items.map(([name, path], index) => ({
          "@type": "ListItem",
          position: index + 1,
          name,
          item: `https://hoomanfinder.com${path}`,
        })),
      },
    ],
  };
  return injectDogSnapshot(injectStructuredData(withMetadata, structured), buildDogSnapshotHtml(dog));
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

function supabaseCredentials() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are not configured.");
  return { url, key };
}

async function fetchRestRows(table, query) {
  const { url, key } = supabaseCredentials();
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`Supabase returned ${response.status}.`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function fetchShelter(id) {
  const query = new URLSearchParams({ id: `eq.${id}`, limit: "1", select: "*" });
  return (await fetchRestRows("shelters", query))[0] || null;
}

async function fetchShelterDogs(id) {
  const query = new URLSearchParams({
    shelter_id: `eq.${id}`,
    adoptable: "eq.true",
    select: DOG_SELECT,
    order: "name.asc",
  });
  return (await fetchRestRows("dogs", query)).filter(isPubliclyVisibleDog);
}

function shelterMetadata(shelter) {
  const name = String(shelter?.name || "Animal Shelter").trim();
  const state = /^[a-z]{2}$/i.test(String(shelter?.state || "").trim())
    ? String(shelter.state).trim().toUpperCase()
    : String(shelter?.state || "").trim();
  const location = [shelter?.city, state].filter(Boolean).join(", ");
  return {
    title: `${name} Dogs for Adoption${location ? ` in ${location}` : ""} | Hooman Finder`,
    description: `View current adoptable dogs from ${name}${location ? ` in ${location}` : ""}, with confirmed profile details and links to the official adoption source.`,
    canonicalUrl: `https://hoomanfinder.com/shelter/${encodeURIComponent(shelter.id)}`,
    image: "https://hoomanfinder.com/home-hero-dogs.jpg",
    imageAlt: `Adoptable dogs from ${name}`,
    noindex: false,
    name,
    location,
  };
}

function buildShelterSnapshotHtml(shelter, dogs) {
  const metadata = shelterMetadata(shelter);
  const officialUrl = String(shelter.apply_url || shelter.website || "").trim();
  const dogLinks = dogs.map((dog) =>
    `<li><a href="/dog/${encodeURIComponent(dog.id)}">${escapeHtml(dog.name || "Adoptable dog")}</a>${dog.breed ? ` — ${escapeHtml(dog.breed)}` : ""}</li>`
  ).join("");
  return [
    '<main data-shelter-profile-snapshot="true">',
    `<nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/dogs">Dogs</a> / <span aria-current="page">${escapeHtml(metadata.name)}</span></nav>`,
    `<h1>${escapeHtml(metadata.name)}</h1>`,
    metadata.location ? `<p>${escapeHtml(metadata.location)}</p>` : "",
    `<p>Browse ${dogs.length} current adoptable ${dogs.length === 1 ? "dog" : "dogs"} represented on Hooman Finder.</p>`,
    officialUrl.startsWith("http") ? `<p><a href="${escapeHtml(officialUrl)}" target="_blank" rel="noreferrer">Visit the official shelter or rescue website</a></p>` : "",
    `<section aria-labelledby="shelter-dogs"><h2 id="shelter-dogs">Current adoptable dogs</h2><ul>${dogLinks}</ul></section>`,
    "</main>",
  ].filter(Boolean).join("");
}

function injectRootSnapshot(html, snapshot, attribute) {
  return html.replace(
    /<div\b(?=[^>]*\bid=["']root["'])[^>]*>\s*<\/div>/i,
    `<div id="root" ${attribute}>${snapshot}</div>`
  );
}

function responseHeaders(shellResponse, cache = false) {
  const headers = new Headers(shellResponse.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("content-type", "text/html; charset=utf-8");
  if (cache) {
    headers.set("cache-control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
    headers.set("vercel-cdn-cache-control", "public, s-maxage=300, stale-while-revalidate=86400");
  }
  return headers;
}

function notFoundDocument(html, label = "Page") {
  const metadata = {
    title: `${label} Not Found | Hooman Finder`,
    description: "The requested Hooman Finder page could not be found.",
    canonicalUrl: "https://hoomanfinder.com/404",
    image: "https://hoomanfinder.com/home-hero-dogs.jpg",
    imageAlt: "Hooman Finder",
    noindex: true,
  };
  const snapshot = '<main data-not-found="true"><h1>Page not found</h1><p>This page does not exist or is no longer available.</p><p><a href="/dogs">Browse current adoptable dogs</a></p></main>';
  return injectRootSnapshot(injectDogMetadata(html, metadata), snapshot, 'data-server-rendered-not-found="true"');
}

async function fetchAppShell(request) {
  const shellUrl = new URL("/spa.html", request.url);
  return fetch(shellUrl, {
    headers: {
      "user-agent": request.headers.get("user-agent") || "Hooman-Finder-Metadata",
    },
  });
}

async function fetchRouteShell(request, pathname) {
  const routeUrl = new URL(`${pathname === "/" ? "/index" : pathname}.html`, request.url);
  const response = await fetch(routeUrl, {
    headers: { "user-agent": request.headers.get("user-agent") || "Hooman-Finder-Metadata" },
  });
  return response.ok ? response : fetchAppShell(request);
}

export default async function middleware(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;

  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname.length > 1 && pathname.endsWith("/")) {
    url.pathname = pathname.replace(/\/+$/, "");
    return Response.redirect(url, 308);
  }

  const legacyDogMatch = pathname.match(/^\/dogs\/([^/]+)$/);
  if (legacyDogMatch) {
    url.pathname = `/dog/${legacyDogMatch[1]}`;
    return Response.redirect(url, 308);
  }

  if (NOINDEX_APP_PATHS.has(pathname) || (pathname === "/quiz" && url.searchParams.has("session"))) {
    const shellResponse = pathname === "/quiz"
      ? await fetchRouteShell(request, "/quiz")
      : await fetchAppShell(request);
    const html = await shellResponse.text();
    const noindexHtml = replaceTag(
      html,
      /<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/i,
      '<meta name="robots" content="noindex, nofollow" />'
    );
    return new Response(request.method === "HEAD" ? null : noindexHtml, {
      status: 200,
      headers: responseHeaders(shellResponse),
    });
  }

  const shelterMatch = pathname.match(/^\/shelter\/([^/]+)$/);
  if (shelterMatch) {
    const shellResponse = await fetchAppShell(request);
    try {
      const id = decodeURIComponent(shelterMatch[1]);
      const shelter = await fetchShelter(id);
      if (!shelter) {
        const html = await shellResponse.text();
        return new Response(request.method === "HEAD" ? null : notFoundDocument(html, "Shelter"), {
          status: 404,
          headers: responseHeaders(shellResponse),
        });
      }
      const dogs = await fetchShelterDogs(id);
      const metadata = shelterMetadata(shelter);
      let html = injectDogMetadata(await shellResponse.text(), metadata);
      html = injectStructuredData(html, {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "CollectionPage",
            name: metadata.title,
            url: metadata.canonicalUrl,
            description: metadata.description,
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              ["Home", "/"],
              ["Dogs", "/dogs"],
              [metadata.name, `/shelter/${shelter.id}`],
            ].map(([name, path], index) => ({
              "@type": "ListItem",
              position: index + 1,
              name,
              item: `https://hoomanfinder.com${path}`,
            })),
          },
        ],
      });
      html = injectRootSnapshot(html, buildShelterSnapshotHtml(shelter, dogs), 'data-server-rendered-shelter="true"');
      return new Response(request.method === "HEAD" ? null : html, {
        status: 200,
        headers: responseHeaders(shellResponse, true),
      });
    } catch (error) {
      console.error("Could not render shelter metadata.", error);
      return shellResponse;
    }
  }

  const match = pathname.match(/^\/dog\/([^/]+)$/);
  if (!match) {
    if (INDEXABLE_STATIC_PATHS.has(pathname)) return undefined;
    const shellResponse = await fetchAppShell(request);
    const html = await shellResponse.text();
    return new Response(request.method === "HEAD" ? null : notFoundDocument(html), {
      status: 404,
      headers: responseHeaders(shellResponse),
    });
  }

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
    if (!dog) {
      const html = await shellResponse.text();
      return new Response(request.method === "HEAD" ? null : notFoundDocument(html, "Dog"), {
        status: 404,
        headers: responseHeaders(shellResponse),
      });
    }

    const html = await shellResponse.text();
    const metadata = buildDogMetadata(dog, id);
    const headers = responseHeaders(shellResponse, true);

    return new Response(request.method === "HEAD" ? null : injectDogDocument(html, dog, metadata), {
      status: shellResponse.status,
      headers,
    });
  } catch (error) {
    console.error("Could not render dog metadata.", error);
    return shellResponse;
  }
}
