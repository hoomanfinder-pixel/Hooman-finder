// src/pages/Home.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
          <Link
            to="/"
            aria-label="Go to Hooman Finder homepage"
            className="shrink-0"
          >
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-12 sm:h-16 w-auto"
            />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/about"
              className="hidden sm:inline-flex rounded-full border border-slate-300 bg-white px-5 py-2 font-semibold text-slate-900 hover:bg-slate-50"
            >
              About
            </Link>

            <Link
              to="/saved"
              className="hidden sm:inline-flex rounded-full border border-slate-300 bg-white px-5 py-2 font-semibold text-slate-900 hover:bg-slate-50"
            >
              Saved
            </Link>

            <button
              type="button"
              onClick={() => navigate("/quiz")}
              className="rounded-full bg-slate-900 text-white px-4 sm:px-5 py-2 text-sm sm:text-base font-semibold hover:bg-slate-800 whitespace-nowrap"
            >
              Take quiz
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-5 sm:py-10">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="px-5 py-8 sm:px-8 sm:py-12 lg:px-10 lg:py-14 flex flex-col justify-center">
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
                  Michigan + Midwest rescue dogs
                </p>

                <h1 className="mt-4 max-w-3xl text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[0.98] tracking-tight text-slate-950">
                  Find a dog who fits your real life.
                </h1>

                <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed text-slate-600">
                  Hooman Finder helps you discover adoptable dogs by personality,
                  lifestyle fit, and urgency — then apply directly through the
                  rescue or shelter.
                </p>

                <div className="mt-7 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => navigate("/dogs")}
                    className="w-full sm:w-auto rounded-full bg-slate-900 px-7 py-3 font-semibold text-white shadow-sm hover:bg-slate-800"
                  >
                    View adoptable dogs
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate("/quiz")}
                    className="w-full sm:w-auto rounded-full border border-slate-300 bg-white px-7 py-3 font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                  >
                    Take the matching quiz
                  </button>
                </div>

                <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-500">
                  We help with discovery and fit. The shelter or rescue handles
                  the adoption process.
                </p>
              </div>

              <div className="relative min-h-[260px] sm:min-h-[360px] lg:min-h-full bg-slate-100">
                <img
                  src="/hero-dog.jpg"
                  alt="Adoptable dog"
                  className="absolute inset-0 h-full w-full object-cover"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-slate-950/5 to-transparent lg:bg-gradient-to-l lg:from-transparent lg:via-white/10 lg:to-white/80" />

                <div className="absolute bottom-4 left-4 right-4 rounded-3xl bg-white/90 p-4 shadow-sm backdrop-blur sm:bottom-5 sm:left-5 sm:right-5">
                  <p className="text-sm font-extrabold text-slate-950">
                    Personality-first adoption discovery
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Browse dogs by more than breed, age, and size.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-extrabold uppercase tracking-wide text-slate-500">
                01
              </p>
              <h2 className="mt-2 text-lg font-extrabold text-slate-950">
                Match by lifestyle
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Look beyond breed and age to energy, temperament, home needs,
                and fit.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-extrabold uppercase tracking-wide text-slate-500">
                02
              </p>
              <h2 className="mt-2 text-lg font-extrabold text-slate-950">
                See urgent dogs
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Dogs who need visibility quickly can stand out to the right
                adopters.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-extrabold uppercase tracking-wide text-slate-500">
                03
              </p>
              <h2 className="mt-2 text-lg font-extrabold text-slate-950">
                Apply through rescues
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Hooman Finder helps you discover dogs. The rescue handles the
                adoption.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-extrabold">
                  Not sure where to start?
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                  Take the quiz for guided matches, or browse dogs if you already
                  know what you’re looking for.
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate("/quiz")}
                className="w-full shrink-0 rounded-full bg-white px-6 py-3 font-semibold text-slate-950 hover:bg-slate-100 sm:w-auto"
              >
                Find my match
              </button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}