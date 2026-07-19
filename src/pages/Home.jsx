// src/pages/Home.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import TrustRibbon from "../components/TrustRibbon";
import { getDogSourceLocation, getDogSourceName } from "../lib/dogSource";
import { filterPublicDogs } from "../lib/dogVisibility";
import { normalizeImageUrl } from "../lib/urlSafety";
import { formatAge, resolveAgeYears } from "../utils/formatAge";
import { decodeHtmlEntities } from "../utils/decodeHtmlEntities";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const HOW_IT_WORKS = [
  {
    number: "01",
    title: "Tell us about your life",
    text: "Answer a short quiz about your home, routine, and preferences.",
  },
  {
    number: "02",
    title: "See lifestyle-based matches",
    text: "We compare your answers with available details on adoptable dogs.",
  },
  {
    number: "03",
    title: "Continue with the source",
    text: "Save a shortlist, then continue directly with the listing shelter or rescue.",
  },
];

const WHY_FIT_MATTERS = [
  {
    label: "Look deeper",
    headline: "Beyond breed and looks",
    text: "Energy, routine, home setup, and care needs can shape daily life with a dog just as much as appearance.",
  },
  {
    label: "Start informed",
    headline: "A more useful shortlist",
    text: "Quiz answers help surface dogs whose available profiles align more closely with the life you described.",
  },
  {
    label: "Keep it human",
    headline: "Guidance, not a guarantee",
    text: "A score is a starting point. Shelter or rescue counseling and time spent with a dog remain essential.",
  },
];

const fallbackDogImages = [
  "/home-hero-dogs.jpg",
  "/home-cta-dog.jpg",
  "/home-hero-dogs.jpg",
];

function dateSeed(date = new Date()) {
  const key = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

  return key.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function seededValue(input) {
  const text = String(input || "");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function dogProfilePath(dog) {
  return dog?.id ? `/dog/${dog.id}` : "/dogs";
}

function previewDogAge(dog) {
  const formatted = formatAge(resolveAgeYears(dog?.age_years, dog?.age_text));
  if (formatted && formatted !== "Unknown") return formatted;
  return dog?.age_text || "";
}

function previewDogLocation(dog) {
  const location = getDogSourceLocation(dog, "");
  return location && location !== "Location unknown" ? location : "";
}

function previewDogImage(rawUrl) {
  const image = normalizeImageUrl(rawUrl, { allowRelative: false });
  if (!image) return "";

  try {
    const url = new URL(image);
    if (url.hostname === "cdn.rescuegroups.org") {
      url.searchParams.set("width", "500");
      return url.toString();
    }
  } catch {
    return image;
  }

  return image;
}

async function fetchHomepageDogs({ select, limit, requirePhoto = false }) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase configuration");
  }

  const endpoint = new URL(`${SUPABASE_URL}/rest/v1/dogs`);
  endpoint.searchParams.set("select", select.replace(/\s+/g, ""));
  endpoint.searchParams.set("adoptable", "eq.true");
  endpoint.searchParams.set(
    "or",
    "(adoption_pending.is.null,adoption_pending.eq.false)"
  );
  endpoint.searchParams.set(
    "availability_status",
    "in.(available,active,unknown)"
  );
  endpoint.searchParams.set("limit", String(limit));

  if (requirePhoto) {
    endpoint.searchParams.set("photo_url", "not.is.null");
    endpoint.searchParams.set("order", "created_at.desc");
  }

  const response = await fetch(endpoint, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Dog request failed with status ${response.status}`);
  }

  return response.json();
}

// Rescue bios are often imported as "<name> <intake id> <weight> lb.
// <sex>, approx <age> -<the actual personality text>". When that shelter
// boilerplate is detectable up front, skip to the part a person would
// actually want to read; otherwise fall back to the full text untouched.
function skipIntakeBoilerplate(text) {
  const dashIndex = text.indexOf(" -");
  if (dashIndex < 0 || dashIndex > 140) return text;

  const prefix = text.slice(0, dashIndex).toLowerCase();
  const looksLikeIntakeBoilerplate = /(lb\.|approx|neutered|spayed)/.test(prefix);
  const remainder = text.slice(dashIndex + 2).trim();

  return looksLikeIntakeBoilerplate && remainder ? remainder : text;
}

// Uses the dog's own listing text (never an AI-generated claim) for a short
// personality line, same source priority DogCard.jsx already treats as
// confirmed listing content.
function previewDogTagline(dog) {
  const raw = dog?.description || dog?.bio || dog?.placement_note || dog?.notes || "";
  const decoded = decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();
  const clean = skipIntakeBoilerplate(decoded);

  if (!clean) return "";
  return clean.length > 78 ? `${clean.slice(0, 75)}...` : clean;
}

function rotatedPick(dogs, seed, usedIds = new Set()) {
  const available = dogs.filter((dog) => !usedIds.has(String(dog?.id)));
  const pool = available.length ? available : dogs;

  if (!pool.length) return null;

  return pool[seed % pool.length];
}

function dailyShuffleDogs(dogs) {
  const today = new Date();
  const dateKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  return [...dogs].sort((a, b) => {
    const aValue = seededValue(`${dateKey}:${a?.id || a?.name || ""}`);
    const bValue = seededValue(`${dateKey}:${b?.id || b?.name || ""}`);
    return aValue - bValue;
  });
}

function pickDailyFeaturedDogs(dogs, count = 6) {
  const pool = dailyShuffleDogs(Array.isArray(dogs) ? dogs.filter((dog) => dog?.id) : []);
  const urgentPool = pool.filter((dog) =>
    ["Critical", "High", "Urgent"].includes(dog?.urgency_level)
  );
  const seed = dateSeed();
  const usedIds = new Set();
  const picks = [];

  const first = rotatedPick(pool, seed, usedIds);
  if (first?.id) {
    usedIds.add(String(first.id));
    picks.push(first);
  }

  const availableUrgentDogs = urgentPool.filter((dog) => !usedIds.has(String(dog?.id)));
  const second = rotatedPick(
    availableUrgentDogs.length ? availableUrgentDogs : pool,
    seed + 1,
    usedIds
  );
  if (second?.id) {
    usedIds.add(String(second.id));
    picks.push(second);
  }

  for (let index = 2; picks.length < count && index < count + 3; index += 1) {
    const next = rotatedPick(pool, seed + index, usedIds);
    if (!next?.id || usedIds.has(String(next.id))) continue;

    usedIds.add(String(next.id));
    picks.push(next);
  }

  return picks;
}

function distinctShelterCount(dogs) {
  const names = new Set();

  for (const dog of Array.isArray(dogs) ? dogs : []) {
    const name = getDogSourceName(dog, "");
    if (name) names.add(name.toLowerCase());
  }

  return names.size;
}

export default function Home() {
  const [featuredDogs, setFeaturedDogs] = useState([]);
  const [dogLoadFailed, setDogLoadFailed] = useState(false);
  const [shelterCount, setShelterCount] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadFeaturedDogs() {
      try {
        const data = await fetchHomepageDogs({
          select: `
            *,
            shelters (
              id,
              name,
              city,
              state,
              website,
              apply_url,
              logo_url
            )
          `,
          limit: 48,
          requirePhoto: true,
        });

        const urgencyRank = {
          Critical: 1,
          High: 2,
          Urgent: 2,
          Standard: 3,
          Adopted: 99,
        };

        const sortedDogs = filterPublicDogs(data)
          .filter((dog) => dog?.photo_url)
          .sort((a, b) => {
            const aRank = urgencyRank[a?.urgency_level] || 50;
            const bRank = urgencyRank[b?.urgency_level] || 50;

            if (aRank !== bRank) return aRank - bRank;

            return new Date(b?.created_at || 0) - new Date(a?.created_at || 0);
          });

        if (isMounted) {
          setFeaturedDogs(pickDailyFeaturedDogs(sortedDogs));
          setDogLoadFailed(false);
        }
      } catch (error) {
        console.error("Could not load homepage dogs:", error);

        if (isMounted) {
          setFeaturedDogs([]);
          setDogLoadFailed(true);
        }
      }
    }

    loadFeaturedDogs();

    return () => {
      isMounted = false;
    };
  }, []);

  // Separate, deferred query (few columns, no image or biography data)
  // so the trust-bar stat reflects every currently public listing rather
  // than just the 48 dogs sampled above for the homepage preview cards.
  useEffect(() => {
    let isMounted = true;
    let timeoutId;

    async function loadShelterCount() {
      try {
        const data = await fetchHomepageDogs({
          select: `
            id,
            shelter_name,
            rescuegroups_id,
            rescuegroups_org_id,
            source,
            external_id,
            adoptable,
            adoption_pending,
            urgency_level,
            availability_status,
            source_url,
            adoption_url,
            shelters ( name )
          `,
          limit: 4000,
        });
        if (!isMounted) return;

        setShelterCount(distinctShelterCount(filterPublicDogs(data)));
      } catch (error) {
        console.error("Could not load shelter count:", error);
      }
    }

    // The count is useful context but is not needed for the first paint.
    // Let the hero, navigation, fonts, and primary dog query finish first.
    timeoutId = window.setTimeout(loadShelterCount, 3000);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  // Up to 6 real, currently available dogs for the "Meet some dogs" preview.
  // featuredDogs is already filtered to public/adoptable dogs with photos and
  // daily-rotated, so this just caps the count without touching that logic.
  // Extra display-time guard for this homepage feature specifically: some
  // shelter feeds put status text directly in the dog's name field (e.g.
  // "Bette - Adoption Pending") rather than the structured adoption_pending
  // column the shared visibility filter checks. Never surface that on the
  // homepage, even if it technically passed the structured-field filter.
  const previewDogs = useMemo(
    () =>
      featuredDogs
        .filter((dog) => dog?.id && !/adopt(ed|ion pending)|pending/i.test(dog?.name || ""))
        .slice(0, 3),
    [featuredDogs]
  );

  return (
    <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#183D35]">
      <SEO
        title="Free Dog Adoption Matching Tool | Hooman Finder"
        description="Discover real adoptable shelter and rescue dogs based on lifestyle fit, not just breed or looks. Hooman Finder is free to use, with no account required."
        canonicalPath="/"
        ogImage="/home-hero-adopter-dog-hd.jpg"
        ogImageAlt="A woman sharing a warm moment with a rescue dog"
      />

      <header className="border-b border-[#C7D4BB]/70 bg-white shadow-[0_4px_18px_rgba(24,61,53,0.04)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-1 sm:px-6 sm:py-3 lg:px-8">
          <Link to="/" aria-label="Go to Hooman Finder homepage" className="flex items-center">
            <span className="flex h-14 w-[76px] shrink-0 items-center justify-center sm:h-16 sm:w-[82px]">
              <img
                src="/logo-180.png"
                alt="Hooman Finder"
                width="180"
                height="163"
                decoding="async"
                className="h-full w-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            </span>
          </Link>

          <nav className="flex items-center gap-5 text-[13px] font-semibold text-[#183D35]">
            <Link to="/about" className="hidden hover:text-[#183D35] sm:inline">
              About
            </Link>
            <Link to="/saved" className="hidden hover:text-[#183D35] sm:inline">
              Saved
            </Link>
            <Link
              to="/quiz"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#183D35] px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#F3C982] transition hover:bg-[#12332C] sm:px-4"
            >
              Take the Quiz
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="px-4 pt-3 sm:px-6 sm:pt-8 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="relative min-h-[380px] overflow-hidden rounded-[2rem] rounded-tr-[4.5rem] border border-[#183D35]/10 bg-[#183D35] shadow-[0_22px_60px_rgba(24,61,53,0.16)] sm:min-h-[560px] sm:rounded-[2.5rem] sm:rounded-tr-[6rem] lg:min-h-[500px]">
              <div className="absolute inset-x-0 top-0 lg:inset-0">
                <picture>
                  <source
                    media="(max-width: 767px)"
                    srcSet="/home-hero-adopter-dog-768.jpg"
                    type="image/jpeg"
                  />
                  <source srcSet="/home-hero-adopter-dog.avif" type="image/avif" />
                  <img
                    src="/home-hero-adopter-dog-hd.jpg"
                    alt="A woman gently holding paws with a rescue dog"
                    width="1537"
                    height="1023"
                    fetchPriority="high"
                    decoding="async"
                    className="h-auto w-full [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_62%,rgba(0,0,0,0.92)_70%,rgba(0,0,0,0.52)_84%,transparent_100%)] [mask-image:linear-gradient(to_bottom,#000_0%,#000_62%,rgba(0,0,0,0.92)_70%,rgba(0,0,0,0.52)_84%,transparent_100%)] lg:h-full lg:object-cover lg:object-[45%_48%] lg:[-webkit-mask-image:none] lg:[mask-image:none]"
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                  />
                </picture>
              </div>
              <div className="absolute inset-0 bg-[#183D35]/5 lg:bg-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-[82%] bg-gradient-to-t from-[#183D35] via-[#183D35]/72 to-transparent lg:hidden" />
              <div className="absolute inset-0 hidden bg-[linear-gradient(270deg,rgba(24,61,53,0.97)_0%,rgba(24,61,53,0.88)_34%,rgba(24,61,53,0.42)_58%,rgba(24,61,53,0.08)_76%,transparent_90%)] lg:block" />
              <div className="absolute inset-x-0 bottom-0 hidden h-28 bg-gradient-to-t from-[#102D27]/55 to-transparent lg:block" />

              <div className="relative flex min-h-[380px] flex-col justify-end px-4 pb-3 pt-2 sm:min-h-[560px] sm:px-8 sm:pb-8 lg:min-h-[500px] lg:px-12 lg:py-12">
                <div className="lg:ml-auto lg:w-[43%] lg:min-w-[31rem] lg:max-w-[38rem]">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#FFD98A] [text-shadow:0_1px_4px_rgba(0,0,0,0.95)] sm:text-xs sm:tracking-[0.24em]">
                    Free dog adoption matching tool
                  </p>
                  <h1 className="mt-1 max-w-xl font-['Fraunces',serif] text-[1.55rem] font-semibold leading-[1.06] text-[#F5F1E9] [text-shadow:0_2px_10px_rgba(0,0,0,0.85)] sm:mt-2 sm:text-[2.3rem] lg:max-w-[38rem] lg:text-[2.75rem] lg:leading-[1.04]">
                    Find adoptable dogs that fit{" "}
                    <br className="hidden sm:block lg:hidden" />
                    your real life.
                  </h1>
                  <p className="mt-1.5 max-w-md text-[12px] leading-snug text-[#F5F1E9]/90 [text-shadow:0_1px_5px_rgba(0,0,0,0.9)] sm:mt-3 sm:text-[14.5px] sm:leading-relaxed lg:max-w-[31rem] lg:text-base">
                    Discover real shelter and rescue dogs based on lifestyle fit, not just breed or looks.
                  </p>
                  <div className="mt-2.5 flex flex-row gap-2 sm:mt-4 sm:gap-3 lg:mt-4">
                    <Link
                      to="/quiz"
                      className="inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-2xl bg-[#F3C982] px-3 text-sm font-bold text-[#183D35] shadow-sm transition hover:bg-[#E9BD70] sm:min-h-[2.85rem] sm:flex-initial sm:px-7"
                    >
                      Take the Quiz
                    </Link>
                    <Link
                      to="/dogs"
                      className="inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-2xl border border-[#F5F1E9]/35 bg-white/10 px-3 text-sm font-bold text-[#F5F1E9] backdrop-blur-sm transition hover:bg-white/20 sm:min-h-[2.85rem] sm:flex-initial sm:px-7"
                    >
                      Browse Dogs
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <TrustRibbon
          stat={
            shelterCount > 0
              ? {
                  value: shelterCount,
                  label:
                    shelterCount === 1
                      ? "shelter or rescue in current listings"
                      : "shelters and rescues in current listings",
                }
              : null
          }
        />

        <section
          id="how-it-works"
          className="scroll-mt-4 px-4 pb-8 pt-3 sm:px-6 sm:py-10 lg:px-8 lg:py-12"
        >
          <div className="mx-auto max-w-6xl">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#6F6A66]">
              How it works
            </p>
            <h2 className="mt-2 max-w-xl font-['Fraunces',serif] text-3xl font-semibold leading-tight text-[#183D35] sm:text-4xl">
              Three steps to a more informed shortlist.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#6F6A66] sm:text-base">
              Matches guide your search. Shelters and rescues still manage counseling, applications, and final decisions.
            </p>

            <div className="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-5">
              {HOW_IT_WORKS.map((row) => (
                <div key={row.number} className="flex gap-4 sm:flex-col sm:gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#183D35] font-['Fraunces',serif] text-sm font-semibold text-[#F3C982]">
                    {row.number}
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#183D35]">{row.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#6F6A66]">{row.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-3 sm:py-6">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#6F6A66]">
                  Available now
                </p>
                <h2 className="mt-2 font-['Fraunces',serif] text-2xl font-semibold text-[#183D35] sm:text-3xl">
                  Meet some dogs looking for their human.
                </h2>
              </div>
              {previewDogs.length > 0 ? (
                <Link
                  to="/dogs"
                  className="hidden shrink-0 text-sm font-bold text-[#183D35] underline-offset-4 hover:underline sm:inline"
                >
                  Browse all dogs
                </Link>
              ) : null}
            </div>

            {previewDogs.length > 0 ? (
              <>
                <div className="mt-4 flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible">
                  {previewDogs.map((dog) => {
                    const image =
                      previewDogImage(dog?.photo_url) || fallbackDogImages[0];
                    const age = previewDogAge(dog);
                    const location = previewDogLocation(dog);
                    const tagline = previewDogTagline(dog);
                    const metaLine = [age, location].filter(Boolean).join(" · ");

                    return (
                      <Link
                        key={dog.id}
                        to={dogProfilePath(dog)}
                        className="w-48 shrink-0 overflow-hidden rounded-2xl border border-[#C7D4BB] bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg sm:w-auto"
                      >
                        <div className="h-28 w-full bg-[#EFE8DC] sm:h-48">
                          <img
                            src={image}
                            alt={`${dog.name}, an adoptable dog`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            fetchPriority="low"
                            decoding="async"
                            onError={(event) => {
                              event.currentTarget.onerror = null;
                              event.currentTarget.src = fallbackDogImages[0];
                            }}
                          />
                        </div>
                        <div className="p-3 sm:p-4">
                          <p className="line-clamp-2 font-['Fraunces',serif] text-base font-semibold leading-tight text-[#183D35] sm:line-clamp-1 sm:text-xl">
                            {dog.name}
                          </p>
                          {metaLine ? (
                            <p className="mt-0.5 truncate text-[11px] text-[#6F6A66] sm:text-xs">
                              {metaLine}
                            </p>
                          ) : null}
                          {tagline ? (
                            <p className="mt-1.5 hidden line-clamp-2 text-xs leading-5 text-[#6F6A66] sm:block">
                              {tagline}
                            </p>
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                </div>

                <Link
                  to="/dogs"
                  className="mt-2 inline-flex text-sm font-bold text-[#183D35] underline-offset-4 hover:underline sm:hidden"
                >
                  Browse all dogs
                </Link>

                <div className="mt-6 flex justify-center sm:mt-8">
                  <Link
                    to="/quiz"
                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#183D35] px-7 text-sm font-bold text-[#F3C982] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-[#12332C]"
                  >
                    Take the quiz to find your match
                  </Link>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-[#C7D4BB] bg-white p-6 text-center sm:p-8">
                <p className="text-sm leading-6 text-[#6F6A66]">
                  {dogLoadFailed
                    ? "We could not load dogs right now. Please try again in a moment."
                    : "New adoptable dogs are added regularly. Check back soon, or browse the full list."}
                </p>
                <Link
                  to="/dogs"
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-[#183D35] px-6 text-sm font-bold text-[#183D35] transition hover:bg-[#183D35] hover:text-white"
                >
                  Browse Dogs
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="bg-[#EFE8DC] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#5F5A56]">
              Why matching matters
            </p>
            <h2 className="mt-2 max-w-lg font-['Fraunces',serif] text-3xl font-semibold leading-tight text-[#183D35] sm:text-4xl">
              Better fit starts with better questions.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5F5A56] sm:text-base">
              Choosing a dog is about more than a photo. A thoughtful starting point can help you focus your search and prepare better questions for the shelter or rescue.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              {WHY_FIT_MATTERS.map((item) => (
                <article
                  key={item.label}
                  className="rounded-2xl border border-[#C7D4BB] bg-white/85 p-5 shadow-[0_10px_30px_rgba(15,39,66,0.06)] sm:p-6"
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7A5428]">
                    {item.label}
                  </p>
                  <h3 className="mt-4 font-['Fraunces',serif] text-xl font-semibold leading-tight text-[#183D35]">
                    {item.headline}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#6F6A66]">{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
            <article className="rounded-[1.75rem] border border-[#C7D4BB] bg-white p-6 sm:p-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6F6A66]">
                For shelters and rescues
              </p>
              <h2 className="mt-3 font-['Fraunces',serif] text-2xl font-semibold leading-tight text-[#183D35] sm:text-3xl">
                Help adopters start with fit.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-[#6F6A66] sm:text-base">
                Hooman Finder helps people discover listed dogs, then sends interested adopters to the shelter or rescue to ask questions and continue its application process.
              </p>
              <Link
                to="/shelters/join"
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-[#183D35] px-6 text-sm font-bold text-[#183D35] transition hover:bg-[#183D35] hover:text-white"
              >
                Shelter or rescue inquiries
              </Link>
            </article>

            <article className="rounded-[1.75rem] bg-[#183D35] p-6 text-white sm:p-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
                Our mission
              </p>
              <h2 className="mt-3 font-['Fraunces',serif] text-2xl font-semibold leading-tight sm:text-3xl">
                Make the search feel more thoughtful.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/72 sm:text-base">
                Hooman Finder was created to help adopters look beyond breed and appearance, understand lifestyle fit, and arrive at shelter conversations with a more informed shortlist.
              </p>
              <Link
                to="/about"
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-white/45 px-6 text-sm font-bold text-white transition hover:border-white hover:bg-white hover:text-[#183D35]"
              >
                About Hooman Finder
              </Link>
            </article>
          </div>
        </section>

        <section className="px-4 pb-10 sm:px-6 sm:pb-16 lg:px-8">
          <div className="mx-auto max-w-6xl rounded-[1.75rem] bg-[#183D35] p-8 text-center sm:p-12">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/55">
              Start here
            </p>
            <h2 className="mt-4 font-['Fraunces',serif] text-3xl font-semibold leading-tight text-[#F5F1E9] sm:text-4xl">
              Not sure where to start?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-white/70 sm:text-base">
              Take the lifestyle quiz to see guided matches. Match scores are guidance, not guarantees, and the shelter or rescue always manages the adoption process.
            </p>
            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                to="/quiz"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#F3C982] px-7 text-sm font-bold text-[#12332C] transition hover:bg-white"
              >
                Take the Quiz
              </Link>
              <Link
                to="/dogs"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/55 px-7 text-sm font-bold text-white transition hover:border-white hover:bg-white hover:text-[#183D35]"
              >
                Browse Dogs
              </Link>
            </div>
            <p className="mx-auto mt-6 max-w-lg text-xs leading-5 text-white/55">
              Hooman Finder does not replace adoption counseling, applications, meet and greets, or final decisions made by shelters and rescues.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#C7D4BB]/60 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div>
              <Link to="/" aria-label="Hooman Finder home" className="inline-flex">
                <img
                  src="/logo-180.png"
                  alt="Hooman Finder"
                  width="180"
                  height="163"
                  loading="lazy"
                  decoding="async"
                  className="h-9 w-auto"
                />
              </Link>
              <p className="mt-4 max-w-md text-sm leading-6 text-[#6F6A66]">
                A free tool helping people discover adoptable dogs through lifestyle fit, then continue directly with the shelter or rescue.
              </p>
            </div>

            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm font-medium text-[#6F6A66] sm:grid-cols-3">
              <Link to="/about" className="hover:text-[#183D35]">About</Link>
              <Link to="/contact" className="hover:text-[#183D35]">Contact</Link>
              <a href="mailto:info@hoomanfinder.com" className="hover:text-[#183D35]">Email us</a>
              <Link to="/privacy" className="hover:text-[#183D35]">Privacy</Link>
              <Link to="/terms" className="hover:text-[#183D35]">Terms &amp; disclaimer</Link>
              <Link to="/shelters/join" className="hover:text-[#183D35]">For shelters &amp; rescues</Link>
            </nav>
          </div>

          <div className="mt-6 border-t border-[#C7D4BB]/60 pt-4 text-xs leading-5 text-[#6F6A66]">
            © {new Date().getFullYear()} Hooman Finder. Adoption availability, requirements, and dog details should be confirmed directly with the listing shelter or rescue.
          </div>
        </div>
      </footer>
    </div>
  );
}
