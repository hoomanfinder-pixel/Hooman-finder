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

const TRUST_ICONS = ["💛", "⚡", "🏠", "🐾"];

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

  const sneakPeekDogs = howItWorksRows.filter((row) => row.dog);

  return (
    <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#0F2742]">
      <SEO
        title="Free Dog Adoption Matching Tool | Hooman Finder"
        description="Discover real adoptable shelter and rescue dogs based on lifestyle fit—not just breed or looks. Hooman Finder is free to use, with no account required."
        canonicalPath="/"
        ogImage="/home-hero-dogs.jpg"
        ogImageAlt="Shelter and rescue dogs looking for their future home"
      />

      <header className="border-b border-[#C7D4BB]/60 bg-[#F5F1E9]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 sm:px-6 sm:py-3 lg:px-8">
          <Link to="/" aria-label="Go to Hooman Finder homepage" className="flex items-center">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#C7D4BB] bg-white p-1.5">
              <img
                src="/logo.png"
                alt="Hooman Finder"
                className="h-full w-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            </span>
          </Link>

          <nav className="flex items-center gap-5 text-[13px] font-semibold text-[#0F2742]">
            <Link to="/about" className="hidden hover:text-[#0F4F88] sm:inline">
              About
            </Link>
            <Link to="/saved" className="hidden hover:text-[#0F4F88] sm:inline">
              Saved
            </Link>
            <Link
              to="/quiz"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#0F2742] px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#F3C982] transition hover:bg-[#0C1E35] sm:px-4"
            >
              Take the Quiz
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="px-4 pt-4 sm:px-6 sm:pt-10 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-center lg:gap-10">
              <div className="relative h-[220px] overflow-hidden rounded-[1.75rem] bg-[#0C1E35] sm:h-[360px] lg:h-[440px]">
                <img
                  src="/home-hero-dogs.jpg"
                  alt="Two adoptable dogs sitting together"
                  className="absolute inset-0 h-full w-full object-cover object-[50%_40%] sm:object-center"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0C1E35]/85 via-[#0C1E35]/10 to-transparent" />
                <p className="absolute bottom-4 left-4 right-4 text-[13px] font-medium text-[#F5F1E9] opacity-90">
                  Real shelter &amp; rescue dogs, near you
                </p>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#D5AB70]">
                  Free dog adoption matching tool
                </p>
                <h1 className="mt-2 font-['Fraunces',serif] text-[2.2rem] font-semibold leading-[1.08] text-[#0F2742] sm:mt-3 sm:text-5xl lg:text-[3.25rem]">
                  Find adoptable dogs that fit your real life.
                </h1>
                <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-[#6F6A66] sm:mt-4 sm:text-base">
                  Discover real shelter and rescue dogs based on lifestyle fit—not just breed or looks.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:mt-6 sm:flex-row">
                  <Link
                    to="/quiz"
                    className="inline-flex min-h-[3.1rem] items-center justify-center rounded-2xl bg-[#0F2742] px-7 text-sm font-bold text-[#F3C982] shadow-sm transition hover:bg-[#0C1E35]"
                  >
                    Take the Quiz
                  </Link>
                  <Link
                    to="/dogs"
                    className="inline-flex min-h-[3.1rem] items-center justify-center rounded-2xl border border-[#C7D4BB] bg-white px-7 text-sm font-bold text-[#0F2742] transition hover:bg-[#EFE8DC]"
                  >
                    Browse Dogs
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Why adopters can trust Hooman Finder" className="px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {TRUST_POINTS.map(([title, text], index) => (
                <div key={title} className="rounded-2xl border border-[#C7D4BB] bg-white p-4">
                  <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-[#DFE7D7] text-sm">
                    {TRUST_ICONS[index]}
                  </div>
                  <p className="text-[13px] font-bold text-[#0F2742]">{title}</p>
                  <p className="mt-1 text-[11.5px] leading-5 text-[#6F6A66]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#6F6A66]">
              How it works
            </p>
            <h2 className="mt-2 max-w-xl font-['Fraunces',serif] text-3xl font-semibold leading-tight text-[#0F2742] sm:text-4xl">
              Three steps to a more informed shortlist.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#6F6A66] sm:text-base">
              Your answers guide the matches you see. They do not decide whether a dog is right for you or whether an adoption is approved.
            </p>

            <div className="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-5">
              {HOW_IT_WORKS.map((row) => (
                <div key={row.number} className="flex gap-4 sm:flex-col sm:gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0F2742] font-['Fraunces',serif] text-sm font-semibold text-[#F3C982]">
                    {row.number}
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#0F2742]">{row.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#6F6A66]">{row.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {sneakPeekDogs.length > 0 ? (
          <section className="py-2 sm:py-4">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#6F6A66]">
                Sneak peek
              </p>
              <h2 className="mt-2 font-['Fraunces',serif] text-2xl font-semibold text-[#0F2742]">
                Dogs waiting nearby
              </h2>
            </div>

            <div className="mt-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:px-6 lg:px-8">
              {sneakPeekDogs.map((row) => (
                <Link
                  key={row.dog.id}
                  to={dogProfilePath(row.dog)}
                  aria-label={`View ${row.dog.name}'s profile`}
                  className="w-32 shrink-0 overflow-hidden rounded-2xl border border-[#C7D4BB] bg-white transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="h-24 w-full bg-[#EFE8DC]">
                    <img
                      src={row.image}
                      alt={`${row.dog.name}, an adoptable dog`}
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = fallbackDogImages[0];
                      }}
                    />
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-[13px] font-semibold text-[#0F2742]">
                      {row.dog.name}
                    </p>
                    <p className="truncate text-[11px] text-[#6F6A66]">
                      {row.rescueName || "Adoptable dog"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {dogLoadFailed && (
              <p className="mx-auto max-w-6xl px-4 pt-2 text-xs leading-6 text-[#6F6A66] sm:px-6 lg:px-8">
                Live dog photos did not load, so this section is using homepage fallback images for now.
              </p>
            )}
          </section>
        ) : null}

        <section className="bg-[#EFE8DC] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#6F6A66]">
              Why matching matters
            </p>
            <h2 className="mt-2 max-w-lg font-['Fraunces',serif] text-3xl font-semibold leading-tight text-[#0F2742] sm:text-4xl">
              Better fit starts with better questions.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6F6A66] sm:text-base">
              Choosing a dog is about more than a photo. A thoughtful starting point can help you focus your search and prepare better questions for the shelter or rescue.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              {WHY_FIT_MATTERS.map((item) => (
                <article
                  key={item.label}
                  className="rounded-2xl border border-[#C7D4BB] bg-white/85 p-5 shadow-[0_10px_30px_rgba(15,39,66,0.06)] sm:p-6"
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#D5AB70]">
                    {item.label}
                  </p>
                  <h3 className="mt-4 font-['Fraunces',serif] text-xl font-semibold leading-tight text-[#0F2742]">
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
              <h2 className="mt-3 font-['Fraunces',serif] text-2xl font-semibold leading-tight text-[#0F2742] sm:text-3xl">
                Help adopters start with fit.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-[#6F6A66] sm:text-base">
                Hooman Finder helps people discover listed dogs, then sends interested adopters to the shelter or rescue to ask questions and continue its application process.
              </p>
              <Link
                to="/shelters/join"
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-[#0F2742] px-6 text-sm font-bold text-[#0F2742] transition hover:bg-[#0F2742] hover:text-white"
              >
                Shelter or rescue inquiries
              </Link>
            </article>

            <article className="rounded-[1.75rem] bg-[#0F2742] p-6 text-white sm:p-8">
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
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full border border-white/45 px-6 text-sm font-bold text-white transition hover:border-white hover:bg-white hover:text-[#0F2742]"
              >
                About Hooman Finder
              </Link>
            </article>
          </div>
        </section>

        <section className="px-4 pb-10 sm:px-6 sm:pb-16 lg:px-8">
          <div className="mx-auto max-w-6xl rounded-[1.75rem] bg-[#0F2742] p-8 text-center sm:p-12">
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
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#F3C982] px-7 text-sm font-bold text-[#0C1E35] transition hover:bg-white"
              >
                Take the Quiz
              </Link>
              <Link
                to="/dogs"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/55 px-7 text-sm font-bold text-white transition hover:border-white hover:bg-white hover:text-[#0F2742]"
              >
                Browse Dogs
              </Link>
            </div>
            <p className="mx-auto mt-6 max-w-lg text-xs leading-5 text-white/55">
              Hooman Finder does not replace adoption counseling, applications, meet-and-greets, or final decisions made by shelters and rescues.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#C7D4BB]/60 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div>
              <Link to="/" aria-label="Hooman Finder home" className="inline-flex">
                <img src="/logo.png" alt="Hooman Finder" className="h-9 w-auto" />
              </Link>
              <p className="mt-4 max-w-md text-sm leading-6 text-[#6F6A66]">
                A free tool helping people discover adoptable dogs through lifestyle fit, then continue directly with the shelter or rescue.
              </p>
            </div>

            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm font-medium text-[#6F6A66] sm:grid-cols-3">
              <Link to="/about" className="hover:text-[#0F2742]">About</Link>
              <Link to="/contact" className="hover:text-[#0F2742]">Contact</Link>
              <a href="mailto:info@hoomanfinder.com" className="hover:text-[#0F2742]">Email us</a>
              <Link to="/privacy" className="hover:text-[#0F2742]">Privacy</Link>
              <Link to="/terms" className="hover:text-[#0F2742]">Terms &amp; disclaimer</Link>
              <Link to="/shelters/join" className="hover:text-[#0F2742]">For shelters &amp; rescues</Link>
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
