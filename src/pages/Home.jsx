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
          <Link to="/" aria-label="Go to Hooman Finder homepage" className="shrink-0">
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
              Take the quiz
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
          <div className="relative overflow-hidden rounded-3xl border border-slate-300 bg-white shadow-sm">
            <div className="absolute inset-0">
              <img
                src="/hero-dog.jpg"
                alt=""
                className="h-full w-full object-cover object-center opacity-35"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-white/85 via-white/75 to-white/90" />
            </div>

            <div className="relative px-5 py-10 sm:px-6 sm:py-14 md:px-10 md:py-20 text-center">
              <div className="mx-auto mb-4 sm:mb-5 inline-flex max-w-full items-center rounded-full border border-slate-300 bg-white/85 px-3 sm:px-4 py-2 text-[11px] sm:text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm">
                Starting with rescue dogs in Michigan + the Midwest
              </div>

              <h1 className="mx-auto max-w-5xl text-3xl sm:text-4xl md:text-6xl font-extrabold leading-tight text-slate-950">
                Find dogs who need homes — and the hoomans who fit them best.
              </h1>

              <p className="mt-4 sm:mt-5 text-base md:text-lg text-slate-700 max-w-3xl mx-auto leading-relaxed">
                Discover adoptable dogs by personality, lifestyle fit, and urgency.
                When you find your perfect match, apply directly through the shelter
                or rescue.
              </p>

              <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row justify-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate("/dogs")}
                  className="w-full sm:w-auto rounded-full bg-slate-900 text-white px-7 py-3 font-semibold hover:bg-slate-800 shadow-sm"
                >
                  View adoptable dogs
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/quiz")}
                  className="w-full sm:w-auto rounded-full bg-white border border-slate-300 px-7 py-3 font-semibold text-slate-900 hover:bg-slate-50 shadow-sm"
                >
                  Take the matching quiz
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/shelters/join")}
                  className="w-full sm:w-auto rounded-full bg-white border border-slate-300 px-7 py-3 font-semibold text-slate-900 hover:bg-slate-50 shadow-sm"
                >
                  For shelters
                </button>
              </div>

              <p className="mt-5 text-xs md:text-sm text-slate-600 max-w-2xl mx-auto leading-relaxed">
                Hooman Finder does not process adoptions directly — adoption applications
                are completed through the shelter or rescue.
              </p>
            </div>
          </div>

          <div className="mt-6 sm:mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-base md:text-sm font-extrabold text-slate-900">
                Personality-based discovery
              </div>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Browse dogs by temperament, energy level, lifestyle fit, and home needs —
                not just breed or age.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-base md:text-sm font-extrabold text-slate-900">
                Urgent dogs get visibility
              </div>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Dogs who need help quickly can be highlighted so more potential adopters
                see them.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-base md:text-sm font-extrabold text-slate-900">
                Apply through the source
              </div>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Hooman Finder helps you discover the dog. The shelter or rescue handles
                the adoption.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}