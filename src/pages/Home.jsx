// src/pages/Home.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import { getDogSourceName } from "../lib/dogSource";
import { filterPublicDogs } from "../lib/dogVisibility";
import { supabase } from "../lib/supabase";
import { normalizeImageUrl } from "../lib/urlSafety";

const HOW_IT_WORKS = [
  {
    number: "01",
    title: "Tell us about your home",
    text: "Answer a short quiz about your routine, household, activity level, and what would make adoption feel realistic.",
  },
  {
    number: "02",
    title: "We compare dogs by lifestyle fit",
    text: "Hooman Finder ranks adoptable dogs against your answers using the details currently available from rescues and shelters.",
  },
  {
    number: "03",
    title: "Save matches and adopt with more confidence",
    text: "Build a shortlist, read each dog’s profile, then confirm the important details directly with the rescue before applying.",
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

function urgencyClass(level) {
  switch (level) {
    case "Critical":
      return "bg-red-600 text-white";
    case "High":
    case "Urgent":
      return "bg-orange-500 text-white";
    default:
      return "bg-white/90 text-stone-950";
  }
}

function dogProfilePath(dog) {
  return dog?.id ? `/dog/${dog.id}` : "/dogs";
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

function pickDailyFeaturedDogs(dogs) {
  const pool = dailyShuffleDogs(Array.isArray(dogs) ? dogs.filter((dog) => dog?.id) : []);
  const urgentPool = pool.filter((dog) =>
    ["Critical", "High", "Urgent"].includes(dog?.urgency_level)
  );
  const seed = dateSeed();
  const usedIds = new Set();

  const first = rotatedPick(pool, seed, usedIds);
  if (first?.id) usedIds.add(String(first.id));

  const availableUrgentDogs = urgentPool.filter((dog) => !usedIds.has(String(dog?.id)));
  const second = rotatedPick(
    availableUrgentDogs.length ? availableUrgentDogs : pool,
    seed + 1,
    usedIds
  );
  if (second?.id) usedIds.add(String(second.id));

  const third = rotatedPick(pool, seed + 2, usedIds);

  return [first, second, third].filter(Boolean);
}

export default function Home() {
  const [featuredDogs, setFeaturedDogs] = useState([]);
  const [dogLoadFailed, setDogLoadFailed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadFeaturedDogs() {
      try {
        const { data, error } = await supabase
          .from("dogs")
          .select(`
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
          `)
          .eq("adoptable", true)
          .not("photo_url", "is", null)
          .or("adoption_pending.is.null,adoption_pending.eq.false")
          .in("availability_status", ["available", "active", "unknown"])
          .order("created_at", { ascending: false })
          .limit(48);

        if (error) throw error;

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

  const howItWorksRows = useMemo(() => {
    return HOW_IT_WORKS.map((row, index) => ({
      ...row,
      dog: featuredDogs[index] || null,
      image:
        normalizeImageUrl(featuredDogs[index]?.photo_url, { allowRelative: false }) ||
        fallbackDogImages[index],
      rescueName: featuredDogs[index] ? getDogSourceName(featuredDogs[index], "") : "",
    }));
  }, [featuredDogs]);

  return (
    <div className="min-h-screen bg-[#f5f1e9] text-stone-950">
      <SEO
        title="Hooman Finder | Dog Adoption Matching Quiz"
        description="Find adoptable dogs that fit your lifestyle with a smarter dog adoption matching quiz built to help reduce mismatches and returns."
        canonicalPath="/"
        ogImage="/home-hero-dogs.jpg"
        ogImageAlt="Rescue dogs looking for their future home"
      />
      <header className="absolute left-0 right-0 top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            aria-label="Go to Hooman Finder homepage"
            className="inline-flex h-12 w-16 items-center justify-center rounded-2xl bg-white/88 p-1.5 shadow-sm ring-1 ring-white/45 backdrop-blur-sm sm:h-14 sm:w-20"
          >
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-full w-full object-contain"
            />
          </Link>

          <nav className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
            <Link to="/about" className="hidden hover:text-white/75 sm:inline">
              About
            </Link>

            <Link to="/saved" className="hidden hover:text-white/75 sm:inline">
              Saved
            </Link>

            <Link
              to="/quiz"
              className="rounded-full bg-stone-950 px-5 py-2.5 font-black tracking-[0.18em] text-white shadow-sm ring-1 ring-white/25 transition hover:bg-white hover:text-stone-950"
            >
              Quiz
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative min-h-[82vh] overflow-hidden bg-stone-950 text-white sm:min-h-[90vh]">
          {/* Blurred fill layer so mobile does not look empty when the full image is shown */}
          <img
            src="/home-hero-dogs.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover object-center blur-sm"
          />

          {/* Main hero photo: contain on mobile so both dog faces are visible */}
          <img
            src="/home-hero-dogs.jpg"
            alt="Rescue dogs looking for their future home"
            className="absolute inset-0 h-full w-full object-contain object-center sm:object-cover sm:object-[50%_35%] lg:object-center"
          />

          {/* Lighter overlays so dog faces stay visible on low brightness */}
          <div className="absolute inset-0 bg-stone-950/34 sm:bg-stone-950/50" />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/82 via-stone-950/24 to-stone-950/06 sm:from-stone-950/88 sm:via-stone-950/34 sm:to-stone-950/18" />
          <div className="absolute inset-0 bg-gradient-to-r from-stone-950/28 via-stone-950/08 to-stone-950/18 sm:from-stone-950/55 sm:via-stone-950/18 sm:to-transparent" />

          <div className="relative z-10 flex min-h-[82vh] items-end sm:min-h-[90vh]">
            <div className="mx-auto w-full max-w-7xl px-4 pb-6 pt-24 sm:px-6 sm:pb-14 lg:px-8">
              <div className="max-w-3xl">
                <p className="text-[11px] font-black uppercase tracking-[0.32em] text-white/76">
                  Guided dog adoption matching
                </p>

                <h1 className="mt-4 max-w-3xl text-[2.95rem] font-black leading-[0.92] text-white sm:text-7xl lg:text-8xl">
                  Find adoptable dogs that actually fit your life.
                </h1>

                <p className="mt-5 max-w-xl text-base font-semibold leading-7 text-white/84 sm:text-lg">
                  Compare real rescue dogs by home, routine, energy, and care fit, then confirm the final details with the shelter or rescue.
                </p>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Link
                    to="/quiz"
                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-white bg-white px-7 py-3 text-sm font-black text-stone-950 transition hover:bg-transparent hover:text-white"
                  >
                    Take the Matching Quiz
                  </Link>

                  <Link
                    to="/dogs"
                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/60 bg-black/18 px-7 py-3 text-sm font-black text-white backdrop-blur-sm transition hover:border-white hover:bg-white hover:text-stone-950"
                  >
                    Browse Dogs
                  </Link>
                </div>
              </div>

              <div className="mt-6 border-t border-white/24 pt-4 sm:mt-8">
                <p className="max-w-2xl text-xs font-semibold leading-6 text-white/68 sm:text-sm">
                  Hooman Finder helps you compare lifestyle fit. Adoption availability, requirements, and behavior details should always be confirmed with the rescue or shelter.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#f5f1e9] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="border-b border-stone-950/20 pb-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-500 sm:text-[11px]">
                How it works
              </p>

              <h2 className="mt-3 max-w-2xl text-4xl font-black leading-none text-stone-950 sm:text-6xl">
                Three simple steps to a better shortlist.
              </h2>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-stone-600 sm:text-base">
                Hooman Finder helps adopters compare dogs by lifestyle fit without turning adoption into a guessing game.
              </p>
            </div>

            <div className="divide-y divide-stone-950/15">
              {howItWorksRows.map((row, index) => (
                <article
                  key={row.number}
                  className={[
                    "grid gap-5 py-6 sm:grid-cols-[88px_minmax(0,1fr)_minmax(260px,420px)] sm:items-center sm:gap-7 sm:py-8 lg:grid-cols-[110px_minmax(0,1fr)_minmax(360px,520px)] lg:gap-10",
                    index % 2 === 1 ? "lg:[&_.home-step-image]:order-2" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-4 sm:block">
                    <p className="text-[12px] font-bold uppercase tracking-[0.26em] text-stone-400">
                      {row.number}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <h3 className="max-w-xl text-3xl font-black leading-none text-stone-950 sm:text-4xl lg:text-5xl">
                      {row.title}
                    </h3>

                    <p className="mt-3 max-w-xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
                      {row.text}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {row.dog?.name ? (
                        <p className="rounded-full bg-white/65 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 ring-1 ring-stone-950/8">
                          Featuring {row.dog.name}
                        </p>
                      ) : (
                        <p className="rounded-full bg-white/65 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 ring-1 ring-stone-950/8">
                          Featuring adoptable dogs
                        </p>
                      )}

                      {row.dog?.urgency_level && row.dog.urgency_level !== "Standard" ? (
                        <p
                          className={[
                            "rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em]",
                            urgencyClass(row.dog.urgency_level),
                          ].join(" ")}
                        >
                          {row.dog.urgency_level}
                        </p>
                      ) : null}

                      {row.rescueName ? (
                        <p className="rounded-full bg-white/65 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 ring-1 ring-stone-950/8">
                          {row.rescueName}
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-5">
                      <Link
                        to={index === 0 ? "/quiz" : dogProfilePath(row.dog)}
                        className="inline-flex items-center justify-center rounded-full bg-stone-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-stone-800"
                      >
                        {index === 0 ? "Take the quiz" : row.dog?.id ? "View profile" : "Browse dogs"} →
                      </Link>
                    </div>
                  </div>

                  <Link
                    to={dogProfilePath(row.dog)}
                    className="home-step-image group relative overflow-hidden rounded-[1.85rem] border border-stone-950/10 bg-white/60 p-2 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-lg"
                    aria-label={
                      row.dog?.name
                        ? `View ${row.dog.name}'s profile`
                        : "View adoptable dogs"
                    }
                  >
                    <div className="relative overflow-hidden rounded-[1.15rem] bg-[#e8e1d5]">
                      <div className="flex aspect-[4/3] items-center justify-center sm:aspect-[5/4] lg:aspect-[4/3]">
                        <img
                          src={row.image}
                          alt={
                            row.dog?.name
                              ? `${row.dog.name}, an adoptable dog`
                              : "Adoptable dog"
                          }
                          className="h-full w-full object-contain transition duration-500 group-hover:scale-[1.025]"
                        />
                      </div>

                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-950/65 via-stone-950/12 to-transparent p-4">
                        <div className="flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                              Hooman Finder
                            </p>

                            <p className="mt-1 truncate text-2xl font-black leading-none text-white drop-shadow-sm">
                              {row.dog?.name || "View dogs"}
                            </p>

                            {row.rescueName ? (
                              <p className="mt-1 truncate text-xs font-bold uppercase tracking-[0.14em] text-white/78">
                                {row.rescueName}
                              </p>
                            ) : null}
                          </div>

                          <div className="hidden rounded-full bg-white/90 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-950 sm:block">
                            Profile
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </article>
              ))}
            </div>

            {dogLoadFailed && (
              <p className="border-t border-stone-950/15 pt-4 text-xs leading-6 text-stone-500">
                Live dog photos did not load, so this section is using homepage
                fallback images for now.
              </p>
            )}
          </div>
        </section>

        <section className="relative overflow-hidden bg-stone-950 text-white">
          <img
            src="/home-cta-dog.jpg"
            alt="Dog looking for the right match"
            className="absolute inset-0 h-full w-full object-cover"
          />

          <div className="absolute inset-0 bg-stone-950/65" />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/45 to-transparent" />

          <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/60">
                Start here
              </p>

              <h2 className="mt-4 text-5xl font-black leading-[0.9] text-white sm:text-7xl">
                Not sure where to start?
              </h2>

              <p className="mt-6 max-w-xl text-base leading-7 text-white/75 sm:text-lg">
                Take the lifestyle-based dog adoption quiz for guided matches, or browse dogs if you already know what you’re looking for.
              </p>

              <div className="mt-8">
                <Link
                  to="/quiz"
                  className="inline-flex items-center justify-center rounded-full border border-white bg-white px-7 py-3 text-sm font-black text-stone-950 transition hover:bg-transparent hover:text-white"
                >
                  Find my match →
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-950/10 bg-[#f5f1e9] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 sm:block">
            <img src="/logo.png" alt="Hooman Finder" className="h-8 w-auto sm:h-10" />

            <p className="text-xs text-stone-500 sm:mt-3">
              © 2026 Hooman Finder
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500 sm:text-xs">
            <Link to="/about" className="hover:text-stone-950">
              About
            </Link>
            <Link to="/shelters" className="hover:text-stone-950">
              For shelters
            </Link>
            <Link to="/contact" className="hover:text-stone-950">
              Contact
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
