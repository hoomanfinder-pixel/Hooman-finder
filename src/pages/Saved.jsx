// src/pages/Saved.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import DogCard from "../components/DogCard";
import SEO from "../components/SEO";
import SiteFooter from "../components/SiteFooter";
import { filterPublicDogs } from "../lib/dogVisibility";

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
          .in("id", savedIds)
          .in("availability_status", ["available", "active", "unknown"]);

        if (fetchError) throw fetchError;

        const rows = filterPublicDogs(data);
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

  const count = useMemo(() => dogs.length, [dogs]);

  return (
    <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#0F2742]">
      <SEO
        title="Saved Adoptable Dogs | Hooman Finder"
        description="Review the adoptable dogs you saved while browsing Hooman Finder."
        canonicalPath="/saved"
        ogImage="/home-hero-dogs.jpg"
        ogImageAlt="Saved adoptable dogs on Hooman Finder"
        noindex
      />
      <header className="sticky top-0 z-50 border-b border-[#0F2742]/10 bg-[#F5F1E9]/92 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-xs font-bold uppercase tracking-[0.14em] text-[#6F6A66] hover:text-[#0F2742]"
          >
            ← Back
          </button>

          <Link to="/" className="shrink-0" aria-label="Go home">
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-9 w-auto object-contain sm:h-11"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          </Link>

          <Link
            to="/dogs"
            className="text-xs font-bold uppercase tracking-[0.14em] text-[#6F6A66] hover:text-[#0F2742]"
          >
            Browse
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-3.5 py-4 sm:px-6 sm:py-8">
        <section className="pb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#6F6A66]">
            Your shortlist
          </p>

          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <h1 className="font-['Fraunces',serif] text-[2.65rem] font-semibold leading-[1.02] tracking-[-0.02em] text-[#0F2742] sm:text-6xl">
                Saved
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-[#6F6A66] sm:text-base">
                Review dogs you've saved, then open a profile to continue with the listing shelter or rescue.
              </p>
            </div>

            <Link
              to="/dogs"
              className="hidden rounded-full border border-[#0F2742] bg-[#0F2742] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#F3C982] hover:bg-[#0C1E35] sm:inline-flex"
            >
              Browse more
            </Link>
          </div>

          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6F6A66]">
            <span className="shrink-0 rounded-full border border-[#0F2742]/10 bg-white/58 px-3 py-2">
              {count} saved dog{count === 1 ? "" : "s"}
            </span>

            <Link
              to="/quiz"
              className="shrink-0 rounded-full border border-[#0F2742]/10 bg-white/58 px-3 py-2 hover:bg-white"
            >
              Find my match
            </Link>
          </div>
        </section>

        {loading ? (
          <div className="mt-4 rounded-[1.35rem] border border-[#0F2742]/10 bg-white/60 p-5 text-sm font-semibold text-[#6F6A66]">
            Loading saved dogs…
          </div>
        ) : error ? (
          <div className="mt-4 rounded-[1.35rem] border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : !savedIds.length ? (
          <div className="mt-4 rounded-[1.6rem] border border-[#0F2742]/10 bg-white/62 p-5">
            <div className="text-4xl">♡</div>

            <h2 className="mt-3 font-['Fraunces',serif] text-2xl font-semibold tracking-[-0.01em] text-[#0F2742]">
              No saved dogs yet.
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#6F6A66]">
              Tap the heart on any dog card to build your shortlist.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/dogs"
                className="rounded-2xl bg-[#0F2742] px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.16em] text-[#F3C982] hover:bg-[#0C1E35]"
              >
                Browse dogs
              </Link>

              <Link
                to="/quiz"
                className="rounded-2xl border border-[#0F2742] px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.16em] text-[#0F2742]"
              >
                Take quiz
              </Link>
            </div>
          </div>
        ) : dogs.length === 0 ? (
          <div className="mt-4 rounded-[1.35rem] border border-[#0F2742]/10 bg-white/60 p-5 text-sm leading-6 text-[#6F6A66]">
            Saved dogs couldn't be loaded. They may have been removed or marked unavailable.
          </div>
        ) : (
          <section className="mt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#6F6A66]">
                Saved picks
              </h2>

              <span className="rounded-full border border-[#0F2742]/10 bg-white/58 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6F6A66]">
                {dogs.length} loaded
              </span>
            </div>

            <div className="space-y-3">
              {dogs.map((dog) => (
                <DogCard key={dog.id} dog={dog} showMatch={false} variant="saved" />
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
