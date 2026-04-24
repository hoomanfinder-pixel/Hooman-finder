// src/pages/Home.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <Link to="/">
            <img src="/logo.png" alt="Hooman Finder" className="h-12 w-auto" />
          </Link>

          <div className="flex items-center gap-3">
            <Link to="/about" className="rounded-full border px-5 py-2 font-semibold">
              About
            </Link>
            <Link to="/saved" className="rounded-full border px-5 py-2 font-semibold">
              Saved
            </Link>
            <button
              onClick={() => navigate("/quiz")}
              className="rounded-full bg-slate-900 text-white px-5 py-2 font-semibold"
            >
              Take the quiz
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10">
          <div className="relative overflow-hidden rounded-3xl border bg-white shadow-sm">
            <div className="absolute inset-0">
              <img
                src="/hero-dog.jpg"
                alt=""
                className="h-full w-full object-cover object-center opacity-30"
              />
              <div className="absolute inset-0 bg-white/40" />
            </div>

            <div className="relative px-6 py-16 text-center">
              <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
                Find dogs who need homes — and the humans who fit them best.
              </h1>

              <p className="mt-4 text-slate-700 max-w-2xl mx-auto">
                Discover adoptable dogs based on personality, lifestyle, and urgency.
                When you find a dog you love, apply directly through the shelter or rescue.
              </p>

              <div className="mt-7 flex flex-col sm:flex-row justify-center gap-3">
                <button
                  onClick={() => navigate("/dogs")}
                  className="rounded-full bg-slate-900 text-white px-7 py-3 font-semibold"
                >
                  View adoptable dogs
                </button>

                <button
                  onClick={() => navigate("/quiz")}
                  className="rounded-full bg-white border px-7 py-3 font-semibold"
                >
                  Take the matching quiz
                </button>

                <button
                  onClick={() => navigate("/shelters/join")}
                  className="rounded-full bg-white border px-7 py-3 font-semibold"
                >
                  For shelters
                </button>
              </div>

              <p className="mt-5 text-xs text-slate-600">
                Hooman Finder does not process adoptions directly.
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-extrabold text-slate-900">
                Personality-based discovery
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Browse dogs by temperament, energy level, lifestyle fit, and home needs.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-extrabold text-slate-900">
                Urgent dogs get visibility
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Dogs who need help quickly can be highlighted so more people see them.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-extrabold text-slate-900">
                Apply through the source
              </div>
              <p className="mt-2 text-sm text-slate-600">
                When you find a dog you love, you’ll be sent to the shelter or rescue to apply.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}