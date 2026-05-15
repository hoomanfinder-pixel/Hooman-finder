// src/pages/Dogs.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DogCard from "../components/DogCard";
import SiteFooter from "../components/SiteFooter";
import { supabase } from "../lib/supabase";

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
    case "Urgent":
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
    display_age: dog.age_text || (dog.age_years ? `${dog.age_years} years` : null),
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

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
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
        if (energyFilter !== "all" && dog.energy_level !== energyFilter) return false;

        if (hypoOnly && !dog.hypoallergenic) return false;
        if (pottyOnly && !dog.potty_trained) return false;
        if (kidsOnly && !dog.good_with_kids) return false;
        if (catsOnly && !dog.good_with_cats) return false;
        if (dogsOnly && dog.good_with_dogs !== true) return false;

        return true;
      })
      .sort((a, b) => {
        const urgencyDiff = urgencyRank(a.urgency_level) - urgencyRank(b.urgency_level);
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

  const visibleTotal = dogs.filter((dog) => dog.urgency_level !== "Adopted").length;

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
    <div className="min-h-screen bg-[#f4f1ea] text-stone-950">
      <header className="sticky top-0 z-50 border-b border-stone-950/10 bg-[#f4f1ea]/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <Link to="/" className="shrink-0" aria-label="Go home">
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-9 w-auto object-contain sm:h-11"
            />
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to="/saved"
              className="hidden rounded-full border border-stone-950/15 bg-white/55 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-700 hover:bg-white sm:inline-flex"
            >
              Saved
            </Link>

            <Link
              to="/quiz"
              className="inline-flex items-center justify-center rounded-full bg-stone-950 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white hover:bg-stone-800"
            >
              Quiz
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-3.5 py-4 sm:px-6 sm:py-8 lg:px-8">
        <section className="pb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-stone-500">
            Browse adoptable dogs
          </p>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="max-w-2xl text-[2.45rem] font-semibold leading-[0.88] tracking-[-0.065em] text-stone-950 sm:text-6xl">
                Find your next favorite face.
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
                Scroll real adoptable dogs, save favorites, and take the quiz when you’re ready for better matches.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-stone-950 bg-stone-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white hover:bg-transparent hover:text-stone-950 sm:w-auto"
            >
              {filtersOpen ? "Hide filters" : "Filter"}
              {activeFilterCount > 0 ? (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[10px] text-stone-950">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
            <span className="shrink-0 rounded-full border border-stone-950/10 bg-white/58 px-3 py-2">
              {loading ? "Loading" : `${filteredDogs.length} showing`}
            </span>

            <span className="shrink-0 rounded-full border border-stone-950/10 bg-white/58 px-3 py-2">
              {visibleTotal} available
            </span>

            <Link
              to="/quiz"
              className="shrink-0 rounded-full border border-stone-950/10 bg-white/58 px-3 py-2 hover:bg-white"
            >
              Find my match
            </Link>
          </div>
        </section>

        {filtersOpen ? (
          <section className="mt-2 rounded-[1.5rem] border border-stone-950/10 bg-white/62 p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.035em] text-stone-950">
                  Narrow your search
                </h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  Keep it broad, then filter by what really matters.
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
                  className="mt-2 w-full rounded-xl border border-stone-950/15 bg-[#f4f1ea] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-stone-950"
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
                  className="mt-2 w-full rounded-xl border border-stone-950/15 bg-[#f4f1ea] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-stone-950"
                >
                  {AGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.14em] text-stone-600">
                Size
                <select
                  value={sizeFilter}
                  onChange={(e) => setSizeFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-950/15 bg-[#f4f1ea] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-stone-950"
                >
                  {SIZE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.14em] text-stone-600">
                Energy
                <select
                  value={energyFilter}
                  onChange={(e) => setEnergyFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-stone-950/15 bg-[#f4f1ea] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-stone-950"
                >
                  {ENERGY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
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
              className="mt-4 w-full rounded-2xl bg-stone-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white hover:bg-stone-800"
            >
              Show {filteredDogs.length} dogs
            </button>
          </section>
        ) : null}

        {loading ? (
          <div className="mt-5 rounded-[1.35rem] border border-stone-950/10 bg-white/60 p-5 text-sm font-semibold text-stone-600">
            Loading adoptable dogs…
          </div>
        ) : filteredDogs.length === 0 ? (
          <div className="mt-5 rounded-[1.35rem] border border-stone-950/10 bg-white/60 p-5">
            <h2 className="text-2xl font-semibold tracking-[-0.035em] text-stone-950">
              No dogs match those filters yet.
            </h2>

            <p className="mt-2 text-sm leading-6 text-stone-600">
              Try clearing a few filters or taking the matching quiz.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-2xl bg-stone-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white"
              >
                Clear filters
              </button>

              <Link
                to="/quiz"
                className="rounded-2xl border border-stone-950 px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.16em] text-stone-950"
              >
                Take quiz
              </Link>
            </div>
          </div>
        ) : (
          <section className="mt-4 sm:mt-7">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.24em] text-stone-500">
                Available dogs
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

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {filteredDogs.map((dog) => (
                <DogCard
                  key={dog.id}
                  dog={dog}
                  scorePct={null}
                  showMatch={false}
                  variant="grid"
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