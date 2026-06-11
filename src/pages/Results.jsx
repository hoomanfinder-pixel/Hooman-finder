// src/pages/Results.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import DogCard from "../components/DogCard";
import SEO from "../components/SEO";
import SiteFooter from "../components/SiteFooter";

import {
  getActiveQuizSessionId,
  loadQuizResponses,
  setActiveQuizSessionId,
} from "../lib/quizStorage";
import { computeRankedMatches } from "../lib/matchingLogic";
import { filterPublicDogs } from "../lib/dogVisibility";
import { getDogSourceFilterId, getDogSourceName } from "../lib/dogSource";
import { supabase } from "../lib/supabase";
import { QUIZ_MODES } from "../lib/quizQuestions";

const AGE_OPTIONS = [
  { label: "All ages", value: "all" },
  { label: "Puppy", value: "puppy" },
  { label: "Adult", value: "adult" },
  { label: "Senior", value: "senior" },
];

const SIZE_OPTIONS = [
  { label: "All sizes", value: "all" },
  { label: "Small", value: "Small" },
  { label: "Medium", value: "Medium" },
  { label: "Large", value: "Large" },
];

const ENERGY_OPTIONS = [
  { label: "All energy", value: "all" },
  { label: "Low", value: "Low" },
  { label: "Moderate", value: "Moderate" },
  { label: "High", value: "High" },
];

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

function normalizeAgeBucket(ageYears, ageText) {
  const n = Number(ageYears);

  if (Number.isFinite(n)) {
    if (n < 2) return "puppy";
    if (n < 7) return "adult";
    return "senior";
  }

  const text = String(ageText || "").toLowerCase();

  if (text.includes("puppy")) return "puppy";
  if (text.includes("senior")) return "senior";

  const yearMatch = text.match(/(\d+)\s*year/);
  if (yearMatch) {
    const years = Number(yearMatch[1]);
    if (years < 2) return "puppy";
    if (years < 7) return "adult";
    return "senior";
  }

  return null;
}

function getShelterId(dog) {
  return getDogSourceFilterId(dog) || "";
}

function getShelterName(dog) {
  return getDogSourceName(dog);
}

export default function Results() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionFromUrl = searchParams.get("session") || "";
  const sessionId = sessionFromUrl || getActiveQuizSessionId();

  const [answersById, setAnswersById] = useState({});
  const [dogs, setDogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef(null);

  const [rescueFilter, setRescueFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [energyFilter, setEnergyFilter] = useState("all");

  const [hypoOnly, setHypoOnly] = useState(false);
  const [pottyOnly, setPottyOnly] = useState(false);
  const [kidsOnly, setKidsOnly] = useState(false);
  const [catsOnly, setCatsOnly] = useState(false);
  const [dogsOnly, setDogsOnly] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    setActiveQuizSessionId(sessionId);

    if (!sessionFromUrl) {
      const next = new URLSearchParams(searchParams);
      next.set("session", sessionId);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionFromUrl, sessionId]);

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        setLoading(true);
        setErr("");

        if (!sessionId) {
          setErr("Missing session id. Please return to the quiz.");
          return;
        }

        const { answersById: loadedAnswers } = await loadQuizResponses(sessionId);

        const { data, error } = await supabase
          .from("dogs")
          .select(DOG_SELECT)
          .eq("adoptable", true)
          .in("availability_status", ["available", "active", "unknown"])
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (!mounted) return;

        setAnswersById(loadedAnswers || {});
        setDogs(filterPublicDogs(data));
      } catch (e) {
        if (!mounted) return;
        setErr(e?.message || String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    run();

    return () => {
      mounted = false;
    };
  }, [sessionId]);

  const rescueOptions = useMemo(() => {
    const map = new Map();

    dogs.forEach((dog) => {
      if (dog.urgency_level === "Adopted") return;

      const id = getShelterId(dog);
      const name = getShelterName(dog);

      if (!id) return;

      if (!map.has(id)) {
        map.set(id, {
          id,
          name,
          count: 0,
        });
      }

      map.get(id).count += 1;
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [dogs]);

  const rankedRows = useMemo(
    () => computeRankedMatches(dogs, answersById),
    [dogs, answersById]
  );

  const filteredRows = useMemo(() => {
    return rankedRows.filter((row) => {
      const dog = row.dog;

      if (dog?.urgency_level === "Adopted") return false;

      if (rescueFilter !== "all") {
        const shelterId = getShelterId(dog);
        if (shelterId !== rescueFilter) return false;
      }

      if (ageFilter !== "all") {
        const bucket = normalizeAgeBucket(dog?.age_years, dog?.age_text);
        if (bucket !== ageFilter) return false;
      }

      if (sizeFilter !== "all" && dog?.size !== sizeFilter) return false;
      if (energyFilter !== "all" && dog?.energy_level !== energyFilter) return false;

      if (hypoOnly && !dog?.hypoallergenic) return false;
      if (pottyOnly && !dog?.potty_trained) return false;
      if (kidsOnly && !dog?.good_with_kids) return false;
      if (catsOnly && !dog?.good_with_cats) return false;
      if (dogsOnly && dog?.good_with_dogs !== true) return false;

      return true;
    });
  }, [
    rankedRows,
    rescueFilter,
    ageFilter,
    sizeFilter,
    energyFilter,
    hypoOnly,
    pottyOnly,
    kidsOnly,
    catsOnly,
    dogsOnly,
  ]);

  const activeFilterCount = [
    rescueFilter !== "all",
    ageFilter !== "all",
    sizeFilter !== "all",
    energyFilter !== "all",
    hypoOnly,
    pottyOnly,
    kidsOnly,
    catsOnly,
    dogsOnly,
  ].filter(Boolean).length;

  function resetFilters() {
    setRescueFilter("all");
    setAgeFilter("all");
    setSizeFilter("all");
    setEnergyFilter("all");
    setHypoOnly(false);
    setPottyOnly(false);
    setKidsOnly(false);
    setCatsOnly(false);
    setDogsOnly(false);
  }

  function toggleFilters() {
    setFiltersOpen((current) => {
      const next = !current;
      if (next) {
        window.requestAnimationFrame(() => {
          filtersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return next;
    });
  }

  function goRefine() {
    navigate(`/quiz?session=${encodeURIComponent(sessionId)}&mode=${QUIZ_MODES.REFINE}`);
  }

  function goDealbreakers() {
    navigate(
      `/quiz?session=${encodeURIComponent(sessionId)}&mode=${QUIZ_MODES.DEALBREAKERS}`
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f1e9] text-[#050505]">
      <SEO
        title="Your Dog Adoption Matches | Hooman Finder"
        description="View your ranked adoptable dog matches based on your quiz answers and available dog details."
        canonicalPath="/results"
        ogImage="/home-hero-dogs.jpg"
        ogImageAlt="Dog adoption matches from Hooman Finder"
        noindex
      />
      <header className="sticky top-0 z-50 border-b border-stone-950/10 bg-[#f5f1e9]/94 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3.5 py-2 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex h-9 w-12 shrink-0 items-center justify-center rounded-xl bg-white/75 p-1.5 ring-1 ring-stone-950/8 sm:h-10 sm:w-14"
            aria-label="Go home"
          >
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-full w-full object-contain"
            />
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goRefine}
              className="hidden rounded-full border border-stone-950/15 bg-white/55 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-700 hover:bg-white sm:inline-flex"
            >
              Refine
            </button>

            <button
              type="button"
              onClick={toggleFilters}
              className="inline-flex min-h-9 items-center rounded-full bg-stone-950 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-sm hover:bg-stone-800 sm:min-h-10 sm:px-4 sm:text-[11px]"
            >
              Filter
              {activeFilterCount > 0 ? (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[10px] text-stone-950">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-3.5 pb-28 pt-1.5 sm:px-6 sm:py-5 lg:px-8">
        <section className="pb-1 sm:pb-1.5">
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/dogs"
              className="text-[10px] font-black uppercase tracking-[0.24em] text-[#6f6a66] hover:text-stone-950"
            >
              ← Back to browse
            </Link>

            <button
              type="button"
              onClick={goDealbreakers}
              className="inline-flex shrink-0 rounded-full border border-stone-950/10 bg-white/70 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-stone-600 hover:bg-white sm:hidden"
            >
              Edit Quiz
            </button>
          </div>

          <div className="mt-1 flex flex-col gap-1.5 sm:mt-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#6f6a66]">
                Your matches
              </p>

              <h1 className="mt-1 max-w-2xl text-[2rem] font-black leading-[0.9] text-[#050505] sm:text-5xl">
                Your best-fit dogs, ranked.
              </h1>

              <p className="mt-1 max-w-2xl text-sm font-semibold leading-5 text-[#6f6a66] sm:mt-1.5 sm:text-base sm:leading-6">
                Ranked adoptable dog matches based on your quiz answers and the dog details currently available from rescues.
              </p>

              {err ? (
                <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {err}
                </div>
              ) : null}
            </div>
          </div>

        </section>

        {filtersOpen ? (
          <section
            ref={filtersRef}
            className="mt-2 scroll-mt-20 rounded-[1.5rem] border border-stone-950/10 bg-white p-4 shadow-lg shadow-stone-950/5 sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-stone-950">
                  Fine-tune matches
                </h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-[#6f6a66]">
                  Narrow your ranked rescue dog matches without losing your quiz scoring.
                </p>
              </div>

              <button
                type="button"
                onClick={resetFilters}
                className="shrink-0 text-xs font-bold uppercase tracking-[0.16em] text-stone-500 underline underline-offset-4 hover:text-stone-950"
              >
                Reset
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="col-span-2 text-xs font-bold uppercase tracking-[0.14em] text-stone-600 md:col-span-1">
                Rescue
                <select
                  value={rescueFilter}
                  onChange={(e) => setRescueFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-950/15 bg-[#f5f1e9] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-stone-950"
                >
                  <option value="all">All rescues</option>
                  {rescueOptions.map((rescue) => (
                    <option key={rescue.id} value={rescue.id}>
                      {rescue.name} ({rescue.count})
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.14em] text-stone-600">
                Age
                <select
                  value={ageFilter}
                  onChange={(e) => setAgeFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-950/15 bg-[#f5f1e9] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-stone-950"
                >
                  {AGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.14em] text-stone-600">
                Size
                <select
                  value={sizeFilter}
                  onChange={(e) => setSizeFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-950/15 bg-[#f5f1e9] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-stone-950"
                >
                  {SIZE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.14em] text-stone-600">
                Energy
                <select
                  value={energyFilter}
                  onChange={(e) => setEnergyFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-950/15 bg-[#f5f1e9] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-stone-950"
                >
                  {ENERGY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {[
                ["Hypoallergenic", hypoOnly, setHypoOnly],
                ["Potty trained", pottyOnly, setPottyOnly],
                ["Kids", kidsOnly, setKidsOnly],
                ["Cats", catsOnly, setCatsOnly],
                ["Dogs", dogsOnly, setDogsOnly],
              ].map(([label, checked, setter]) => (
                <label
                  key={label}
                  className={[
                    "shrink-0 rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]",
                    checked
                      ? "border-stone-950 bg-stone-950 text-white"
                      : "border-stone-950/15 bg-[#f5f1e9] text-stone-600",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setter(e.target.checked)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="mt-4 w-full rounded-full bg-stone-950 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-white hover:bg-stone-800"
            >
              Show {filteredRows.length} matches
            </button>
          </section>
        ) : null}

        {loading ? (
          <div className="mt-5 rounded-[1.35rem] border border-stone-950/10 bg-white/60 p-5 text-sm font-semibold text-stone-600">
            Loading matches…
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="mt-5 rounded-[1.6rem] border border-stone-950/10 bg-white/62 p-5">
            <h2 className="text-2xl font-black text-stone-950">
              No dogs match your current filters.
            </h2>

            <p className="mt-2 text-sm leading-6 text-stone-600">
              Try clearing filters or refining your quiz answers.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-2xl bg-stone-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white"
              >
                Clear filters
              </button>

              <button
                type="button"
                onClick={goRefine}
                className="rounded-2xl border border-stone-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-stone-950"
              >
                Refine quiz
              </button>
            </div>
          </div>
        ) : (
          <section className="mt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.24em] text-stone-500">
                Ranked matches
              </h2>

              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500 underline underline-offset-4 hover:text-stone-950"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {filteredRows.map((row, idx) => (
                <DogCard
                  key={row.dog?.id ?? idx}
                  dog={row.dog}
                  showMatch
                  scorePct={row.scorePct}
                  breakdown={row.breakdown}
                  sessionId={sessionId}
                  variant="match"
                  rank={idx + 1}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
