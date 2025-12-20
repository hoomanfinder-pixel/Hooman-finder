import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export default function App() {
  const [dogs, setDogs] = useState([]);
  const [error, setError] = useState("");

  const [energyFilter, setEnergyFilter] = useState("All");
  const [playFilter, setPlayFilter] = useState("All");
  const [ageFilter, setAgeFilter] = useState("All");

  // NEW: checkbox filters
  const [pottyOnly, setPottyOnly] = useState(false);
  const [kidsOnly, setKidsOnly] = useState(false);
  const [catsOnly, setCatsOnly] = useState(false);

  useEffect(() => {
    loadDogs();
  }, []);

  async function loadDogs() {
    setError("");

    const { data, error } = await supabase.from("dogs").select("*").limit(50);

    if (error) {
      setError(error.message);
      setDogs([]);
      return;
    }

    setDogs(data || []);
  }

  /* -------------------------
     FILTER HELPERS
  --------------------------*/

  const setFetchMode = () => {
    setPlayFilter("fetch");
  };

  const filteredDogs = dogs.filter((dog) => {
    // Energy dropdown
    if (energyFilter !== "All" && dog.energy_level !== energyFilter) {
      return false;
    }

    // Play style dropdown
    if (
      playFilter !== "All" &&
      (!dog.play_styles || !dog.play_styles.includes(playFilter))
    ) {
      return false;
    }

    // Age dropdown
    if (ageFilter !== "All") {
      if (ageFilter === "Puppy" && dog.age_years > 1) return false;
      if (ageFilter === "Adult" && (dog.age_years < 1 || dog.age_years > 7))
        return false;
      if (ageFilter === "Senior" && dog.age_years < 7) return false;
    }

    // NEW: Potty trained only checkbox
    if (pottyOnly && dog.potty_trained !== true) return false;

    // NEW: Good with kids only checkbox
    if (kidsOnly && dog.good_with_kids !== true) return false;

    // NEW: Good with cats only checkbox
    if (catsOnly && dog.good_with_cats !== true) return false;

    return true;
  });

  return (
    <div className="min-h-screen bg-green-100 p-6">
      {/* Hero */}
      <h1 className="text-3xl font-bold mb-2">Find your perfect rescue dog</h1>

      <p className="text-gray-700 mb-6 max-w-xl">
        Hooman Finder helps match adopters with rescue dogs based on lifestyle,
        preferences, and compatibility.
      </p>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-6 shadow mb-8 max-w-3xl">
        <h2 className="text-xl font-semibold mb-4">Filters</h2>

        {/* Fetch MVP Button */}
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={setFetchMode}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            🥎 Find dogs who love fetch
          </button>

          <span className="text-sm text-gray-600">
            Your Hooman Finder signature filter
          </span>
        </div>

        {/* Dropdowns */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium mb-1">Energy</label>
            <select
              className="w-full rounded-lg border p-2"
              value={energyFilter}
              onChange={(e) => setEnergyFilter(e.target.value)}
            >
              <option>All</option>
              <option>Low</option>
              <option>Moderate</option>
              <option>High</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Play style</label>
            <select
              className="w-full rounded-lg border p-2"
              value={playFilter}
              onChange={(e) => setPlayFilter(e.target.value)}
            >
              <option>All</option>
              <option value="fetch">Fetch</option>
              <option value="tug">Tug</option>
              <option value="chew">Chews toys</option>
              <option value="all">All play</option>
              <option value="none">Ignores toys</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Age</label>
            <select
              className="w-full rounded-lg border p-2"
              value={ageFilter}
              onChange={(e) => setAgeFilter(e.target.value)}
            >
              <option value="All">All ages</option>
              <option value="Puppy">Puppy</option>
              <option value="Adult">Adult</option>
              <option value="Senior">Senior</option>
            </select>
          </div>
        </div>

        {/* NEW: Checkbox filters */}
        <div className="mt-4 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={pottyOnly}
              onChange={(e) => setPottyOnly(e.target.checked)}
            />
            Potty trained only
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={kidsOnly}
              onChange={(e) => setKidsOnly(e.target.checked)}
            />
            Good with kids
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={catsOnly}
              onChange={(e) => setCatsOnly(e.target.checked)}
            />
            Good with cats
          </label>
        </div>

        <p className="mt-3 text-sm text-gray-600">
          Showing {filteredDogs.length} of {dogs.length} dogs
        </p>
      </div>

      {/* Results */}
      <h2 className="text-xl font-semibold mb-4">Featured dogs</h2>

      {error && <p className="text-red-600 mb-4">Error: {error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredDogs.map((dog) => (
          <div key={dog.id} className="rounded-2xl bg-white p-4 shadow">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-semibold">{dog.name}</h3>
              {dog.adoptable && (
                <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                  Adoptable
                </span>
              )}
            </div>

            <div className="text-sm text-gray-700 space-y-1 mb-2">
              <p>
                <span className="font-medium">Age:</span> {dog.age_years} yrs
              </p>
              <p>
                <span className="font-medium">Size:</span> {dog.size}
              </p>
              <p>
                <span className="font-medium">Energy:</span> {dog.energy_level}
              </p>
            </div>

            {/* NEW: Badges */}
            <div className="flex flex-wrap gap-2 mb-2">
              {dog.potty_trained === true ? (
                <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                  Potty trained
                </span>
              ) : (
                <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                  House training in progress
                </span>
              )}

              {dog.first_time_friendly === true && (
                <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                  First-time adopter friendly
                </span>
              )}

              {dog.good_with_kids === true && (
                <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-800">
                  Good with kids
                </span>
              )}

              {dog.good_with_cats === true && (
                <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-800">
                  Good with cats
                </span>
              )}
            </div>

            {Array.isArray(dog.play_styles) && (
              <div className="flex flex-wrap gap-2 mb-2">
                {dog.play_styles.map((style) => (
                  <span
                    key={style}
                    className="rounded-full bg-gray-100 px-2 py-1 text-xs"
                  >
                    {style}
                  </span>
                ))}
              </div>
            )}

            {dog.description && (
              <p className="text-sm text-gray-600">{dog.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
