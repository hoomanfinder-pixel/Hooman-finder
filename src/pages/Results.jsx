// src/pages/Results.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { rankDogs } from "../lib/matchingLogic";
import DogCard from "../components/DogCard";

function getParam(search, key) {
  const params = new URLSearchParams(search);
  return params.get(key);
}

function setParam(search, key, value) {
  const params = new URLSearchParams(search);
  if (!value || value === "all") params.delete(key);
  else params.set(key, value);
  const next = params.toString();
  return next ? `?${next}` : "";
}

function normalizeAgeBucket(ageYears) {
  const n = Number(ageYears);
  if (!Number.isFinite(n)) return "";
  if (n < 2) return "puppy";
  if (n < 7) return "adult";
  return "senior";
}

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();

  const sessionParam = useMemo(
    () => new URLSearchParams(location.search).has("session"),
    [location.search]
  );
  const sessionId = useMemo(
    () => getParam(location.search, "session"),
    [location.search]
  );

  const [loading, setLoading] = useState(true);
  const [dogs, setDogs] = useState([]);
  const [quizRow, setQuizRow] = useState(null);
  const [error, setError] = useState("");

  const [ageFilter, setAgeFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [energyFilter, setEnergyFilter] = useState("all");

  const [hypoOnly, setHypoOnly] = useState(false);
  const [pottyOnly, setPottyOnly] = useState(false);
  const [kidsOnly, setKidsOnly] = useState(false);
  const [catsOnly, setCatsOnly] = useState(false);
  const [dogsOnly, setDogsOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const dogsRes = await supabase
          .from("dogs")
          .select("*");

        if (dogsRes.error) throw dogsRes.error;

        let quiz = null;
        if (sessionId) {
          const quizRes = await supabase
            .from("quiz_responses")
            .select("*")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (quizRes.error) throw quizRes.error;
          quiz = quizRes.data || null;
        }

        if (!cancelled) {
          setDogs(dogsRes.data || []);
          setQuizRow(quiz);
        }
      } catch (e) {
        if (!cancelled) {
          setError("Something went wrong loading dogs.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const rankedDogs = useMemo(() => {
    if (!dogs.length) return [];
    if (!quizRow) {
      return dogs.map((d) => ({
        dog: d,
        scorePct: null,
        breakdown: null,
      }));
    }
    return rankDogs(dogs, quizRow);
  }, [dogs, quizRow]);

  const filteredDogs = useMemo(() => {
    return rankedDogs.filter(({ dog }) => {
      if (ageFilter !== "all") {
        const bucket = normalizeAgeBucket(dog.age_years);
        if (bucket !== ageFilter) return false;
      }
      if (sizeFilter !== "all" && dog.size !== sizeFilter) return false;
      if (energyFilter !== "all" && dog.energy_level !== energyFilter) return false;

      if (hypoOnly && !dog.hypoallergenic) return false;
      if (pottyOnly && !dog.potty_trained) return false;
      if (kidsOnly && !dog.good_with_kids) return false;
      if (catsOnly && !dog.good_with_cats) return false;
      if (dogsOnly && dog.good_with_dogs === false) return false;

      return true;
    });
  }, [
    rankedDogs,
    ageFilter,
    sizeFilter,
    energyFilter,
    hypoOnly,
    pottyOnly,
    kidsOnly,
    catsOnly,
    dogsOnly,
  ]);

  const hasQuiz = !!quizRow;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="grid grid-cols-3 items-center">
          <div>
            <button
              onClick={() => navigate(-1)}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              ← Back
            </button>
          </div>

          <div className="flex justify-center">
            <button onClick={() => navigate("/")}>
              <img
                src="/logo.png"
                alt="Hooman Finder"
                className="h-24 w-auto"
              />
            </button>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => navigate("/quiz")}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Retake quiz
            </button>
          </div>
        </div>

        <h1 className="mt-6 text-2xl font-semibold text-slate-900">
          {hasQuiz ? "Ranked matches" : "Browse dogs"}
        </h1>

        <p className="mt-1 text-sm text-slate-600">
          {hasQuiz
            ? "These are ranked matches from your quiz. You can still filter below."
            : "Browse adoptable dogs. Take the quiz to see ranked matches."}
        </p>

        {/* ✅ FIXED: only show warning if session param exists but is invalid */}
        {sessionParam && !sessionId && (
          <p className="mt-2 text-sm text-amber-700">
            Invalid or missing session. Retake the quiz to see match percentages.
          </p>
        )}

        {/* Results */}
        {loading ? (
          <div className="mt-10 text-slate-600">Loading…</div>
        ) : filteredDogs.length === 0 ? (
          <div className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
            No dogs match your current filters.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {filteredDogs.map(({ dog, scorePct, breakdown }, idx) => (
              <DogCard
                key={dog.id || idx}
                dog={dog}
                scorePct={scorePct}
                breakdown={breakdown}
                showMatch={hasQuiz}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
