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
    window.dispatchEvent(new Event("hooman:saved_changed"));
  } catch {
    // ignore
  }
}

function isSavedId(id) {
  const ids = readSavedIds();
  return ids.includes(String(id));
}

function toggleSavedId(id) {
  const sid = String(id);
  const ids = readSavedIds();
  const next = ids.includes(sid) ? ids.filter((x) => x !== sid) : [sid, ...ids];
  writeSavedIds(next);
  return next.includes(sid);
}

export default function DogDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [dog, setDog] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(() => isSavedId(id));

  useEffect(() => {
    const sync = () => setSaved(isSavedId(id));
    window.addEventListener("storage", sync);
    window.addEventListener("hooman:saved_changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("hooman:saved_changed", sync);
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const res = await supabase
          .from("dogs")
          .select(
            "*, shelters ( id, name, city, state, apply_url, website, contact_email, logo_url )"
          )
          .eq("id", id)
          .maybeSingle();

        if (res.error) throw res.error;

        if (!cancelled) setDog(res.data || null);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Something went wrong loading this dog.");
          setDog(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const imgSrc = useMemo(() => {
    return dog?.photo_url || dog?.image_url || dog?.photo || "";
  }, [dog]);

  const shelter = dog?.shelters || null;
  const applyUrl = shelter?.apply_url || dog?.apply_url || "";

  function onToggleSaved() {
    const nextSaved = toggleSavedId(id);
    setSaved(nextSaved);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-10 text-slate-600">
          Loading…
        </div>
      </div>
    );
  }

  if (error || !dog) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error || "Dog not found."}
          </div>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            ← Back
          </button>

          <Link to="/" className="flex items-center gap-3" aria-label="Go home">
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-16 w-16 object-contain"
            />
          </Link>

          <Link
            to="/saved"
            className="text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            Saved
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        {/* KEY FIX: items-start prevents the left card from stretching to match the right column height */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 items-start">
          {/* Left: image (self-start ensures it hugs content height) */}
          <div className="self-start rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="relative w-full">
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={dog?.name || "Dog"}
                  className="w-full h-auto object-contain block"
                />
              ) : (
                <div className="flex w-full items-center justify-center py-24 text-sm text-slate-500">
                  No photo
                </div>
              )}

              <button
                type="button"
                onClick={onToggleSaved}
                className={[
                  "absolute right-4 bottom-4 inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition",
                  saved
                    ? "bg-rose-600 text-white border-rose-600"
                    : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50",
                ].join(" ")}
              >
                {saved ? "♥ Saved" : "♡ Save"}
              </button>
            </div>
          </div>

          {/* Right: details */}
          <div className="w-full">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h1 className="text-3xl font-extrabold text-slate-900">
                {dog?.name || "Dog"}
              </h1>

              <div className="mt-2 text-slate-600">
                {dog?.breed ? dog.breed : "Mixed breed"}
                {dog?.age_years !== null && dog?.age_years !== undefined ? (
                  <span> • {dog.age_years} yrs</span>
                ) : null}
                {dog?.size ? <span> • {dog.size}</span> : null}
                {dog?.energy_level ? (
                  <span> • {dog.energy_level} energy</span>
                ) : null}
              </div>

              {/* Hooman Finder role */}
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-bold text-slate-900">
                  Hooman Finder’s role
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  Hooman Finder helps you find dogs that fit your lifestyle. We
                  don’t process adoptions — when you’re ready, you’ll apply
                  directly with the shelter or rescue.
                </p>
              </div>

              {/* Apply */}
              <div className="mt-5">
                <div className="text-sm font-bold text-slate-900">
                  Apply to adopt
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  You’ll be redirected to the shelter’s official application
                  page.
                </p>

                {applyUrl ? (
                  <a
                    href={applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Apply on shelter site
                  </a>
                ) : (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Application link not available yet for this dog.
                  </div>
                )}
              </div>

              {/* Shelter */}
              {shelter && (
                <div className="mt-6 border-t border-slate-200 pt-5">
                  <div className="text-sm font-bold text-slate-900">Listed by</div>

                  <div className="mt-2 flex items-center gap-3">
                    {shelter?.logo_url ? (
                      <img
                        src={shelter.logo_url}
                        alt={shelter.name || "Shelter logo"}
                        className="h-10 w-10 rounded-full object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-slate-200" />
                    )}

                    <div>
                      <div className="font-semibold text-slate-900">
                        {shelter?.name || "Shelter"}
                      </div>
                      <div className="text-sm text-slate-600">
                        {[shelter?.city, shelter?.state].filter(Boolean).join(", ")}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Expectations / what to know */}
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-bold text-slate-900">Things to know</div>

              <div className="mt-3 grid gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    Shelter behavior can look different at home
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    Stress, noise, and routine changes can affect how a dog acts
                    in a shelter versus a home.
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    Traits aren’t guaranteed
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    These details are based on what the shelter knows today —
                    dogs keep learning and adjusting.
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    Accidents can happen in new spaces
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    Even potty-trained dogs may have accidents during the first
                    days in a new home.
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs text-slate-500">
                Tip: Meeting the dog (and asking the shelter about routines) is
                always the best next step.
              </div>
            </div>

            {/* Quick actions */}
            <div className="mt-6 flex gap-3">
              <Link
                to="/saved"
                className="inline-flex flex-1 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
              >
                View saved dogs
              </Link>
              <Link
                to="/quiz"
                className="inline-flex flex-1 items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
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
