// src/components/SiteHeader.jsx
import React from "react";
import { Link } from "react-router-dom";

const CTA_VARIANTS = {
  primary: "bg-[#0F2742] text-[#F3C982] hover:bg-[#0C1E35]",
  secondary: "border border-[#C7D4BB] bg-white text-[#0F2742] hover:bg-[#EFE8DC]",
};

// Shared chrome for pages with a simple "logo + CTAs" or "back link + CTAs"
// header (About/Contact/Privacy/Terms/JoinShelters/Shelter/DogDetail). Pages
// with embedded state in their header (progress bar, filter badge, etc.)
// keep their own bespoke header and just match this palette in place.
export default function SiteHeader({ back = null, ctas = [] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#C7D4BB]/60 bg-[#F5F1E9]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {back ? (
          <Link
            to={back.to}
            className="shrink-0 text-sm font-semibold text-[#0F2742] hover:underline"
          >
            ← {back.label}
          </Link>
        ) : (
          <Link
            to="/"
            aria-label="Go to Hooman Finder homepage"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#C7D4BB] bg-white p-1.5"
          >
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-full w-full object-contain"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          </Link>
        )}

        {ctas.length ? (
          <div className="flex items-center gap-2">
            {ctas.map((cta) => (
              <Link
                key={cta.label}
                to={cta.to}
                className={[
                  "inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-4 text-[13px] font-bold transition",
                  CTA_VARIANTS[cta.variant] || CTA_VARIANTS.secondary,
                ].join(" ")}
              >
                {cta.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
