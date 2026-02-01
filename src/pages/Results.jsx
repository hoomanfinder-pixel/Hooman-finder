// src/pages/Results.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import DogCard from "../components/DogCard";
import { loadQuizResponses } from "../lib/quizStorage";
import {
  computeRankedMatches,
  matchTierFromActivePct,
} from "../lib/matchingLogic";
import { supabase } from "../lib/supabase";
import { QUIZ_MODES } from "../lib/quizQuestions";

function ageBucket(ageYears) {
  const n = Number(ageYears);
  if (!Number.isFinite(n)) return "unknown";
  if (n <= 1) return "puppy";
  if (n >= 7) return "senior";
  return "adult";
}

function normalizeSize(s) {
  const v = (s ?? "").toString().toLowerCase().trim();
  if (!v) return "";
  if (v.includes("extra")) return "extra large";
  if (v === "xl") return "extra large";
  return v;
}

/**
 * IMPORTANT:
 * - matchTierFromActivePct(scorePct) is the source of truth for tiers.
 * - Filters should match whatever labels that function returns.
 * - Previously you mapped "Strong/Good/Potential" to values,
 *   but your older Results.jsx used "great/good/ok/low", which caused "Showing 0 of N".
 */
function normalizeMatchLevel(scorePct) {
  const tier = matchTierFromActivePct(scorePct);
  const label = (tier?.label ?? "").toString().toLowerCase();

  // Support a few possible label wordings without breaking filtering.
  if (label.includes("strong") || label.includes("great")) return "strong";
  if (label.includes("good")) return "good";
  if (label.includes("potential") || label.includes("ok") || label.includes("decent"))
    return "potential";
  return "unknown";
}

export default function Results() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session") || "";

  const [answersById, setAnswersById] = useState({});
  const [dogs, setDogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Filters
  const [q, setQ] = useState("");
  const [matchLevel, setMatchLevel] = useState("all"); // all | strong | good | potential
  const [size, setSize] = useState("all");
  const [age, setAge] = useState("all"); // all | puppy | adult | senior | unknown
  const [sort, setSort] = useState("ranked"); // ranked | name | age

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        setLoading(true);
        setErr("");

        const { answersById: loadedAnswers } = await loadQuizResponses(sessionId);

        const { data: dogsData, error: dogsErr } = await supabase.from("dogs").select("*");
        if (dogsErr) throw dogsErr;

        if (!mounted) return;
        setAnswersById(loadedAnswers || {});
        setDogs(dogsData || []);
      } catch (e) {
        if (!mounted) return;
        setErr(e?.message || String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (sessionId) run();
    else {
      setErr("Missing session id. Please return to the quiz.");
      setLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [sessionId]);

  // Rows: { dog, score, scorePct, breakdown }
  const rankedRows = useMemo(
    () => computeRankedMatches(dogs, answersById),
    [dogs, answersById]
  );

  const filterOptions = useMemo(() => {
    const sizes = new Set();
    const ages = new Set();

    rankedRows.forEach((row) => {
      const d = row.dog;
      const s = normalizeSize(d?.size);
      if (s) sizes.add(s);

      const a = ageBucket(d?.age_years);
      if (a) ages.add(a);
    });

    const ageOrder = ["puppy", "adult", "senior", "unknown"];
    const sortedAges = Array.from(ages).sort(
      (a, b) => ageOrder.indexOf(a) - ageOrder.indexOf(b)
    );

    return {
      sizes: ["all", ...Array.from(sizes).sort()],
      ages: ["all", ...sortedAges],
    };
  }, [rankedRows]);

  const filteredRows = useMemo(() => {
    const query = q.trim().toLowerCase();

    let out = rankedRows.filter((row) => {
      const d = row.dog;

      if (matchLevel !== "all") {
        const lvl = normalizeMatchLevel(row.scorePct);
        if (lvl !== matchLevel) return false;
      }

      if (size !== "all") {
        const s = normalizeSize(d?.size);
        if (s !== size) return false;
      }

      if (age !== "all") {
        const a = ageBucket(d?.age_years);
        if (a !== age) return false;
      }

      if (query) {
        const name = (d?.name ?? "").toString().toLowerCase();
        const breed = (d?.breed ?? "").toString().toLowerCase();
        if (!name.includes(query) && !breed.includes(query)) return false;
      }

      return true;
    });

    if (sort === "name") {
      out = [...out].sort((a, b) =>
        String(a.dog?.name ?? "").localeCompare(String(b.dog?.name ?? ""))
      );
    } else if (sort === "age") {
      out = [...out].sort(
        (a, b) => Number(a.dog?.age_years ?? 999) - Number(b.dog?.age_years ?? 999)
      );
    } else {
      out = [...out]; // already ranked
    }

    return out;
  }, [rankedRows, q, matchLevel, size, age, sort]);

  function goRefine() {
    navigate(`/quiz?session=${encodeURIComponent(sessionId)}&mode=${QUIZ_MODES.REFINE}`);
  }

  function goDealbreakers() {
    navigate(`/quiz?session=${encodeURIComponent(sessionId)}&mode=${QUIZ_MODES.DEALBREAKERS}`);
  }

  return (
    <div className="min-h-screen bg-[#EAF7F0]">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between gap-3">
          <button className="text-sm text-gray-600" onClick={() => navigate("/dogs")}>
            ← Back to dogs
          </button>

          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-gray-900"
              onClick={goDealbreakers}
            >
              Edit Deal Breakers
            </button>
            <button className="px-4 py-2 rounded-xl bg-green-700 text-white" onClick={goRefine}>
              Refine matches
            </button>
          </div>
        </div>

        <h1 className="text-3xl font-semibold mt-4">Your matches</h1>
        <p className="text-gray-600 mt-1">Refine anytime to improve ranking.</p>

        {err ? <div className="mt-4 text-sm text-red-600">{err}</div> : null}

        {loading ? (
          <div className="mt-8 text-gray-600">Loading…</div>
        ) : (
          <>
            {/* Standard filters box (keep for consistency) */}
            <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex flex-wrap gap-3 items-center">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search dogs…"
                  className="flex-1 min-w-[220px] px-4 py-2 rounded-xl border border-gray-300"
                />

                <select
                  value={matchLevel}
                  onChange={(e) => setMatchLevel(e.target.value)}
                  className="px-4 py-2 rounded-xl border border-gray-300 bg-white"
                >
                  <option value="all">All match levels</option>
                  <option value="strong">Strong match</option>
                  <option value="good">Good match</option>
                  <option value="potential">Potential match</option>
                </select>

                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="px-4 py-2 rounded-xl border border-gray-300 bg-white"
                >
                  {filterOptions.sizes.map((s) => (
                    <option key={s} value={s}>
                      {s === "all" ? "All sizes" : s}
                    </option>
                  ))}
                </select>

                <select
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="px-4 py-2 rounded-xl border border-gray-300 bg-white"
                >
                  {filterOptions.ages.map((a) => (
                    <option key={a} value={a}>
                      {a === "all"
                        ? "All ages"
                        : a === "puppy"
                        ? "Puppy (0–1)"
                        : a === "adult"
                        ? "Adult (2–6)"
                        : a === "senior"
                        ? "Senior (7+)"
                        : "Unknown"}
                    </option>
                  ))}
                </select>

                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="px-4 py-2 rounded-xl border border-gray-300 bg-white"
                >
                  <option value="ranked">Sort: Ranked</option>
                  <option value="name">Sort: Name</option>
                  <option value="age">Sort: Age</option>
                </select>
              </div>

              <div className="mt-2 text-sm text-gray-600">
                Showing {filteredRows.length} of {rankedRows.length}
              </div>
            </div>

            {/* Cards (old ranked-matches look + hover why matched + click to profile) */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
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
          </>
        )}
      </div>
    </div>
  );
}
