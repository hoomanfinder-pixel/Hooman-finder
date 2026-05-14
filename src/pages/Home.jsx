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
        <section className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="absolute inset-0">
              <img
                src="/hero-dog.jpg"
                alt=""
                className="h-full w-full object-cover object-center opacity-25"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-white/95 via-white/90 to-white/95" />
            </div>

            <div className="relative px-5 py-8 sm:px-8 sm:py-14 md:px-10 md:py-16">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex max-w-full items-center rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-wide text-slate-600 shadow-sm">
                  Rescue dogs in Michigan + the Midwest
                </div>

                <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight tracking-tight text-slate-950">
                  Find a dog who fits your real life.
                </h1>

                <p className="mt-4 text-base sm:text-lg text-slate-700 max-w-2xl leading-relaxed">
                  Hooman Finder helps you discover adoptable dogs by personality,
                  lifestyle fit, and urgency — then apply directly through the rescue
                  or shelter.
                </p>

                <div className="mt-6 flex flex-col sm:flex-row gap-3">
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
                </div>

                <p className="mt-4 text-xs sm:text-sm text-slate-500 leading-relaxed max-w-2xl">
                  Hooman Finder does not process adoptions directly. We help you find
                  the fit, then connect you to the source.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
              <div className="text-sm sm:text-base font-extrabold text-slate-900">
                Match by lifestyle
              </div>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Look beyond breed and age to energy, temperament, home needs, and fit.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
              <div className="text-sm sm:text-base font-extrabold text-slate-900">
                See urgent dogs
              </div>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Dogs who need visibility quickly can stand out to the right adopters.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
              <div className="text-sm sm:text-base font-extrabold text-slate-900">
                Apply through rescues
              </div>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                We help with discovery. The shelter or rescue handles the adoption.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-950">
                  Not sure where to start?
                </h2>
                <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
                  Take the quiz if you want guidance, or browse dogs if you already
                  know what you’re looking for.
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate("/quiz")}
                className="w-full sm:w-auto shrink-0 rounded-full bg-slate-900 text-white px-6 py-3 font-semibold hover:bg-slate-800 shadow-sm"
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