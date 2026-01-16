// src/pages/Contact.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";

export default function Contact() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
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
            <button
              onClick={() => navigate("/quiz")}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Take the quiz
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl w-full px-4 py-10 flex-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Contact
        </h1>
        <p className="mt-2 text-slate-600">
          Questions, comments, or suggestions? Email us anytime:
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-800">Email</div>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <a
              href="mailto:hoomanfinder@gmail.com"
              className="text-lg font-bold text-slate-900 underline-offset-4 hover:underline"
            >
              hoomanfinder@gmail.com
            </a>

            <button
              onClick={() => navigator.clipboard?.writeText("hoomanfinder@gmail.com")}
              className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
            >
              Copy email
            </button>
          </div>

          <p className="mt-4 text-sm text-slate-600">
            If you’re a shelter or rescue, you can also use the “For shelters” link in the footer.
          </p>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
          >
            Back
          </button>

          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Back to home
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
