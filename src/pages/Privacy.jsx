import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";

export default function Privacy() {
  useEffect(() => {
    document.title = "Privacy Policy | Hooman Finder";
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" aria-label="Go home">
            <img src="/logo.png" alt="Hooman Finder" className="h-20 w-20 object-contain" />
          </Link>
          <Link
            to="/dogs"
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Browse dogs
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl w-full px-4 py-10 flex-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-slate-600">Last updated: June 6, 2026</p>

        <div className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm">
          <section>
            <h2 className="text-lg font-bold text-slate-900">What Hooman Finder Does</h2>
            <p className="mt-2">
              Hooman Finder helps users browse adoptable dogs and use a quiz to suggest
              potential lifestyle matches. Adoption availability and dog details come from
              rescues, shelters, or their public listings and may change.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">Information We Use</h2>
            <p className="mt-2">
              Quiz answers may be used to suggest potential matches. Saved dogs may be stored
              locally in your browser so you can revisit them. If you email us, we receive the
              information you choose to send.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">Adoption Details</h2>
            <p className="mt-2">
              Hooman Finder does not process adoptions, make rescue decisions, or guarantee
              availability. Please confirm adoption details directly with the rescue or shelter.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">Contact</h2>
            <p className="mt-2">
              Questions about this policy can be sent to{" "}
              <a className="font-semibold underline" href="mailto:info@hoomanfinder.com">
                info@hoomanfinder.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
