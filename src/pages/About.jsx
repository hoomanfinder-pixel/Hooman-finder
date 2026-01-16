// src/pages/About.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";

export default function About() {
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
              to="/dogs"
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
            >
              Browse dogs
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

      <main className="mx-auto max-w-6xl w-full px-4 py-10 flex-1">
        {/* Hero card (cute + soft) */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="absolute inset-0">
            {/* Optional background image for About */}
            <img
              src="/hero-dog.jpg"
              alt=""
              className="h-full w-full object-cover opacity-25"
            />
            <div className="absolute inset-0 bg-white/35" />
          </div>

          <div className="relative px-6 py-12 md:px-12 md:py-14">
            <div className="max-w-3xl">
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
                About Hooman Finder
              </h1>

              <p className="mt-4 text-slate-700 leading-relaxed">
                Hooman Finder helps people feel confident adopting by matching
                them with rescue dogs that actually fit their lifestyle — so it’s
                less “endless scrolling” and more “this dog makes sense for me.”
              </p>

              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate("/quiz")}
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-7 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Start matching
                </button>

                <button
                  onClick={() => navigate("/dogs")}
                  className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
                >
                  Browse example dogs
                </button>

                <button
                  onClick={() => navigate("/contact")}
                  className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
                >
                  Contact
                </button>
              </div>

              <p className="mt-4 text-xs text-slate-600">
                Note: Hooman Finder does not process adoptions — applications and
                final decisions happen directly through the shelter/rescue.
              </p>
            </div>
          </div>
        </section>

        {/* Content blocks */}
        <section className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">Why this matters</h2>
            <p className="mt-3 text-slate-700 leading-relaxed">
              The U.S. is facing an animal shelter capacity crisis. When shelters
              are full, dogs can be euthanized simply because there isn’t enough
              space. Every adoption helps open a spot for the next dog coming in.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">Our mission</h2>
            <p className="mt-3 text-slate-700 leading-relaxed">
              Help more people adopt by making “finding the right rescue dog” feel
              simpler and more personal. More confident adopters → more adoptions
              → more open kennels → more lives saved.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">Why I started it</h2>
            <p className="mt-3 text-slate-700 leading-relaxed">
              I’ve always wanted to rescue — and I wanted a faster, more specific
              way to find the “right” dog who’s already out there waiting.
              Hooman Finder is my attempt to make adoption feel easier, so more
              people choose rescue.
            </p>

            <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Founder:</span>{" "}
              Lauren Breukink
            </div>
          </div>
        </section>

        {/* Bottom CTA strip */}
        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">
              Ready to meet your match?
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Take the quiz and get a ranked list — then apply directly through the shelter.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate("/quiz")}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Take the quiz
            </button>

            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
            >
              Back to home
            </button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
