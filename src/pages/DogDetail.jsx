// src/pages/DogDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const SAVED_KEY = "hooman_saved_dog_ids_v1";

function readSavedIds() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeSavedIds(ids) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function boolLabel(v) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "Unknown";
}

function textOrUnknown(v) {
  const s = String(v ?? "").trim();
  return s ? s : "Unknown";
}

function numberOrUnknown(v, suffix = "") {
  const n = Number(v);
  if (!Number.isFinite(n)) return "Unknown";
  return `${n}${suffix}`;
}

function chipClass(tone) {
  // simple color variety w/out overthinking
  const base =
    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border";
  switch (tone) {
    case "blue":
      return `${base} bg-blue-50 text-blue-700 border-blue-200`;
    case "green":
      return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
    case "amber":
      return `${base} bg-amber-50 text-amber-800 border-amber-200`;
    case "purple":
      return `${base} bg-violet-50 text-violet-700 border-violet-200`;
    case "pink":
      return `${base} bg-pink-50 text-pink-700 border-pink-200`;
    case "slate":
    default:
      return `${base} bg-slate-50 text-slate-700 border-slate-200`;
  }
}

function traitRow(label, value, tone = "slate") {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="text-sm font-semibold text-slate-800">{label}</div>
      <div className={chipClass(tone)}>{value}</div>
    </div>
  );
}

export default function DogDetail() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [dog, setDog] = useState(null);
  const [error, setError] = useState("");

  const [savedIds, setSavedIds] = useState(() => readSavedIds());

  const isSaved = useMemo(() => savedIds.includes(String(id)), [savedIds, id]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const { data, error: e } = await supabase
          .from("dogs")
          .select(
            "*, shelters ( id, name, city, state, apply_url, website, contact_email, logo_url )"
          )
          .eq("id", id)
          .maybeSingle();

        if (e) throw e;

        if (!cancelled) {
          setDog(data || null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Could not load dog.");
          setDog(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (id) load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function toggleSaved() {
    const sid = String(id);
    const next = isSaved ? savedIds.filter((x) => x !== sid) : [...savedIds, sid];
    setSavedIds(next);
    writeSavedIds(next);
  }

  const shelter = dog?.shelters || null;
  const applyUrl = shelter?.apply_url || dog?.apply_url || dog?.application_url || "";

  // ---- traits you evaluate (always shown) ----
  const traits = useMemo(() => {
    if (!dog) return [];

    // normalize array-ish fields
    const playStyles = Array.isArray(dog.play_styles)
      ? dog.play_styles
      : dog.play_styles
      ? [dog.play_styles]
      : [];

    return [
      { label: "Age", value: numberOrUnknown(dog.age_years, " yrs"), tone: "blue" },
      { label: "Size", value: textOrUnknown(dog.size), tone: "purple" },
      { label: "Energy level", value: textOrUnknown(dog.energy_level), tone: "pink" },

      { label: "Hypoallergenic", value: boolLabel(dog.hypoallergenic), tone: "green" },
      { label: "Potty trained", value: boolLabel(dog.potty_trained), tone: "green" },

      { label: "Good with kids", value: boolLabel(dog.good_with_kids), tone: "amber" },
      { label: "Good with cats", value: boolLabel(dog.good_with_cats), tone: "amber" },
      { label: "Good with other dogs", value: boolLabel(dog.good_with_dogs), tone: "amber" },

      { label: "Shedding", value: textOrUnknown(dog.shedding_level), tone: "slate" },
      { label: "Grooming", value: textOrUnknown(dog.grooming_level), tone: "slate" },

      {
        label: "Play style",
        value: playStyles.length ? playStyles.join(", ") : "Unknown",
        tone: "blue",
      },

      { label: "Noise level", value: textOrUnknown(dog.noise_level), tone: "purple" },
      { label: "Alone time", value: textOrUnknown(dog.alone_time), tone: "purple" },
      {
        label: "Yard needed",
        value:
          typeof dog.yard_required === "boolean"
            ? boolLabel(dog.yard_required)
            : typeof dog.yard === "boolean"
            ? boolLabel(dog.yard)
            : "Unknown",
        tone: "pink",
      },
    ];
  }, [dog]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-10 text-slate-600">Loading…</div>
      </div>
    );
  }

  if (error || !dog) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error || "Dog not found."}
          </div>
          <button
            onClick={() => navigate(-1)}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  const heroImg =
    dog.photo_url ||
    dog.image_url ||
    (Array.isArray(dog.photos) && dog.photos[0]) ||
    "";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-4 grid grid-cols-3 items-center">
          <div>
            <button
              onClick={() => navigate(-1)}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              ← Back
            </button>
          </div>

          <div className="flex justify-center">
            <button onClick={() => navigate("/")} aria-label="Go home">
              <img src="/logo.png" alt="Hooman Finder" className="h-14 w-auto" />
            </button>
          </div>

          <div className="flex justify-end">
            <Link to="/saved" className="text-sm text-slate-600 hover:text-slate-900">
              Saved
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* LEFT: photo card */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="relative">
              {heroImg ? (
                <img
                  src={heroImg}
                  alt={dog.name || "Dog"}
                  className="w-full h-[420px] object-cover"
                />
              ) : (
                <div className="w-full h-[420px] bg-slate-100 flex items-center justify-center text-slate-500">
                  No photo
                </div>
              )}

              <button
                onClick={toggleSaved}
                className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-slate-900 border border-slate-200 shadow-sm hover:bg-white"
              >
                <span aria-hidden="true">{isSaved ? "♥" : "♡"}</span>
                {isSaved ? "Saved" : "Save"}
              </button>
            </div>
          </div>

          {/* RIGHT: info + traits */}
          <div className="space-y-6">
            {/* Top card */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
              <h1 className="text-3xl font-extrabold text-slate-900">
                {textOrUnknown(dog.name)}
              </h1>

              <div className="mt-2 text-slate-600">
                {textOrUnknown(dog.breed)} • {numberOrUnknown(dog.age_years, " yrs")} •{" "}
                {textOrUnknown(dog.size)} • {textOrUnknown(dog.energy_level)}
              </div>

              {/* Role blurb */}
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-extrabold text-slate-900">
                  Hooman Finder’s role
                </div>
                <p className="mt-1 text-sm text-slate-700">
                  Hooman Finder helps you find dogs that fit your lifestyle. We don’t
                  process adoptions — when you’re ready, you’ll apply directly with the
                  shelter or rescue.
                </p>
              </div>

              {/* Apply */}
              <div className="mt-5">
                <div className="text-sm font-extrabold text-slate-900">Apply to adopt</div>
                <p className="mt-1 text-sm text-slate-600">
                  You’ll be redirected to the shelter’s official application page.
                </p>

                <button
                  onClick={() => {
                    if (!applyUrl) return;
                    window.open(applyUrl, "_blank", "noopener,noreferrer");
                  }}
                  disabled={!applyUrl}
                  className={`mt-3 w-full rounded-full px-6 py-3 text-sm font-semibold text-white ${
                    applyUrl ? "bg-slate-900 hover:bg-slate-800" : "bg-slate-300 cursor-not-allowed"
                  }`}
                >
                  Apply on shelter site
                </button>
              </div>

              {/* Listed by */}
              <div className="mt-6 pt-5 border-t border-slate-200">
                <div className="text-sm font-extrabold text-slate-900">Listed by</div>

                <div className="mt-3 flex items-center gap-3">
                  {shelter?.logo_url ? (
                    <img
                      src={shelter.logo_url}
                      alt={shelter?.name || "Shelter"}
                      className="h-10 w-10 rounded-full object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200" />
                  )}

                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">
                      {textOrUnknown(shelter?.name)}
                    </div>
                    <div className="text-sm text-slate-600">
                      {[shelter?.city, shelter?.state].filter(Boolean).join(", ") || "Unknown"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Traits card (always shows everything) */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-slate-900">Traits</h2>
                <span className="text-xs text-slate-500">
                  Unknown means the shelter hasn’t provided it yet.
                </span>
              </div>

              <div className="mt-4 divide-y divide-slate-100">
                {traits.map((t) => (
                  <div key={t.label}>{traitRow(t.label, t.value, t.tone)}</div>
                ))}
              </div>
            </div>

            {/* Things to know (collapsible pill) */}
            <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer list-none px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center rounded-full bg-slate-900 text-white px-3 py-1 text-xs font-extrabold">
                    Things to know
                  </span>
                  <span className="text-sm text-slate-600">
                    Tap to expand
                  </span>
                </div>

                <span className="text-slate-500 group-open:rotate-180 transition-transform">
                  ▼
                </span>
              </summary>

              <div className="px-6 pb-6">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-extrabold text-slate-900">
                      Shelter behavior can look different at home
                    </div>
                    <p className="mt-1 text-sm text-slate-700">
                      Stress, noise, and routine changes can affect how a dog acts in a
                      shelter versus a home.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-extrabold text-slate-900">
                      Traits aren’t guaranteed
                    </div>
                    <p className="mt-1 text-sm text-slate-700">
                      These details are based on what the shelter knows today — dogs keep
                      learning and adjusting.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-extrabold text-slate-900">
                      Accidents can happen in new spaces
                    </div>
                    <p className="mt-1 text-sm text-slate-700">
                      Even potty-trained dogs may have accidents during the first days in
                      a new home.
                    </p>
                  </div>

                  <div className="text-sm text-slate-500 pt-2">
                    Tip: Meeting the dog (and asking the shelter about routines) is always
                    the best next step.
                  </div>
                </div>
              </div>
            </details>

            {/* Bottom actions */}
            <div className="flex items-center gap-4">
              <Link
                to="/saved"
                className="flex-1 inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
              >
                View saved dogs
              </Link>
              <Link
                to="/quiz"
                className="flex-1 inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Retake quiz
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
