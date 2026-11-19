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
  ),
  ingestion_sources (
    id,
    source_type,
    external_org_id,
    enabled,
    publication_eligible,
    last_successful_sync_at
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
  const [missingIds, setMissingIds] = useState([]);
  const [unavailableIds, setUnavailableIds] = useState([]);
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
      setMissingIds([]);
      setUnavailableIds([]);
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

        const allRows = Array.isArray(data) ? data : [];
        const rows = filterPublicDogs(allRows);
        const map = new Map(rows.map((dog) => [String(dog.id), dog]));
        const ordered = savedIds.map((id) => map.get(String(id))).filter(Boolean);
        const foundIds = new Set(allRows.map((dog) => String(dog.id)));
        const savedIdSet = new Set(savedIds.map(String));
        const unresolved = savedIds.filter((id) => !foundIds.has(String(id)));
        const notPublic = allRows
          .filter((dog) => savedIdSet.has(String(dog.id)) && !map.has(String(dog.id)))
          .map((dog) => String(dog.id));

        if (!cancelled) {
          setDogs(ordered);
          setMissingIds([...new Set(unresolved)]);
          setUnavailableIds([...new Set(notPublic)]);
        }
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
  const unavailableCount = missingIds.length + unavailableIds.length;

  function clearUnavailableSaves() {
    const unavailableSet = new Set([...missingIds, ...unavailableIds]);
    const nextSavedIds = savedIds.filter((id) => !unavailableSet.has(String(id)));

    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(nextSavedIds));
    } catch {
      // Keep the current view usable when browser storage is unavailable.
    }

    setSavedIds(nextSavedIds);
    window.dispatchEvent(new Event("hooman:saved_changed"));
  }

  const unavailableDetails = (
    <>
      {unavailableIds.length > 0 ? (
        <span>
          {unavailableIds.length} saved {unavailableIds.length === 1 ? "listing is" : "listings are"} no longer in the public catalog.
        </span>
      ) : null}{" "}
      {missingIds.length > 0 ? (
        <span>
          {missingIds.length} saved {missingIds.length === 1 ? "listing could" : "listings could"} not be found.
        </span>
      ) : null}
    </>
  );

  return (
    <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#183D35]">
      <SEO
        title="Saved Adoptable Dogs | Hooman Finder"
        description="Review the adoptable dogs you saved while browsing Hooman Finder."
        canonicalPath="/saved"
        ogImage="/home-hero-dogs.jpg"
        ogImageAlt="Saved adoptable dogs on Hooman Finder"
        noindex
      />
      <header className="sticky top-0 z-50 border-b border-[#183D35]/10 bg-[#F5F1E9]/92 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-xs font-bold uppercase tracking-[0.14em] text-[#6F6A66] hover:text-[#183D35]"
          >
            ← Back
          </button>

          <Link to="/" className="shrink-0" aria-label="Go home">
            <img
              src="/logo-180.png"
              alt="Hooman Finder"
              className="h-9 w-auto object-contain sm:h-11"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          </Link>

          <Link
            to="/dogs"
            className="text-xs font-bold uppercase tracking-[0.14em] text-[#6F6A66] hover:text-[#183D35]"
          >
            Browse
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-3.5 pb-8 pt-3 sm:px-6 sm:py-6">
        <section className="rounded-[1.5rem] bg-[#183D35] px-4 py-5 text-white shadow-[0_14px_38px_rgba(24,61,53,0.16)] sm:rounded-[2rem] sm:px-7 sm:py-7">
          <Link to="/dogs" className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70 hover:text-[#F3C982]">
            ← Continue browsing
          </Link>

          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.27em] text-[#F3C982]">Your shortlist</p>
              <h1 className="mt-1 font-['Fraunces',serif] text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.02em] text-white sm:text-6xl">
                Saved dogs
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-white/75 sm:text-base">
                A thoughtful shortlist to revisit. Open a profile to learn more and continue with the shelter or rescue.
              </p>
            </div>

            <Link
              to="/quiz"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#F3C982] px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#183D35] transition hover:bg-[#f7d695] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Find my match
            </Link>
          </div>

          <div className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">
            <span className="shrink-0 rounded-full bg-white/10 px-3 py-2 ring-1 ring-white/15">
              {count} saved dog{count === 1 ? "" : "s"}
            </span>
          </div>
        </section>

        {loading ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <p role="status" className="sr-only">
              Loading saved dogs.
            </p>
            {Array.from({ length: Math.max(1, savedIds.length) }).map((_, index) => (
              <div
                key={index}
                aria-hidden="true"
                className="rounded-[1.5rem] bg-white p-3 shadow-sm ring-1 ring-[#183D35]/8"
              >
                <div className="hf-skeleton aspect-[16/10] rounded-[1.1rem] sm:aspect-[4/3]" />
                <div className="space-y-2 py-1">
                  <div className="hf-skeleton h-5 w-1/2 rounded-full" />
                  <div className="hf-skeleton h-3 w-1/3 rounded-full" />
                  <div className="hf-skeleton h-3 w-2/3 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="mt-5 rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-red-200" role="alert">
            <h2 className="font-['Fraunces',serif] text-2xl font-semibold text-[#183D35]">We couldn’t load your shortlist.</h2>
            <p className="mt-2 text-sm leading-6 text-[#6F6A66]">Your saved dogs are still stored on this device. Check your connection and try again.</p>
            <button type="button" onClick={() => setSavedIds(readSavedIds())} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#183D35] px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#F3C982]">Try again</button>
          </div>
        ) : !savedIds.length ? (
          <div className="mt-5 rounded-[1.6rem] bg-white px-5 py-7 shadow-sm ring-1 ring-[#183D35]/8 sm:px-8" aria-labelledby="saved-empty-title">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef3e8] text-3xl text-[#183D35]" aria-hidden="true">♡</div>

            <h2 id="saved-empty-title" className="mt-4 font-['Fraunces',serif] text-3xl font-semibold tracking-[-0.01em] text-[#183D35]">
              Your shortlist starts here.
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#6F6A66]">
              Tap the heart on any dog card to build your shortlist.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/dogs"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#183D35] px-5 py-3 text-center text-xs font-black uppercase tracking-[0.14em] text-[#F3C982] hover:bg-[#12332C]"
              >
                Browse dogs
              </Link>

              <Link
                to="/quiz"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#183D35]/20 px-5 py-3 text-center text-xs font-black uppercase tracking-[0.14em] text-[#183D35]"
              >
                Take quiz
              </Link>
            </div>
          </div>
        ) : savedIds.length > 0 && dogs.length === 0 ? (
          <div className="mt-5 rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-[#183D35]/8" aria-labelledby="saved-unavailable-title">
            <h2 id="saved-unavailable-title" className="font-['Fraunces',serif] text-2xl font-semibold text-[#183D35]">Your saved dogs aren’t available to show.</h2>
            <p className="mt-2 text-sm leading-6 text-[#6F6A66]">
              {unavailableDetails} This can happen when a listing is removed or its availability changes, but it does not confirm that a dog was adopted.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/dogs" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#183D35] px-5 text-xs font-black uppercase tracking-[0.12em] text-[#F3C982]">Browse dogs</Link>
              <button type="button" onClick={clearUnavailableSaves} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#183D35]/20 px-5 text-xs font-black uppercase tracking-[0.12em] text-[#183D35]">
                Clear unavailable {unavailableCount === 1 ? "save" : "saves"}
              </button>
            </div>
          </div>
        ) : (
          <section className="mt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#6F6A66]">
                Saved picks
              </h2>

              <span className="rounded-full border border-[#183D35]/10 bg-white/58 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6F6A66]">
                {count} saved
              </span>
            </div>

            <div className="grid items-start gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
              {dogs.map((dog) => (
                <DogCard key={dog.id} dog={dog} showMatch={false} variant="saved" />
              ))}
            </div>
          </section>
        )}

        {!loading && !error && unavailableCount > 0 && dogs.length > 0 ? (
          <aside className="mt-5 rounded-2xl bg-[#fff9eb] p-4 text-amber-950 ring-1 ring-amber-300" aria-labelledby="saved-partial-title">
            <h2 id="saved-partial-title" className="font-['Fraunces',serif] text-xl font-semibold">Some saved dogs aren’t available to show.</h2>
            <p className="mt-1 text-sm leading-6">
              {unavailableDetails} This does not confirm that a dog was adopted.
            </p>
            <button type="button" onClick={clearUnavailableSaves} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-amber-950/20 bg-white/55 px-5 text-xs font-black uppercase tracking-[0.12em] text-amber-950 hover:bg-white">
              Clear unavailable {unavailableCount === 1 ? "save" : "saves"}
            </button>
          </aside>
        ) : null}
      </main>

      <SiteFooter />
    </div>
  );
}
