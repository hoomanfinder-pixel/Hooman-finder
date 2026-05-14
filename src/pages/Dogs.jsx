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
  { label: "X-Large", value: "X-Large" },
];

const ENERGY_OPTIONS = [
  { label: "All energy", value: "all" },
  { label: "Low", value: "Low" },
  { label: "Moderate", value: "Moderate" },
  { label: "High", value: "High" },
];

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

function urgencyRank(level) {
  switch (level) {
    case "Critical":
      return 1;
    case "High":
      return 2;
    case "Standard":
      return 3;
    case "Adopted":
      return 4;
    default:
      return 5;
  }
}

function normalizeDog(dog) {
  const joinedShelter = dog?.shelters || null;

  const fallbackShelter =
    dog?.shelter_name ||
    dog?.shelter_website ||
    dog?.placement_city ||
    dog?.placement_state ||
    dog?.source_url
      ? {
          id: dog.shelter_id || null,
          name: dog.shelter_name || "Shelter or rescue",
          website: dog.shelter_website || dog.source_url || null,
          apply_url: dog.source_url || dog.shelter_website || null,
          logo_url: null,
          city: dog.placement_city || null,
          state: dog.placement_state || null,
        }
      : null;

  return {
    ...dog,
    age_years: dog.age_years,
    display_age:
      dog.age_text || (dog.age_years ? `${dog.age_years} years` : null),
    photo_url: dog.photo_url,
    shelters: joinedShelter || fallbackShelter,
  };
}

function getShelterId(dog) {
  return dog?.shelters?.id || dog?.shelter_id || "";
}

function getShelterName(dog) {
  return dog?.shelters?.name || dog?.shelter_name || "Shelter or rescue";
}

export default function Dogs() {
  const [loading, setLoading] = useState(true);
  const [dogs, setDogs] = useState([]);
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

    async function loadDogs() {
      setLoading(true);

      const { data, error } = await supabase
        .from("dogs")
        .select(`
          *,
          shelters (
            id,
            name,
            city,
            state,
            website,
            apply_url,
            logo_url
          )
        `)
        .eq("adoptable", true)
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error("Error fetching dogs:", error);
        setDogs([]);
      } else {
        const normalizedDogs = Array.isArray(data) ? data.map(normalizeDog) : [];
        setDogs(normalizedDogs);
      }

      setLoading(false);
    }

    loadDogs();

    return () => {
      mounted = false;
    };
  }, []);

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

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [dogs]);

  const filteredDogs = useMemo(() => {
    return dogs
      .filter((dog) => {
        if (dog.urgency_level === "Adopted") return false;

        if (rescueFilter !== "all") {
          const shelterId = getShelterId(dog);
          if (shelterId !== rescueFilter) return false;
        }

        if (ageFilter !== "all") {
          const bucket = normalizeAgeBucket(dog.age_years, dog.age_text);
          if (bucket !== ageFilter) return false;
        }

        if (sizeFilter !== "all" && dog.size !== sizeFilter) return false;
        if (energyFilter !== "all" && dog.energy_level !== energyFilter) {
          return false;
        }

        if (hypoOnly && !dog.hypoallergenic) return false;
        if (pottyOnly && !dog.potty_trained) return false;
        if (kidsOnly && !dog.good_with_kids) return false;
        if (catsOnly && !dog.good_with_cats) return false;
        if (dogsOnly && dog.good_with_dogs !== true) return false;

        return true;
      })
      .sort((a, b) => {
        const urgencyDiff =
          urgencyRank(a.urgency_level) - urgencyRank(b.urgency_level);

        if (urgencyDiff !== 0) return urgencyDiff;

        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
  }, [
    dogs,
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

  const visibleTotal = dogs.filter((dog) => dog.urgency_level !== "Adopted")
    .length;

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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="shrink-0" aria-label="Go home">
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-12 sm:h-16 w-auto object-contain"
            />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/"
              className="hidden sm:inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
            >
              Home
            </Link>

            <Link
              to="/saved"
              className="hidden sm:inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
            >
              Saved
            </Link>

            <Link
              to="/quiz"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 sm:px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              Take quiz
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-10 flex-1 w-full">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Browse adoptable dogs
              </p>

              <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950">
                Find a dog who fits your real life.
              </h1>

              <p className="mt-3 text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
                Browse by rescue, lifestyle fit, personality, and urgency. Hooman
                Finder helps you discover dogs — the shelter or rescue handles the
                adoption.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/quiz"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Find my match
              </Link>

              <button
                type="button"
                onClick={() => setFiltersOpen((current) => !current)}
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
              >
                {filtersOpen ? "Hide filters" : "Filter dogs"}
                {activeFilterCount > 0 ? (
                  <span className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-bold text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
              {loading ? "Loading dogs..." : `${filteredDogs.length} showing`}
            </span>

            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
              {visibleTotal} available
            </span>

            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
              Apply through rescue
            </span>
          </div>
        </section>

        {filtersOpen ? (
          <section className="mt-4 rounded-3xl bg-white border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  Narrow your search
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Start broad, then filter by what matters most for your home.
                </p>
              </div>

              <button
                type="button"
                onClick={resetFilters}
                className="shrink-0 inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
              >
                Reset
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-4">
              <label className="text-sm font-semibold text-slate-800">
                Rescue / shelter
                <select
                  value={rescueFilter}
                  onChange={(e) => setRescueFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                >
                  <option value="all">All rescues</option>
                  {rescueOptions.map((rescue) => (
                    <option key={rescue.id} value={rescue.id}>
                      {rescue.name} ({rescue.count})
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-800">
                Age
                <select
                  value={ageFilter}
                  onChange={(e) => setAgeFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                >
                  {AGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-800">
                Size
                <select
                  value={sizeFilter}
                  onChange={(e) => setSizeFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                >
                  {SIZE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-800">
                Energy
                <select
                  value={energyFilter}
                  onChange={(e) => setEnergyFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
                >
                  {ENERGY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm text-slate-700">
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={hypoOnly}
                  onChange={(e) => setHypoOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                Hypoallergenic
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={pottyOnly}
                  onChange={(e) => setPottyOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                Potty trained
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={kidsOnly}
                  onChange={(e) => setKidsOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                Good with kids
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={catsOnly}
                  onChange={(e) => setCatsOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                Good with cats
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={dogsOnly}
                  onChange={(e) => setDogsOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                Good with dogs
              </label>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Show {filteredDogs.length} dogs
              </button>

              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
              >
                Clear all filters
              </button>
            </div>
          </section>
        ) : null}

        {loading ? (
          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
            Loading adoptable dogs…
          </div>
        ) : filteredDogs.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm">
            <h2 className="text-xl font-extrabold text-slate-900">
              No dogs match those filters yet.
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Try clearing a few filters or taking the matching quiz so Hooman Finder
              can help you look for a better lifestyle fit.
            </p>

            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Clear filters
              </button>

              <Link
                to="/quiz"
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50"
              >
                Take the quiz
              </Link>
            </div>
          </div>
        ) : (
          <section className="mt-6 sm:mt-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-slate-900">
                Available dogs
              </h2>

              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-sm font-semibold text-slate-600 underline underline-offset-4 hover:text-slate-900"
                >
                  Clear filters
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
              {filteredDogs.map((dog) => (
                <DogCard
                  key={dog.id}
                  dog={dog}
                  scorePct={null}
                  showMatch={false}
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