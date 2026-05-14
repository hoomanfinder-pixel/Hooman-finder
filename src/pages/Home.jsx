// src/pages/Home.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4">
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

          <div className="flex items-center gap-4">
            <Link
              to="/about"
              className="hidden sm:inline-flex text-sm font-bold text-slate-700 hover:text-slate-950"
            >
              About
            </Link>

            <Link
              to="/saved"
              className="hidden sm:inline-flex text-sm font-bold text-slate-700 hover:text-slate-950"
            >
              Saved
            </Link>

            <button
              type="button"
              onClick={() => navigate("/quiz")}
              className="bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
            >
              Take quiz
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
          <div className="grid grid-cols-1 overflow-hidden border border-slate-200 bg-white shadow-sm lg:grid-cols-[0.95fr_1.05fr]">
            <div className="flex flex-col justify-center px-5 py-7 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">
                Michigan + Midwest rescue dogs
              </p>

              <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-[0.95] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Find a dog who fits your real life.
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
                Discover adoptable dogs by personality, lifestyle fit, and urgency —
                then apply directly through the rescue or shelter.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => navigate("/dogs")}
                  className="bg-slate-950 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800"
                >
                  View adoptable dogs
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/quiz")}
                  className="border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-950 hover:bg-slate-50"
                >
                  Take the matching quiz
                </button>
              </div>

              <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-500">
                Hooman Finder helps with discovery and fit. The shelter or rescue
                handles the adoption process.
              </p>
            </div>

            <div className="relative min-h-[300px] bg-slate-200 sm:min-h-[420px] lg:min-h-[560px]">
              <img
                src="/hero-dog.jpg"
                alt="Adoptable dog"
                className="absolute inset-0 h-full w-full object-cover"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent lg:bg-gradient-to-l lg:from-transparent lg:via-transparent lg:to-white/10" />

              <div className="absolute bottom-0 left-0 right-0 border-t border-white/20 bg-slate-950/70 px-5 py-4 text-white backdrop-blur-sm sm:px-6">
                <p className="text-sm font-extrabold">
                  Personality-first adoption discovery
                </p>
                <p className="mt-1 text-sm text-slate-200">
                  Browse dogs by more than breed, age, and size.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 border border-slate-200 bg-white sm:grid-cols-3">
            <div className="border-b border-slate-200 p-5 sm:border-b-0 sm:border-r sm:p-6">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-slate-400">
                01
              </p>
              <h2 className="mt-3 text-xl font-extrabold text-slate-950">
                Match by lifestyle
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Look beyond breed and age to energy, temperament, home needs, and fit.
              </p>
            </div>

            <div className="border-b border-slate-200 p-5 sm:border-b-0 sm:border-r sm:p-6">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-slate-400">
                02
              </p>
              <h2 className="mt-3 text-xl font-extrabold text-slate-950">
                See urgent dogs
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Dogs who need visibility quickly can stand out to the right adopters.
              </p>
            </div>

            <div className="p-5 sm:p-6">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-slate-400">
                03
              </p>
              <h2 className="mt-3 text-xl font-extrabold text-slate-950">
                Apply through rescues
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                We help you discover dogs. The rescue handles the adoption.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 border border-slate-200 bg-slate-950 text-white sm:grid-cols-[1fr_auto]">
            <div className="p-5 sm:p-6">
              <h2 className="text-2xl font-extrabold">
                Not sure where to start?
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                Take the quiz for guided matches, or browse dogs if you already know
                what you’re looking for.
              </p>
            </div>

            <div className="border-t border-white/10 p-5 sm:flex sm:items-center sm:border-l sm:border-t-0 sm:p-6">
              <button
                type="button"
                onClick={() => navigate("/quiz")}
                className="w-full bg-white px-7 py-3 text-sm font-extrabold text-slate-950 hover:bg-slate-100 sm:w-auto"
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