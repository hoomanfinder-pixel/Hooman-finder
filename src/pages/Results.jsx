// src/pages/Results.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { rankDogs } from "../lib/matchingLogic";
import DogCard from "../components/DogCard";

function getParam(search, key) {
  const params = new URLSearchParams(search);
  return params.get(key) || "";
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

function matchesAgeFilter(dog, ageFilter) {
  if (!ageFilter || ageFilter === "all") return true;
  const bucket = normalizeAgeBucket(dog?.age_years);
  return bucket === ageFilter;
}

function matchesSizeFilter(dog, sizeFilter) {
  if (!sizeFilter || sizeFilter === "all") return true;
  return String(dog?.size || "").toLowerCase() === sizeFilter;
}

function matchesEnergyFilter(dog, energyFilter) {
  if (!energyFilter || energyFilter === "all") return true;
  return String(dog?.energy_level || "").toLowerCase() === energyFilter;
}

function safeArray(v) {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

function normalizeLower(v) {
  return String(v || "").trim().toLowerCase();
}

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();

  const sessionId = useMemo(() => getParam(location.search, "session"), [location.search]);
  const shelterFromUrl = useMemo(() => getParam(location.search, "shelter"), [location.search]);

  const [loading, setLoading] = useState(true);
  const [dogs, setDogs] = useState([]);
  const [quizRow, setQuizRow] = useState(null);
  const [error, setError] = useState("");

  // Filters
  const [ageFilter, setAgeFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [energyFilter, setEnergyFilter] = useState("all");
  const [shelterFilter, setShelterFilter] = useState("all");

  const [hypoOnly, setHypoOnly] = useState(false);
  const [pottyOnly, setPottyOnly] = useState(false);
  const [kidsOnly, setKidsOnly] = useState(false);
  const [catsOnly, setCatsOnly] = useState(false);
  const [dogsOnly, setDogsOnly] = useState(false);

  // Keep shelterFilter in sync with URL (back/forward and manual edits)
  useEffect(() => {
    setShelterFilter(shelterFromUrl || "all");
  }, [shelterFromUrl]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const dogsRes = await supabase
          .from("dogs")
          .select("*, shelters ( id, name, city, state, apply_url, website, contact_email, logo_url )");

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
          setDogs(Array.isArray(dogsRes.data) ? dogsRes.data : []);
          setQuizRow(quiz);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Something went wrong loading results.");
          setDogs([]);
          setQuizRow(null);
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

  const answers = useMemo(() => {
    if (!quizRow) return null;

    return {
      play_styles: safeArray(quizRow.play_styles),
      energy_preference: quizRow.energy_preference || "",
      size_preference: safeArray(quizRow.size_preference),
      age_preference: safeArray(quizRow.age_preference),
      potty_requirement: quizRow.potty_requirement || "",
      kids_in_home: quizRow.kids_in_home || "",
      cats_in_home: quizRow.cats_in_home || "",
      first_time_owner: quizRow.first_time_owner || "",
      allergy_sensitivity: quizRow.allergy_sensitivity || "",
      shedding_levels: safeArray(quizRow.shedding_levels),
      pets_in_home: safeArray(quizRow.pets_in_home),
      noise_preference: quizRow.noise_preference || "",
      alone_time: quizRow.alone_time || "",
      yard: typeof quizRow.yard === "boolean" ? quizRow.yard : null,
    };
  }, [quizRow]);

  const shelterOptions = useMemo(() => {
    const map = new Map();
    for (const d of dogs || []) {
      const s = d?.shelters;
      const id = s?.id;
      if (!id) continue;

      if (!map.has(id)) {
        map.set(id, {
          id,
          name: s?.name || "Shelter",
          city: s?.city || "",
          state: s?.state || "",
        });
      }
    }

    const list = Array.from(map.values());
    list.sort((a, b) => {
      const an = normalizeLower(a.name);
      const bn = normalizeLower(b.name);
      if (an < bn) return -1;
      if (an > bn) return 1;
      const aloc = normalizeLower([a.city, a.state].filter(Boolean).join(", "));
      const bloc = normalizeLower([b.city, b.state].filter(Boolean).join(", "));
      if (aloc < bloc) return -1;
      if (aloc > bloc) return 1;
      return String(a.id).localeCompare(String(b.id));
    });

    return list;
  }, [dogs]);

  const rankedDogs = useMemo(() => {
    if (!dogs?.length) return [];

    if (!answers) {
      const copy = [...dogs];
      copy.sort((a, b) => {
        const an = String(a?.name || "").toLowerCase();
        const bn = String(b?.name || "").toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        const aid = String(a?.id || "");
        const bid = String(b?.id || "");
        if (aid < bid) return -1;
        if (aid > bid) return 1;
        return 0;
      });
      return copy.map((d) => ({ dog: d, scorePct: null, breakdown: null, rawScore: null }));
    }

    return rankDogs(dogs, answers);
  }, [dogs, answers]);

  const filteredRanked = useMemo(() => {
    return rankedDogs.filter((item) => {
      const d = item?.dog;
      if (!d) return false;

      if (shelterFilter !== "all") {
        const dogShelterId = d?.shelters?.id || d?.shelter_id || "";
        if (String(dogShelterId) !== String(shelterFilter)) return false;
      }

      if (!matchesAgeFilter(d, ageFilter)) return false;
      if (!matchesSizeFilter(d, sizeFilter)) return false;
      if (!matchesEnergyFilter(d, energyFilter)) return false;

      if (hypoOnly && !d.hypoallergenic) return false;
      if (pottyOnly && !d.potty_trained) return false;
      if (kidsOnly && !d.good_with_kids) return false;
      if (catsOnly && !d.good_with_cats) return false;
      if (dogsOnly && !d.good_with_dogs) return false;

      return true;
    });
  }, [
    rankedDogs,
    shelterFilter,
    ageFilter,
    sizeFilter,
    energyFilter,
    hypoOnly,
    pottyOnly,
    kidsOnly,
    catsOnly,
    dogsOnly,
  ]);

  function onShelterChange(nextValue) {
    const value = nextValue || "all";
    setShelterFilter(value);
    const nextSearch = setParam(location.search, "shelter", value);
    navigate({ pathname: location.pathname, search: nextSearch }, { replace: true });
  }

  function resetFilters() {
    setAgeFilter("all");
    setSizeFilter("all");
    setEnergyFilter("all");
    setHypoOnly(false);
    setPottyOnly(false);
    setKidsOnly(false);
    setCatsOnly(false);
    setDogsOnly(false);

    // Remove shelter param from URL
    const nextSearch = setParam(location.search, "shelter", "all");
    navigate({ pathname: location.pathname, search: nextSearch }, { replace: true });
  }

  const hasQuiz = !!answers;

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header with centered clickable logo */}
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
            <button
              onClick={() => navigate("/")}
              className="flex items-center"
              aria-label="Go to home"
            >
              <img
                src="/logo.png"
                alt="Hooman Finder"
                className="h-24 md:h-24 w-auto opacity-90 hover:opacity-100 transition"
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

        <div className="mt-6 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {hasQuiz ? "Ranked matches" : "Browse dogs"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {hasQuiz
                ? "These are ranked matches from your quiz. You can still filter below."
                : "Take the quiz to see ranked matches. You can still filter below."}
            </p>

            {!sessionId && (
              <p className="mt-2 text-sm text-amber-700">
                No session id found in the URL. Add{" "}
                <span className="font-mono">?session=...</span> to see match %.
              </p>
            )}

            {shelterFilter !== "all" && (
              <p className="mt-2 text-sm text-slate-600">
                Shelter filter is active. Share this page URL to keep it locked to this shelter.
              </p>
            )}
          </div>

          <button
            onClick={resetFilters}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Reset filters
          </button>
        </div>

        {/* Filters */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">Shelter / Rescue</label>
              <select
                value={shelterFilter}
                onChange={(e) => onShelterChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="all">All shelters</option>
                {shelterOptions.map((s) => {
                  const loc = [s.city, s.state].filter(Boolean).join(", ");
                  const label = loc ? `${s.name} • ${loc}` : s.name;
                  return (
                    <option key={s.id} value={s.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Age</label>
              <select
                value={ageFilter}
                onChange={(e) => setAgeFilter(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="all">All ages</option>
                <option value="puppy">Puppy</option>
                <option value="adult">Adult</option>
                <option value="senior">Senior</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Size</label>
              <select
                value={sizeFilter}
                onChange={(e) => setSizeFilter(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="all">All sizes</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Energy</label>
              <select
                value={energyFilter}
                onChange={(e) => setEnergyFilter(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="all">All energy</option>
                <option value="low">Low</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-5 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={hypoOnly}
                onChange={(e) => setHypoOnly(e.target.checked)}
              />
              Hypoallergenic only
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pottyOnly}
                onChange={(e) => setPottyOnly(e.target.checked)}
              />
              Potty trained only
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={kidsOnly}
                onChange={(e) => setKidsOnly(e.target.checked)}
              />
              Good with kids
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={catsOnly}
                onChange={(e) => setCatsOnly(e.target.checked)}
              />
              Good with cats
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={dogsOnly}
                onChange={(e) => setDogsOnly(e.target.checked)}
              />
              Good with other dogs
            </label>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Showing {filteredRanked.length} of {rankedDogs.length}
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="mt-10 text-slate-600">Loading…</div>
        ) : error ? (
          <div className="mt-10 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        ) : filteredRanked.length === 0 ? (
          <div className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
            No dogs match your current filters.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {filteredRanked.map((item, idx) => (
              <DogCard
                key={item?.dog?.id || `dog-${idx}`}
                dog={item.dog}
                scorePct={item.scorePct}
                breakdown={item.breakdown}   // ✅ NEW: enables “Why matched?”
                showMatch={hasQuiz}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
