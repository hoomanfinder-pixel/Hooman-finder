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
  { label: "Puppy (<2)", value: "puppy" },
  { label: "Adult (2–6)", value: "adult" },
  { label: "Senior (7+)", value: "senior" },
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

function normalizeAgeBucket(ageYears) {
  const n = Number(ageYears);
  if (!Number.isFinite(n)) return null;
  if (n < 2) return "puppy";
  if (n < 7) return "adult";
  return "senior";
}

export default function Results() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session") || "";

  const [answersById, setAnswersById] = useState({});
  const [dogs, setDogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Match the Dogs.jsx filter UI exactly
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
          .select("*")
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

  // Rows: { dog, score, scorePct, breakdown }
  const rankedRows = useMemo(
    () => computeRankedMatches(dogs, answersById),
    [dogs, answersById]
  );

  const filteredRows = useMemo(() => {
    return rankedRows.filter((row) => {
      const dog = row.dog;

      if (ageFilter !== "all") {
        const bucket = normalizeAgeBucket(dog?.age_years);
        if (bucket !== ageFilter) return false;
      }

      if (sizeFilter !== "all" && dog?.size !== sizeFilter) return false;
      if (energyFilter !== "all" && dog?.energy_level !== energyFilter) return false;

      if (hypoOnly && !dog?.hypoallergenic) return false;
      if (pottyOnly && !dog?.potty_trained) return false;
      if (kidsOnly && !dog?.good_with_kids) return false;
      if (catsOnly && !dog?.good_with_cats) return false;

      // If toggled on: exclude only explicit false. Allow true OR null/unknown.
      if (dogsOnly && dog?.good_with_dogs === false) return false;

      return true;
    });
  }, [
    rankedRows,
    ageFilter,
    sizeFilter,
    energyFilter,
    hypoOnly,
    pottyOnly,
    kidsOnly,
    catsOnly,
    dogsOnly,
  ]);

  function resetFilters() {
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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Match Dogs.jsx header exactly (logo goes home) */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" aria-label="Go home">
            <img src="/logo.png" alt="Hooman Finder" className="h-24 w-24 object-contain" />
          </Link>

          <div className="flex items-center gap-3">
            <button
              onClick={goDealbreakers}
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
            >
              Edit deal breakers
            </button>

            <button
              onClick={goRefine}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Refine matches
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 flex-1">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Your matches</h1>
            <p className="mt-1 text-sm text-slate-600">
              Refine anytime to improve ranking.
            </p>

            <div className="mt-2">
              <Link to="/dogs" className="text-sm font-semibold text-slate-800 hover:underline">
                ← Back to dogs
              </Link>
            </div>

            {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}
          </div>

          <button
            onClick={resetFilters}
            className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
          >
            Reset filters
          </button>
        </div>

        {/* Match Dogs.jsx filter card exactly */}
        <div className="mt-6 rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="text-sm font-semibold text-slate-800">
              Age
              <select
                value={ageFilter}
                onChange={(e) => setAgeFilter(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {AGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold text-slate-800">
              Size
              <select
                value={sizeFilter}
                onChange={(e) => setSizeFilter(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {SIZE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold text-slate-800">
              Energy
              <select
                value={energyFilter}
                onChange={(e) => setEnergyFilter(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                {ENERGY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate-700">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={hypoOnly} onChange={(e) => setHypoOnly(e.target.checked)} />
              Hypoallergenic only
            </label>

            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={pottyOnly} onChange={(e) => setPottyOnly(e.target.checked)} />
              Potty trained only
            </label>

            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={kidsOnly} onChange={(e) => setKidsOnly(e.target.checked)} />
              Good with kids
            </label>

            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={catsOnly} onChange={(e) => setCatsOnly(e.target.checked)} />
              Good with cats
            </label>

            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={dogsOnly} onChange={(e) => setDogsOnly(e.target.checked)} />
              Good with other dogs
            </label>
          </div>

          <div className="mt-3 text-sm text-slate-600">
            Showing {filteredRows.length} of {rankedRows.length || 0}
          </div>
        </div>

        {loading ? (
          <div className="mt-8 text-slate-600">Loading…</div>
        ) : filteredRows.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-slate-700 shadow-sm">
            No dogs match your current filters.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRows.map((row, idx) => (
              <DogCard
                key={row.dog?.id ?? idx}
                dog={row.dog}
                showMatch
                scorePct={row.scorePct}
                breakdown={row.breakdown}
                sessionId={sessionId}
              />
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
