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
              to="/quiz"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Take the quiz
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl w-full px-4 py-10 flex-1">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
          About Hooman Finder
        </h1>

        <p className="mt-4 text-slate-700 leading-relaxed">
          Hooman Finder is a simple way to discover rescue dogs that fit your lifestyle.
          Instead of endless scrolling, you answer a quick quiz and we rank adoptable dogs
          based on compatibility.
        </p>

        <div className="mt-8 grid gap-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">Why this matters</h2>
            <p className="mt-3 text-slate-700 leading-relaxed">
              The U.S. is facing an animal shelter capacity crisis. Hundreds of thousands of
              dogs and cats are euthanized each year, often because shelters run out of space.
              When one dog stays in a shelter longer than necessary, it can block a kennel that
              could have saved the next dog coming in.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">Our mission</h2>
            <p className="mt-3 text-slate-700 leading-relaxed">
              Our mission is to help more people feel confident adopting by making it easier to
              find a dog that genuinely fits their life. More adoptions means more open spots in
              shelters — and more chances for the next dog to be taken in, cared for, and placed.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">Why I started it</h2>
            <p className="mt-3 text-slate-700 leading-relaxed">
              I’ve always wanted to rescue. I also love playing fetch with dogs — and I wanted a
              faster, more specific way to find the “right” dog who’s already out there waiting.
              Hooman Finder is my attempt to make adoption feel simpler and more personal, so
              more people choose rescue.
            </p>

            <p className="mt-4 text-sm text-slate-600">Founder: Lauren Breukink</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
            >
              Back to home
            </Link>

            <Link
              to="/quiz"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Start matching
            </Link>

            <Link
              to="/contact"
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
            >
              Contact
            </Link>
          </div>

          <div className="text-xs text-slate-500 leading-relaxed">
            Note: Hooman Finder does not process adoptions. All applications and final adoption decisions
            happen directly through the shelter or rescue listed on each dog profile.
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
