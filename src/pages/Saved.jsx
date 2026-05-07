// src/pages/Saved.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import DogCard from "../components/DogCard";

const SAVED_KEY = "hooman_saved_dog_ids_v1";

// Fetch dogs plus shelter/rescue info.
// Only include columns that exist in your shelters table.
const DOG_SELECT = `
  *,
  shelters (
    id,
    name,
    city,
    state,
    logo_url
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

        // Keep the same order as savedIds.
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
            <img src="/logo.png" alt="Hooman Finder" className="h-16 w-16 object-contain" />
          </Link>

          <div className="w-[72px]" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900">Saved dogs</h1>
            <p className="mt-2 text-slate-600">
              You’ve saved <span className="font-semibold text-slate-900">{count}</span> dog
              {count === 1 ? "" : "s"}.
            </p>
          </div>

          <Link
            to="/dogs"
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Browse more dogs
          </Link>
        </div>

        {loading ? (
          <div className="mt-10 text-slate-600">Loading…</div>
        ) : error ? (
          <div className="mt-10 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        ) : !savedIds.length ? (
          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-lg font-bold text-slate-900">No saved dogs yet</div>
            <p className="mt-2 text-slate-600">
              Tap the heart on any dog to save them here.
            </p>
            <div className="mt-4">
              <Link
                to="/dogs"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Browse dogs
              </Link>
            </div>
          </div>
        ) : dogs.length === 0 ? (
          <div className="mt-10 rounded-xl border border-slate-200 bg-white p-4 text-slate-700">
            Saved dogs couldn’t be loaded. They may have been removed.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {dogs.map((dog) => (
              <DogCard key={dog.id} dog={dog} showMatch={false} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}