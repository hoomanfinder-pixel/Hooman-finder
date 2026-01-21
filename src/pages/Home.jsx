// src/pages/Home.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" aria-label="Go home">
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-24 w-24 object-contain"
            />
          </Link>

          <div className="flex items-center gap-3">
            <Link
              to="/about"
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
            >
              About
            </Link>

            <Link
              to="/saved"
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
            >
              Saved
            </Link>

            <Link
              to="/quiz"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Take the quiz
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 py-10">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {/* Background image */}
            <div className="absolute inset-0">
              <img
                src="/hero-dog.jpg"
                alt=""
                className="h-full w-full object-cover opacity-30"
              />
              <div className="absolute inset-0 bg-white/30" />
            </div>

            <div className="relative px-6 py-14 md:px-12 md:py-16 text-center">
              {/* Demo pill */}
              <div className="mb-4 flex justify-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/80 px-4 py-1.5 text-xs font-semibold text-slate-800 backdrop-blur">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Demo preview
                </span>
              </div>

              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
                Find a rescue dog that fits your life
              </h1>

              <p className="mt-4 text-slate-700 max-w-2xl mx-auto">
                Take a quick lifestyle quiz and get ranked matches — so you can
                adopt with confidence (not endless scrolling).
              </p>

              <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => navigate("/quiz")}
                  className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-slate-900 px-7 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Start matching
                </button>

                <button
                  onClick={() => navigate("/dogs")}
                  className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
                >
                  Browse example dogs
                </button>

                <button
                  onClick={() => navigate("/shelters/join")}
                  className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
                >
                  For shelters
                </button>
              </div>

              <p className="mt-4 text-xs text-slate-600">
                This is an early demo — dogs shown may be sample/test profiles while we onboard shelters.
              </p>
            </div>
          </div>

          {/* 3 feature icons */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-extrabold text-slate-900">Quick quiz</div>
              <p className="mt-2 text-sm text-slate-600">
                Answer a few questions about your lifestyle, home, and preferences.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-extrabold text-slate-900">Ranked matches</div>
              <p className="mt-2 text-sm text-slate-600">
                Get a ranked list with match % so you know who fits best.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-extrabold text-slate-900">Apply to shelters</div>
              <p className="mt-2 text-sm text-slate-600">
                When you’re ready, apply directly through the shelter.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
