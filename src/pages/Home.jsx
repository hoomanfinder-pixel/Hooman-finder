// src/pages/Home.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

const HOW_IT_WORKS = [
  {
    number: "01",
    title: "Match by lifestyle",
    text: "Look beyond breed and age to energy, temperament, home needs, and fit.",
  },
  {
    number: "02",
    title: "See urgent dogs",
    text: "Dogs who need visibility quickly can stand out to the right adopters.",
  },
  {
    number: "03",
    title: "Apply through rescues",
    text: "We help you discover dogs. The rescue handles the adoption.",
  },
];

const fallbackDogImages = [
  "/home-hero-dogs.jpg",
  "/home-cta-dog.jpg",
  "/home-hero-dogs.jpg",
];

export default function Home() {
  const [featuredDogs, setFeaturedDogs] = useState([]);
  const [dogLoadFailed, setDogLoadFailed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadFeaturedDogs() {
      try {
        const { data, error } = await supabase
          .from("dogs")
          .select(
            "id, name, photo_url, urgency_level, adoptable, adoption_pending, availability_status, created_at"
          )
          .eq("adoptable", true)
          .not("photo_url", "is", null)
          .or("adoption_pending.is.null,adoption_pending.eq.false")
          .or("availability_status.is.null,availability_status.eq.available")
          .order("created_at", { ascending: false })
          .limit(12);

        if (error) throw error;

        const urgencyRank = {
          Critical: 1,
          High: 2,
          Standard: 3,
          Adopted: 99,
        };

        const sortedDogs = [...(data || [])]
          .filter((dog) => dog?.photo_url)
          .sort((a, b) => {
            const aRank = urgencyRank[a?.urgency_level] || 50;
            const bRank = urgencyRank[b?.urgency_level] || 50;

            if (aRank !== bRank) return aRank - bRank;

            return new Date(b?.created_at || 0) - new Date(a?.created_at || 0);
          })
          .slice(0, 3);

        if (isMounted) {
          setFeaturedDogs(sortedDogs);
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
      image: featuredDogs[index]?.photo_url || fallbackDogImages[index],
    }));
  }, [featuredDogs]);

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-stone-950">
      <header className="absolute left-0 right-0 top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            aria-label="Go to Hooman Finder homepage"
            className="inline-flex items-center"
          >
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-12 w-auto rounded-sm bg-white/85 p-1 shadow-sm backdrop-blur-sm sm:h-14"
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
              className="border border-white/60 px-4 py-2 text-white backdrop-blur-sm transition hover:bg-white hover:text-stone-950"
            >
              Quiz
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative min-h-[92vh] overflow-hidden bg-stone-950 text-white">
          <img
            src="/home-hero-dogs.jpg"
            alt="Rescue dogs looking for their future home"
            className="absolute inset-0 h-full w-full object-cover"
          />

          <div className="absolute inset-0 bg-stone-950/55" />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/35 to-stone-950/25" />
          <div className="absolute inset-0 bg-gradient-to-r from-stone-950/65 via-stone-950/20 to-transparent" />

          <div className="relative z-10 flex min-h-[92vh] items-end">
            <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-32 sm:px-6 sm:pb-14 lg:px-8">
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/70">
                  Michigan + Midwest rescue dogs
                </p>

                <h1 className="mt-5 max-w-2xl text-5xl font-semibold leading-[0.9] tracking-[-0.06em] text-white sm:text-7xl lg:text-8xl">
                  Find a dog who fits your real life.
                </h1>

                <p className="mt-6 max-w-xl text-base leading-7 text-white/78 sm:text-lg">
                  Discover adoptable dogs by personality, lifestyle fit, and
                  urgency — then apply directly through the rescue or shelter.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    to="/dogs"
                    className="inline-flex items-center justify-center border border-white bg-white px-6 py-3 text-sm font-semibold text-stone-950 transition hover:bg-transparent hover:text-white"
                  >
                    View adoptable dogs →
                  </Link>

                  <Link
                    to="/quiz"
                    className="inline-flex items-center justify-center border border-white/50 px-6 py-3 text-sm font-semibold text-white transition hover:border-white hover:bg-white hover:text-stone-950"
                  >
                    Take the matching quiz
                  </Link>
                </div>
              </div>

              <div className="mt-10 border-t border-white/20 pt-4">
                <p className="max-w-xl text-xs uppercase leading-6 tracking-[0.22em] text-white/58">
                  Personality-first adoption discovery. Hooman Finder helps with
                  discovery and fit. The rescue handles the adoption.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#f4f1ea] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="border-b border-stone-950/20 pb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-stone-500">
                How it works
              </p>

              <h2 className="mt-3 max-w-2xl text-4xl font-semibold leading-none tracking-[-0.045em] text-stone-950 sm:text-5xl">
                Less scrolling. Better fit.
              </h2>
            </div>

            <div className="divide-y divide-stone-950/15">
              {howItWorksRows.map((row, index) => (
                <article
                  key={row.number}
                  className="grid gap-5 py-7 sm:grid-cols-[120px_1fr_180px] sm:items-center sm:gap-8 lg:grid-cols-[160px_1fr_260px]"
                >
                  <div className="flex items-center justify-between gap-4 sm:block">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400">
                      {row.number}
                    </p>

                    <div className="h-px flex-1 bg-stone-950/15 sm:mt-5 sm:h-24 sm:w-px" />
                  </div>

                  <div>
                    <h3 className="text-3xl font-semibold leading-none tracking-[-0.04em] text-stone-950 sm:text-4xl">
                      {row.title}
                    </h3>

                    <p className="mt-3 max-w-xl text-sm leading-7 text-stone-600 sm:text-base">
                      {row.text}
                    </p>

                    {row.dog?.name && (
                      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                        Featuring {row.dog.name}
                      </p>
                    )}
                  </div>

                  <Link
                    to={row.dog?.id ? `/dogs/${row.dog.id}` : "/dogs"}
                    className="group relative h-48 overflow-hidden bg-stone-200 sm:h-32 lg:h-40"
                    aria-label={
                      row.dog?.name
                        ? `View ${row.dog.name}'s profile`
                        : "View adoptable dogs"
                    }
                  >
                    <img
                      src={row.image}
                      alt={
                        row.dog?.name
                          ? `${row.dog.name}, an adoptable dog`
                          : "Adoptable dog"
                      }
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />

                    <div className="absolute inset-0 bg-stone-950/10 transition group-hover:bg-stone-950/25" />

                    {row.dog?.urgency_level &&
                      row.dog.urgency_level !== "Standard" && (
                        <div className="absolute left-3 top-3 bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-950">
                          {row.dog.urgency_level}
                        </div>
                      )}
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
                Start here
              </p>

              <h2 className="mt-4 text-5xl font-semibold leading-[0.9] tracking-[-0.055em] text-white sm:text-7xl">
                Not sure where to start?
              </h2>

              <p className="mt-6 max-w-xl text-base leading-7 text-white/75 sm:text-lg">
                Take the quiz for guided matches, or browse dogs if you already
                know what you’re looking for.
              </p>

              <div className="mt-8">
                <Link
                  to="/quiz"
                  className="inline-flex items-center justify-center border border-white bg-white px-7 py-3 text-sm font-semibold text-stone-950 transition hover:bg-transparent hover:text-white"
                >
                  Find my match →
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-950/10 bg-[#f4f1ea] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <img src="/logo.png" alt="Hooman Finder" className="h-10 w-auto" />
            <p className="mt-3 text-xs text-stone-500">
              © 2026 Hooman Finder
            </p>
          </div>

          <nav className="flex flex-wrap gap-5 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
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