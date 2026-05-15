// src/pages/Results.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import DogCard from "../components/DogCard";
import SiteFooter from "../components/SiteFooter";

import { loadQuizResponses } from "../lib/quizStorage";
import { computeRankedMatches } from "../lib/matchingLogic";
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
  return dog?.shelters?.id || dog?.shelter_id || "";
}

function getShelterName(dog) {
  return dog?.shelters?.name || dog?.shelter_name || "Shelter or rescue";
}

export default function Results() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session") || "";

  const [answersById, setAnswersById] = useState({});
  const [dogs, setDogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

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
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (!mounted) return;

        setAnswersById(loadedAnswers || {});
        setDogs(Array.isArray(data) ? data : []);
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

  const topRow = filteredRows[0] || null;
  const remainingRows = filteredRows.slice(1);

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

  function goRefine() {
    navigate(`/quiz?session=${encodeURIComponent(sessionId)}&mode=${QUIZ_MODES.REFINE}`);
  }

  function goDealbreakers() {
    navigate(
      `/quiz?session=${encodeURIComponent(sessionId)}&mode=${QUIZ_MODES.DEALBREAKERS}`
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-stone-950">
      <header className="sticky top-0 z-50 border-b border-stone-950/10 bg-[#f4f1ea]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="shrink-0" aria-label="Go home">
            <img src="/logo.png" alt="Hooman Finder" className="h-10 w-auto object-contain sm:h-12" />
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={goDealbreakers}
              className="hidden border border-stone-950/15 bg-white/45 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-stone-700 hover:bg-white sm:inline-flex"
            >
              Deal breakers
            </button>

            <button
              onClick={goRefine}
              className="inline-flex bg-stone-950 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-white hover:bg-stone-800"
            >
              Refine
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <section className="border-b border-stone-950/15 pb-5">
          <Link
            to="/dogs"
            className="text-[10px] font-bold uppercase tracking-[0.24em] text-stone-500 hover:text-stone-950"
          >
            ← Back to browse
          </Link>

          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-stone-500">
                Your matches
              </p>

              <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-[0.9] tracking-[-0.055em] text-stone-950 sm:text-6xl">
                Your best-fit dogs, ranked.
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
                These matches are based on your quiz answers and the dog details
                currently available from rescues.
              </p>

              {err ? <div className="mt-3 text-sm font-semibold text-red-600">{err}</div> : null}
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              className="inline-flex items-center justify-center border border-stone-950 bg-stone-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white hover:bg-transparent hover:text-stone-950"
            >
              {filtersOpen ? "Hide filters" : "Filter"}
              {activeFilterCount > 0 ? (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[10px] text-stone-950">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>

          <div className="mt-5 flex gap-3 overflow-x-auto pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
            <span className="shrink-0 border border-stone-950/10 bg-white/45 px-3 py-2">
              {loading ? "Loading" : `${filteredRows.length} showing`}
            </span>
            <span className="shrink-0 border border-stone-950/10 bg-white/45 px-3 py-2">
              {rankedRows.length || 0} ranked
            </span>
            <button
              onClick={goDealbreakers}
              className="shrink-0 border border-stone-950/10 bg-white/45 px-3 py-2 hover:bg-white sm:hidden"
            >
              Edit deal breakers
            </button>
          </div>
        </section>

        {filtersOpen ? (
          <section className="mt-4 border border-stone-950/10 bg-white/55 p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.035em] text-stone-950">
                  Fine-tune matches
                </h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  Narrow the ranked list without losing your quiz scoring.
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

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="col-span-2 text-xs font-bold uppercase tracking-[0.14em] text-stone-600 md:col-span-1">
                Rescue
                <select
                  value={rescueFilter}
                  onChange={(e) => setRescueFilter(e.target.value)}
                  className="mt-2 w-full border border-stone-950/15 bg-[#f4f1ea] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-stone-950"
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
                  className="mt-2 w-full border border-stone-950/15 bg-[#f4f1ea] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-stone-950"
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
                  className="mt-2 w-full border border-stone-950/15 bg-[#f4f1ea] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-stone-950"
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
                  className="mt-2 w-full border border-stone-950/15 bg-[#f4f1ea] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-stone-950"
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
                    "shrink-0 border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]",
                    checked
                      ? "border-stone-950 bg-stone-950 text-white"
                      : "border-stone-950/15 bg-[#f4f1ea] text-stone-600",
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
              className="mt-5 w-full bg-stone-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white hover:bg-stone-800"
            >
              Show {filteredRows.length} matches
            </button>
          </section>
        ) : null}

        {loading ? (
          <div className="mt-6 border border-stone-950/10 bg-white/55 p-5 text-sm font-semibold text-stone-600">
            Loading matches…
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="mt-6 border border-stone-950/10 bg-white/55 p-5">
            <h2 className="text-2xl font-semibold tracking-[-0.035em] text-stone-950">
              No dogs match your current filters.
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Try clearing filters or refining your quiz answers.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={resetFilters}
                className="bg-stone-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white"
              >
                Clear filters
              </button>

              <button
                type="button"
                onClick={goRefine}
                className="border border-stone-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-stone-950"
              >
                Refine quiz
              </button>
            </div>
          </div>
        ) : (
          <section className="mt-5 sm:mt-7">
            {topRow ? (
              <div className="mb-7">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.24em] text-stone-500">
                    Top match
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

                <div className="mx-auto max-w-md sm:max-w-lg lg:max-w-xl">
                  <DogCard
                    dog={topRow.dog}
                    showMatch
                    scorePct={topRow.scorePct}
                    breakdown={topRow.breakdown}
                    sessionId={sessionId}
                  />
                </div>
              </div>
            ) : null}

            {remainingRows.length > 0 ? (
              <>
                <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.24em] text-stone-500">
                  More matches
                </h2>

                <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
                  {remainingRows.map((row, idx) => (
                    <div
                      key={row.dog?.id ?? idx}
                      className={[
                        "mb-4 break-inside-avoid",
                        idx % 5 === 1 ? "sm:pt-8" : "",
                        idx % 7 === 3 ? "lg:pt-10" : "",
                      ].join(" ")}
                    >
                      <DogCard
                        dog={row.dog}
                        showMatch
                        scorePct={row.scorePct}
                        breakdown={row.breakdown}
                        sessionId={sessionId}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}