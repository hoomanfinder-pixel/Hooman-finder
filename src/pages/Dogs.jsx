// src/pages/Dogs.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import DogCard from "../components/DogCard";
import SEO from "../components/SEO";
import SiteFooter from "../components/SiteFooter";
import { filterPublicDogs } from "../lib/dogVisibility";
import {
  getDogApplyLink,
  getDogSourceFilterId,
  getDogSourceName,
  hasDogLevelSource,
} from "../lib/dogSource";
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

function parsedAgeYearsFromText(ageText) {
  const text = String(ageText || "").toLowerCase().trim();
  if (!text) return null;

  const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*year/);
  const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*month/);
  const weekMatch = text.match(/(\d+(?:\.\d+)?)\s*week/);
  const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*day/);

  if (!yearMatch && !monthMatch && !weekMatch && !dayMatch) return null;

  const years = Number(yearMatch?.[1] || 0);
  const months = Number(monthMatch?.[1] || 0);
  const weeks = Number(weekMatch?.[1] || 0);
  const days = Number(dayMatch?.[1] || 0);
  return years + months / 12 + weeks / 52 + days / 365;
}

// age_years has been observed inconsistent with age_text on some historical
// rows (e.g. a raw month count stored as whole years). When the two disagree
// by more than half a year, the unit-aware text parse is preferred.
function normalizeAgeBucket(ageYears, ageText) {
  const raw = Number(ageYears);
  const parsed = parsedAgeYearsFromText(ageText);

  let n = Number.isFinite(raw) ? raw : null;
  if (parsed !== null && (n === null || Math.abs(n - parsed) > 0.5)) {
    n = parsed;
  }

  if (Number.isFinite(n)) {
    if (n < 2) return "puppy";
    if (n < 7) return "adult";
    return "senior";
  }

  const text = String(ageText || "").toLowerCase();

  if (text.includes("puppy")) return "puppy";
  if (text.includes("senior")) return "senior";

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
  const dogLevelSource = hasDogLevelSource(dog);

  const fallbackShelter =
    dogLevelSource
      ? {
          id: getDogSourceFilterId(dog) || null,
          name: getDogSourceName(dog),
          website: dog.shelter_website || dog.source_url || null,
          apply_url: getDogApplyLink(dog) || null,
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
    shelters: fallbackShelter || joinedShelter,
  };
}

function getShelterId(dog) {
  return getDogSourceFilterId(dog) || "";
}

function getShelterName(dog) {
  return getDogSourceName(dog);
}

export default function Dogs() {
  const [loading, setLoading] = useState(true);
  const [dogs, setDogs] = useState([]);
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
        .in("availability_status", ["available", "active", "unknown"])
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error("Error fetching dogs:", error);
        setDogs([]);
      } else {
        const normalizedDogs = filterPublicDogs(data).map(normalizeDog);
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

  const quickFilters = [
    {
      label: "All dogs",
      active: activeFilterCount === 0,
      onClick: resetFilters,
    },
    {
      label: "Good with kids",
      active: kidsOnly,
      onClick: () => setKidsOnly((current) => !current),
    },
    {
      label: "Low energy",
      active: energyFilter === "Low",
      onClick: () => setEnergyFilter((current) => (current === "Low" ? "all" : "Low")),
    },
    {
      label: "Puppies",
      active: ageFilter === "puppy",
      onClick: () => setAgeFilter((current) => (current === "puppy" ? "all" : "puppy")),
    },
    {
      label: "Small",
      active: sizeFilter === "Small",
      onClick: () => setSizeFilter((current) => (current === "Small" ? "all" : "Small")),
    },
  ];

  return (
    <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#0F2742]">
      <SEO
        title="Browse Adoptable Dogs | Hooman Finder"
        description="Browse adoptable shelter and rescue dogs and save favorites while you compare fit by home, lifestyle, energy, care needs, and source details."
        canonicalPath="/dogs"
        ogImage="/home-hero-dogs.jpg"
        ogImageAlt="Adoptable dogs available through Hooman Finder"
      />

      <header className="sticky top-0 z-50 border-b border-[#C7D4BB]/60 bg-[#F5F1E9]/95 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#C7D4BB] bg-white p-1.5"
            aria-label="Go home"
          >
            <img
              src="/logo.png"
              alt="Hooman Finder"
              className="h-full w-full object-contain"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          </Link>

          <button
            type="button"
            onClick={toggleFilters}
            className="mx-auto inline-flex min-h-10 w-full max-w-[11rem] items-center justify-center rounded-full bg-[#0F2742] px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[#F3C982] shadow-sm transition hover:bg-[#0C1E35]"
          >
            Filter
            {activeFilterCount > 0 ? (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F3C982] px-1.5 text-[10px] font-bold text-[#0C1E35]">
                {activeFilterCount}
              </span>
            ) : null}
          </button>

          <div className="flex items-center justify-end gap-2">
            <Link
              to="/saved"
              className="hidden rounded-full border border-[#C7D4BB] bg-white px-3.5 py-2 text-[11px] font-bold text-[#0F2742] hover:bg-[#EFE8DC] sm:inline-flex"
            >
              Saved
            </Link>

            <Link
              to="/quiz"
              className="inline-flex min-h-9 items-center justify-center rounded-full bg-[#0F2742] px-3.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#F3C982] shadow-sm transition hover:bg-[#0C1E35]"
            >
              Quiz
            </Link>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6 lg:px-8">
          {quickFilters.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.onClick}
              className={[
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition",
                chip.active
                  ? "border-[#C7D4BB] bg-[#DFE7D7] text-[#0F2742]"
                  : "border-[#C7D4BB] bg-white text-[#6F6A66] hover:bg-[#EFE8DC]",
              ].join(" ")}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <section className="pb-1.5">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#6F6A66]">
            Available dogs
          </p>

          <h1 className="mt-1.5 max-w-2xl font-['Fraunces',serif] text-[2rem] font-semibold leading-[1.05] text-[#0F2742] sm:text-4xl">
            Find your next favorite face.
          </h1>

          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#6F6A66] sm:text-base">
            Browse adoptable dogs in Michigan, save favorites, and take the quiz when you're ready for lifestyle-based matches.
          </p>
        </section>

        {filtersOpen ? (
          <section
            ref={filtersRef}
            className="scroll-mt-20 rounded-[1.5rem] border border-[#C7D4BB] bg-white p-4 shadow-lg shadow-[#0F2742]/5 sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-['Fraunces',serif] text-xl font-semibold text-[#0F2742]">
                  Narrow your search
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#6F6A66]">
                  Keep the adoptable dog list broad, then filter by what really matters for your home.
                </p>
              </div>

              <button
                type="button"
                onClick={resetFilters}
                className="shrink-0 text-xs font-bold uppercase tracking-[0.16em] text-[#6F6A66] underline underline-offset-4 hover:text-[#0F2742]"
              >
                Reset
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="col-span-2 text-xs font-bold uppercase tracking-[0.14em] text-[#6F6A66] md:col-span-1">
                Shelter or rescue
                <select
                  value={rescueFilter}
                  onChange={(e) => setRescueFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#C7D4BB] bg-[#F5F1E9] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[#0F2742]"
                >
                  <option value="all">All sources</option>
                  {rescueOptions.map((rescue) => (
                    <option key={rescue.id} value={rescue.id}>
                      {rescue.name} ({rescue.count})
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.14em] text-[#6F6A66]">
                Age
                <select
                  value={ageFilter}
                  onChange={(e) => setAgeFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#C7D4BB] bg-[#F5F1E9] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[#0F2742]"
                >
                  {AGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.14em] text-[#6F6A66]">
                Size
                <select
                  value={sizeFilter}
                  onChange={(e) => setSizeFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#C7D4BB] bg-[#F5F1E9] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[#0F2742]"
                >
                  {SIZE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold uppercase tracking-[0.14em] text-[#6F6A66]">
                Energy
                <select
                  value={energyFilter}
                  onChange={(e) => setEnergyFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#C7D4BB] bg-[#F5F1E9] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[#0F2742]"
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
                      ? "border-[#0F2742] bg-[#0F2742] text-[#F3C982]"
                      : "border-[#C7D4BB] bg-[#F5F1E9] text-[#6F6A66]",
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
              className="mt-4 mb-2 w-full rounded-full bg-[#0F2742] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#F3C982] hover:bg-[#0C1E35]"
              style={{ marginBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
            >
              Show {filteredDogs.length} dogs
            </button>
          </section>
        ) : null}

        {loading ? (
          <div className="mt-5 rounded-[1.35rem] border border-[#C7D4BB] bg-white/60 p-5 text-sm font-semibold text-[#6F6A66]">
            Loading adoptable dogs…
          </div>
        ) : filteredDogs.length === 0 ? (
          <div className="mt-5 rounded-[1.35rem] border border-[#C7D4BB] bg-white/60 p-5">
            <h2 className="font-['Fraunces',serif] text-2xl font-semibold text-[#0F2742]">
              No dogs match those filters yet.
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#6F6A66]">
              Try clearing a few filters or taking the matching quiz.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-2xl bg-[#0F2742] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#F3C982]"
              >
                Clear filters
              </button>

              <Link
                to="/quiz"
                className="rounded-2xl border border-[#0F2742] px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.16em] text-[#0F2742]"
              >
                Take quiz
              </Link>
            </div>
          </div>
        ) : (
          <section className="mt-4 sm:mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#6F6A66]">
                <span className="font-bold text-[#0F2742]">{filteredDogs.length}</span> available dogs
              </p>

              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#6F6A66] underline underline-offset-4 hover:text-[#0F2742]"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
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
