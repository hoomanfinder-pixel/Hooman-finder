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
    title: "Tell us about your life",
    text: "Answer a short quiz about your home, routine, household, activity level, and care preferences.",
  },
  {
    number: "02",
    title: "See lifestyle-based matches",
    text: "We compare your answers with the available details on real, adoptable dogs from shelter and rescue sources.",
  },
  {
    number: "03",
    title: "Continue with the source",
    text: "Review profiles, save a shortlist, and contact the listed shelter or rescue to ask questions and continue the adoption process.",
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

const TRUST_POINTS = [
  ["Free to use", "No fees to explore matches"],
  ["No account required", "Start the quiz right away"],
  ["Real adoptable dogs", "From shelter and rescue sources"],
  ["Lifestyle-based", "More than breed or looks"],
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
        title="Free Dog Adoption Matching Tool | Hooman Finder"
        description="Discover real adoptable shelter and rescue dogs based on lifestyle fit—not just breed or looks. Hooman Finder is free to use, with no account required."
        canonicalPath="/"
        ogImage="/home-hero-dogs.jpg"
        ogImageAlt="Shelter and rescue dogs looking for their future home"
      />
      <header className="absolute left-0 right-0 top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            aria-label="Go to Hooman Finder homepage"
            className="inline-flex h-20 w-[88px] shrink-0 items-center justify-center rounded-[1.35rem] bg-white/92 shadow-[0_10px_35px_rgba(0,0,0,0.16)] ring-1 ring-white/70 backdrop-blur-md transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:h-[100px] sm:w-28 sm:rounded-[1.55rem]"
          >
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-16 w-16 object-contain object-center sm:h-[84px] sm:w-[84px]"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          </Link>

          <nav className="flex shrink-0 items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
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
              Take the Quiz
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative min-h-[590px] overflow-hidden bg-stone-950 text-white sm:min-h-[90vh]">
          <img
            src="/home-hero-dogs.jpg"
            alt="Two adoptable dogs sitting together"
            className="absolute inset-0 h-full w-full object-cover object-[58%_center] sm:object-[50%_35%] lg:object-center"
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
          />

          <div className="absolute inset-0 bg-stone-950/35 sm:bg-stone-950/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/95 via-stone-950/38 to-stone-950/10 sm:from-stone-950/90 sm:via-stone-950/28" />
          <div className="absolute inset-0 bg-gradient-to-r from-stone-950/35 via-stone-950/5 to-transparent sm:from-stone-950/55" />

          <div className="relative z-10 flex min-h-[590px] items-end sm:min-h-[90vh]">
            <div className="mx-auto w-full max-w-7xl px-4 pb-14 pt-[8.5rem] sm:px-6 sm:pb-20 sm:pt-28 lg:px-8">
              <div className="max-w-3xl">
                <p className="text-[11px] font-black uppercase tracking-[0.32em] text-white/76">
                  Free dog adoption matching tool
                </p>

                <h1 className="mt-3 max-w-3xl text-[2.55rem] font-black leading-[0.94] text-white sm:mt-4 sm:text-7xl lg:text-8xl">
                  Find adoptable dogs that fit your real life.
                </h1>

                <p className="mt-4 max-w-2xl text-[15px] font-semibold leading-6 text-white/85 sm:mt-5 sm:text-lg sm:leading-7">
                  Hooman Finder helps you discover real shelter and rescue dogs based on lifestyle fit—not just breed or looks.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:mt-7 sm:flex-row">
                  <Link
                    to="/quiz"
                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#f3c982] bg-[#f3c982] px-7 py-3 text-sm font-black text-stone-950 shadow-lg shadow-black/15 transition hover:border-white hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                  >
                    Take the Quiz
                  </Link>

                  <Link
                    to="/dogs"
                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/65 bg-black/20 px-7 py-3 text-sm font-black text-white backdrop-blur-sm transition hover:border-white hover:bg-white hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                  >
                    Browse Dogs
                  </Link>
                </div>
              </div>

            </div>
          </div>
        </section>

        <section aria-label="Why adopters can trust Hooman Finder" className="border-b border-stone-950/10 bg-[#fffaf2] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
              {TRUST_POINTS.map(([title, text]) => (
                <div key={title} className="border-l-2 border-[#d5ab70] pl-3 sm:pl-4">
                  <p className="text-sm font-black text-stone-950">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">{text}</p>
                </div>
              ))}
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
                Three steps to a more informed shortlist.
              </h2>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-stone-600 sm:text-base">
                Your answers guide the matches you see. They do not decide whether a dog is right for you or whether an adoption is approved.
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
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = fallbackDogImages[index];
                          }}
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

        <section className="bg-[#efe8dc] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:items-end">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-500 sm:text-[11px]">
                  Why matching matters
                </p>
                <h2 className="mt-2 max-w-xl text-3xl font-black leading-none text-stone-950 sm:text-5xl">
                  Better fit starts with better questions.
                </h2>
              </div>

              <p className="max-w-2xl text-sm font-semibold leading-6 text-stone-600 sm:text-base">
                Choosing a dog is about more than a photo. A thoughtful starting point can help you focus your search and prepare better questions for the shelter or rescue.
              </p>
            </div>

            <div className="mt-7 grid items-stretch gap-3 sm:grid-cols-3 sm:gap-4">
              {WHY_FIT_MATTERS.map((item) => (
                <article
                  key={item.label}
                  className="relative flex min-h-full overflow-hidden rounded-[1.7rem] border border-stone-950/10 bg-[#fffdf8]/85 p-5 shadow-[0_18px_50px_rgba(68,54,38,0.07)] ring-1 ring-white/60 sm:p-6"
                >
                  <div className="relative flex min-h-full w-full flex-col">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">
                      {item.label}
                    </p>
                    <h3 className="mt-8 max-w-[17rem] text-[1.75rem] font-black leading-none text-stone-950 sm:text-[2rem]">
                      {item.headline}
                    </h3>
                    <p className="mt-4 text-sm font-semibold leading-6 text-stone-600">
                      {item.text}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f5f1e9] px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
            <article className="rounded-[2rem] border border-stone-950/10 bg-white/65 p-6 sm:p-8">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-500">
                For shelters and rescues
              </p>
              <h2 className="mt-3 text-3xl font-black leading-none text-stone-950 sm:text-4xl">
                Help adopters start with fit.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-stone-600 sm:text-base sm:leading-7">
                Hooman Finder helps people discover listed dogs, then sends interested adopters to the shelter or rescue to ask questions and continue its application process.
              </p>
              <Link
                to="/shelters/join"
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-stone-950 px-6 py-3 text-sm font-black text-stone-950 transition hover:bg-stone-950 hover:text-white"
              >
                Shelter or rescue inquiries
              </Link>
            </article>

            <article className="rounded-[2rem] bg-stone-950 p-6 text-white sm:p-8">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/55">
                Our mission
              </p>
              <h2 className="mt-3 text-3xl font-black leading-none sm:text-4xl">
                Make the search feel more thoughtful.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/72 sm:text-base sm:leading-7">
                Hooman Finder was created to help adopters look beyond breed and appearance, understand lifestyle fit, and arrive at shelter conversations with a more informed shortlist.
              </p>
              <Link
                to="/about"
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-white/45 px-6 py-3 text-sm font-black text-white transition hover:border-white hover:bg-white hover:text-stone-950"
              >
                About Hooman Finder
              </Link>
            </article>
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
                Take the lifestyle quiz to see guided matches. Match scores are guidance, not guarantees, and the shelter or rescue always manages the adoption process.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/quiz"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#f3c982] bg-[#f3c982] px-7 py-3 text-sm font-black text-stone-950 transition hover:border-white hover:bg-white"
                >
                  Take the Quiz
                </Link>
                <Link
                  to="/dogs"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/60 px-7 py-3 text-sm font-black text-white transition hover:border-white hover:bg-white hover:text-stone-950"
                >
                  Browse Dogs
                </Link>
              </div>

              <p className="mt-6 max-w-2xl text-xs leading-5 text-white/60">
                Hooman Finder does not replace adoption counseling, applications, meet-and-greets, or final decisions made by shelters and rescues.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-950/10 bg-[#f5f1e9] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div>
              <Link to="/" aria-label="Hooman Finder home" className="inline-flex">
                <img src="/logo.png" alt="Hooman Finder" className="h-10 w-auto" />
              </Link>
              <p className="mt-4 max-w-md text-sm leading-6 text-stone-600">
                A free tool helping people discover adoptable dogs through lifestyle fit, then continue directly with the shelter or rescue.
              </p>
            </div>

            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm font-semibold text-stone-600 sm:grid-cols-3">
              <Link to="/about" className="hover:text-stone-950">About</Link>
              <Link to="/contact" className="hover:text-stone-950">Contact</Link>
              <a href="mailto:info@hoomanfinder.com" className="hover:text-stone-950">Email us</a>
              <Link to="/privacy" className="hover:text-stone-950">Privacy</Link>
              <Link to="/terms" className="hover:text-stone-950">Terms &amp; disclaimer</Link>
              <Link to="/shelters/join" className="hover:text-stone-950">For shelters &amp; rescues</Link>
            </nav>
          </div>

          <div className="mt-8 border-t border-stone-950/10 pt-5 text-xs leading-5 text-stone-500">
            © {new Date().getFullYear()} Hooman Finder. Adoption availability, requirements, and dog details should be confirmed directly with the listing shelter or rescue.
          </div>
        </div>
      </footer>
    </div>
  );
}
