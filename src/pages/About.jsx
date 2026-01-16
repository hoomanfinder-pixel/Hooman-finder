// src/pages/About.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";

export default function About() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3"
            aria-label="Go home"
          >
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-16 w-16 object-contain"
            />
          </button>

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

      <main className="mx-auto max-w-3xl px-4 py-10 flex-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          About Hooman Finder
        </h1>

        <p className="mt-4 text-slate-700 leading-relaxed">
          Hooman Finder is a simple way to discover rescue dogs that fit your lifestyle.
          Instead of endless scrolling, you answer a quick quiz and we rank adoptable dogs
          based on compatibility.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">How it works</h2>
          <ol className="mt-3 list-decimal pl-5 text-slate-700 space-y-2">
            <li>Take the quiz (home, routine, preferences).</li>
            <li>See ranked matches and filter further if you want.</li>
            <li>
              When you’re ready, click <span className="font-semibold">Apply to adopt</span>{" "}
              to go directly to the shelter’s application.
            </li>
          </ol>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Important note</h2>
          <p className="mt-2 text-slate-700 leading-relaxed">
            Hooman Finder does not process adoptions. All applications and final adoption decisions
            happen directly through the shelter or rescue listed on each dog profile.
          </p>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
          >
            Back to home
          </Link>
          <Link
            to="/quiz"
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Start matching
          </Link>
        </div>

        <p className="mt-8 text-sm text-slate-600">
          Founder: Lauren Breukink
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
