// src/components/DogCard.jsx
import React, { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";

function pill(text, classes) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border ${classes}`}
    >
      {text}
    </span>
  );
}

function toTitle(s) {
  if (!s) return "";
  return String(s)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function matchLabel(scorePct) {
  const n = Number(scorePct);
  if (!Number.isFinite(n)) return "";
  if (n >= 85) return "Great match";
  if (n >= 70) return "Strong match";
  if (n >= 55) return "Good match";
  return "Possible match";
}

export default function DogCard({ dog, scorePct, showMatch }) {
  const location = useLocation();

  const photoSrc =
    dog?.photo_url && dog.photo_url.trim() !== ""
      ? dog.photo_url
      : "https://placehold.co/1200x900?text=No+Photo";

  const sessionId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("session") || "";
  }, [location.search]);

  const pctText = Number.isFinite(Number(scorePct))
    ? `${Math.round(Number(scorePct))}%`
    : "";
  const label = matchLabel(scorePct);

  // Supabase returns nested object when you select: shelters(...)
  const shelter = dog?.shelters || null;

  const applyUrl = shelter?.apply_url || shelter?.website || "";
  const shelterName = shelter?.name || "Shelter";
  const shelterLocation =
    shelter && (shelter.city || shelter.state)
      ? ` • ${[shelter.city, shelter.state].filter(Boolean).join(", ")}`
      : "";

  // ✅ Dog detail link (preserve session)
  const detailHref = sessionId ? `/dog/${dog.id}?session=${sessionId}` : `/dog/${dog.id}`;

  // ✅ Shelter page link (preserve session)
  const shelterHref =
    shelter?.id
      ? sessionId
        ? `/shelters/${shelter.id}?session=${sessionId}`
        : `/shelters/${shelter.id}`
      : "";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Photo */}
      <div className="relative aspect-[4/3] bg-slate-100">
        <img
          src={photoSrc}
          alt={dog?.name || "Dog"}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src = "https://placehold.co/1200x900?text=Photo+Unavailable";
          }}
        />

        {/* Match badge */}
        <div className="absolute left-3 top-3 flex gap-2">
          {showMatch && pctText && label ? (
            <span className="inline-flex items-center rounded-full bg-slate-900/80 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              {pctText} • {label}
            </span>
          ) : null}
        </div>

        {/* Adoptable badge */}
        <div className="absolute right-3 top-3">
          {dog?.adoptable === false ? (
            <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 border border-rose-200">
              Not adoptable
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
              Adoptable
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        <h3 className="text-lg font-semibold text-slate-900">
          {dog?.name || "Unnamed pup"}
        </h3>

        <p className="mt-1 text-sm text-slate-600">
          {dog?.age_years != null && dog.age_years !== "" ? `Age: ${dog.age_years} yrs` : "Age: ?"}
          {dog?.size ? ` • Size: ${toTitle(dog.size)}` : ""}
          {dog?.energy_level ? ` • Energy: ${toTitle(dog.energy_level)}` : ""}
        </p>

        {/* Traits */}
        <div className="mt-3 flex flex-wrap gap-2">
          {dog?.potty_trained ? pill("Potty trained", "bg-blue-50 text-blue-700 border-blue-200") : null}
          {dog?.good_with_kids ? pill("Good w/ kids", "bg-purple-50 text-purple-700 border-purple-200") : null}
          {dog?.good_with_cats ? pill("Good w/ cats", "bg-indigo-50 text-indigo-700 border-indigo-200") : null}
          {dog?.first_time_friendly ? pill("First-time friendly", "bg-teal-50 text-teal-700 border-teal-200") : null}
          {dog?.hypoallergenic ? pill("Hypoallergenic", "bg-emerald-50 text-emerald-700 border-emerald-200") : null}
        </div>

        {/* Shelter */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">Shelter</p>

          {/* ✅ Clickable shelter link */}
          {shelterHref ? (
            <Link
              to={shelterHref}
              className="mt-1 inline-flex text-sm font-semibold text-slate-900 underline decoration-slate-300 hover:decoration-slate-900"
              title="View this shelter/rescue"
            >
              {shelterName}
              <span className="font-normal text-slate-700 no-underline">
                {shelterLocation}
              </span>
            </Link>
          ) : (
            <p className="mt-1 text-sm text-slate-900">
              {shelterName}
              <span className="text-slate-700">{shelterLocation}</span>
            </p>
          )}

          {/* Apply link stays external */}
          {applyUrl ? (
            <a
              href={applyUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex text-sm font-semibold text-slate-900 underline decoration-slate-400 hover:decoration-slate-900"
            >
              Apply / Learn more →
            </a>
          ) : (
            <p className="mt-2 text-xs text-slate-500">No apply link yet</p>
          )}
        </div>

        <div className="mt-4">
          <Link
            to={detailHref}
            className="inline-flex w-full items-center justify-center rounded-full bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-200"
          >
            View profile →
          </Link>
        </div>
      </div>
    </div>
  );
}
