import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import SiteFooter from "../components/SiteFooter";

export default function Terms() {
  useEffect(() => {
    document.title = "Terms and Disclaimer | Hooman Finder";
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" aria-label="Go home">
            <img src="/logo.png" alt="Hooman Finder" className="h-20 w-20 object-contain" />
          </Link>
          <Link
            to="/quiz"
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Take the quiz
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl w-full px-4 py-10 flex-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Terms and Disclaimer
        </h1>
        <p className="mt-2 text-sm text-slate-600">Last updated: June 6, 2026</p>

        <div className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm">
          <section>
            <h2 className="text-lg font-bold text-slate-900">Use of the Site</h2>
            <p className="mt-2">
              Hooman Finder is a dog adoption discovery and matching website. The quiz is
              intended to suggest potential matches based on your answers and available dog
              listing information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">Adoption Information</h2>
            <p className="mt-2">
              Adoption availability, fees, requirements, and dog details are provided by
              rescues, shelters, or their public listings and may change. Users should confirm
              all details directly with the rescue or shelter before applying or visiting.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">No Official Authority</h2>
            <p className="mt-2">
              Hooman Finder does not provide medical, legal, veterinary, behavioral, or official
              rescue authority. We do not approve applications, place dogs, or make final
              adoption decisions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">Contact</h2>
            <p className="mt-2">
              Questions can be sent to{" "}
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
