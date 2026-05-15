// src/pages/Saved.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import DogCard from "../components/DogCard";
import SiteFooter from "../components/SiteFooter";

const SAVED_KEY = "hooman_saved_dog_ids_v1";

const DOG_SELECT = `
  *,
  shelters (
    id,
    name,
    website,
    apply_url,
    logo_url,
    city,
    state
  )
`;

function readSavedIds() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function Saved() {
  const navigate = useNavigate();

  const [savedIds, setSavedIds] = useState(() => readSavedIds());
  const [loading, setLoading] = useState(true);
  const [dogs, setDogs] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === SAVED_KEY) setSavedIds(readSavedIds());
    };

    const onCustom = () => setSavedIds(readSavedIds());

    window.addEventListener("storage", onStorage);
    window.addEventListener("hooman:saved_changed", onCustom);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("hooman:saved_changed", onCustom);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      setDogs([]);
      setLoading(true);

      try {
        if (!savedIds.length) {
          if (!cancelled) {
            setDogs([]);
            setLoading(false);
          }
          return;
        }

        const { data, error: fetchError } = await supabase
          .from("dogs")
          .select(DOG_SELECT)
          .in("id", savedIds);

        if (fetchError) throw fetchError;

        const rows = Array.isArray(data) ? data : [];

        const map = new Map(rows.map((dog) => [String(dog.id), dog]));
        const ordered = savedIds.map((id) => map.get(String(id))).filter(Boolean);

        if (!cancelled) setDogs(ordered);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Something went wrong loading saved dogs.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [savedIds]);

  const count = useMemo(() => savedIds.length, [savedIds]);

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-stone-950">
      <header className="sticky top-0 z-50 border-b border-stone-950/10 bg-[#f4f1ea]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button
            onClick={() => navigate(-1)}
            className="text-xs font-bold uppercase tracking-[0.16em] text-stone-600 hover:text-stone-950"
          >
            ← Back
          </button>

          <Link to="/" className="shrink-0" aria-label="Go home">
            <img src="/logo.png" alt="Hooman Finder" className="h-10 w-auto object-contain sm:h-12" />
          </Link>

          <Link
            to="/dogs"
            className="text-xs font-bold uppercase tracking-[0.16em] text-stone-600 hover:text-stone-950"
          >
            Browse
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <section className="border-b border-stone-950/15 pb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-stone-500">
            Your collection
          </p>

          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="max-w-2xl text-4xl font-semibold leading-[0.9] tracking-[-0.055em] text-stone-950 sm:text-6xl">
                Saved dogs.
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
                You’ve saved{" "}
                <span className="font-bold text-stone-950">{count}</span> dog
                {count === 1 ? "" : "s"}. Come back here when you want to compare
                favorites or apply through a rescue.
              </p>
            </div>

            <Link
              to="/dogs"
              className="inline-flex items-center justify-center border border-stone-950 bg-stone-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white hover:bg-transparent hover:text-stone-950"
            >
              Browse more
            </Link>
          </div>
        </section>

        {loading ? (
          <div className="mt-6 border border-stone-950/10 bg-white/55 p-5 text-sm font-semibold text-stone-600">
            Loading saved dogs…
          </div>
        ) : error ? (
          <div className="mt-6 border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : !savedIds.length ? (
          <div className="mt-6 border border-stone-950/10 bg-white/55 p-5">
            <h2 className="text-2xl font-semibold tracking-[-0.035em] text-stone-950">
              No saved dogs yet.
            </h2>

            <p className="mt-2 text-sm leading-6 text-stone-600">
              Tap the heart on any dog card to build your shortlist.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/dogs"
                className="bg-stone-950 px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.16em] text-white"
              >
                Browse dogs
              </Link>

              <Link
                to="/quiz"
                className="border border-stone-950 px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.16em] text-stone-950"
              >
                Take quiz
              </Link>
            </div>
          </div>
        ) : dogs.length === 0 ? (
          <div className="mt-6 border border-stone-950/10 bg-white/55 p-5 text-sm leading-6 text-stone-700">
            Saved dogs couldn’t be loaded. They may have been removed or marked
            unavailable.
          </div>
        ) : (
          <section className="mt-5 sm:mt-7">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.24em] text-stone-500">
                Saved picks
              </h2>

              <span className="border border-stone-950/10 bg-white/45 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                {dogs.length} loaded
              </span>
            </div>

            <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
              {dogs.map((dog, index) => (
                <div
                  key={dog.id}
                  className={[
                    "mb-4 break-inside-avoid",
                    index % 5 === 1 ? "sm:pt-8" : "",
                    index % 7 === 3 ? "lg:pt-10" : "",
                  ].join(" ")}
                >
                  <DogCard dog={dog} showMatch={false} />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}