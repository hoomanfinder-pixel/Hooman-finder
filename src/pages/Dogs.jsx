// src/pages/Dogs.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DogCard from "../components/DogCard";
import SiteFooter from "../components/SiteFooter";
import { supabase } from "../lib/supabase";

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

export default function Dogs() {
  const [loading, setLoading] = useState(true);
  const [dogs, setDogs] = useState([]);

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

    async function loadDogs() {
      setLoading(true);

      const { data, error } = await supabase
        .from("dogs")
        .select("*")
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error("Error fetching dogs:", error);
        setDogs([]);
      } else {
        setDogs(Array.isArray(data) ? data : []);
      }

      setLoading(false);
    }

    loadDogs();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredDogs = useMemo(() => {
    return dogs.filter((dog) => {
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

      // If toggled on: exclude only explicit false. Allow true OR null/unknown.
      if (dogsOnly && dog.good_with_dogs === false) return false;

      return true;
    });
  }, [
    dogs,
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" aria-label="Go home">
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-24 w-24 object-contain"
            />
          </Link>

          <div className="flex items-center gap-3">
            <Link
              to="/quiz"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Take the quiz
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 flex-1">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Browse example dogs
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Take the quiz to see ranked matches. This page is for browsing.
            </p>
          </div>

          <button
            onClick={resetFilters}
            className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
          >
            Reset filters
          </button>
        </div>

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
              <input
                type="checkbox"
                checked={hypoOnly}
                onChange={(e) => setHypoOnly(e.target.checked)}
              />
              Hypoallergenic only
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={pottyOnly}
                onChange={(e) => setPottyOnly(e.target.checked)}
              />
              Potty trained only
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={kidsOnly}
                onChange={(e) => setKidsOnly(e.target.checked)}
              />
              Good with kids
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={catsOnly}
                onChange={(e) => setCatsOnly(e.target.checked)}
              />
              Good with cats
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={dogsOnly}
                onChange={(e) => setDogsOnly(e.target.checked)}
              />
              Good with other dogs
            </label>
          </div>

          <div className="mt-3 text-sm text-slate-600">
            Showing {filteredDogs.length} of {dogs.length || 0}
          </div>
        </div>

        {loading ? (
          <div className="mt-8 text-slate-600">Loading…</div>
        ) : filteredDogs.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-slate-700 shadow-sm">
            No dogs match your current filters.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDogs.map((dog) => (
              <DogCard key={dog.id} dog={dog} scorePct={null} showMatch={false} />
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
