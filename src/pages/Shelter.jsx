// src/pages/Shelter.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import DogCard from "../components/DogCard";

function getParam(search, key) {
  const params = new URLSearchParams(search);
  return params.get(key) || "";
}

export default function Shelter() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const sessionId = useMemo(
    () => getParam(location.search, "session"),
    [location.search]
  );

  const [loading, setLoading] = useState(true);
  const [shelter, setShelter] = useState(null);
  const [dogs, setDogs] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        // Fetch shelter
        const shelterRes = await supabase
          .from("shelters")
          .select("*")
          .eq("id", id)
          .single();

        if (shelterRes.error) throw shelterRes.error;

        // Fetch dogs for this shelter
        const dogsRes = await supabase
          .from("dogs")
          .select("*, shelters ( id, name, city, state, apply_url, website, logo_url )")
          .eq("shelter_id", id)
          .order("name", { ascending: true });

        if (dogsRes.error) throw dogsRes.error;

        if (!cancelled) {
          setShelter(shelterRes.data);
          setDogs(dogsRes.data || []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Unable to load shelter.");
          setShelter(null);
          setDogs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function viewDogs() {
    const params = new URLSearchParams();
    params.set("shelter", id);
    if (sessionId) params.set("session", sessionId);

    navigate(`/results?${params.toString()}`);
  }

  if (loading) {
    return <div className="p-10 text-slate-600">Loading shelter…</div>;
  }

  if (error || !shelter) {
    return (
      <div className="p-10 rounded-xl border border-red-200 bg-red-50 text-red-700">
        {error || "Shelter not found."}
      </div>
    );
  }

  const locationLine = [shelter.city, shelter.state].filter(Boolean).join(", ");
  const applyUrl = shelter.apply_url || shelter.website || "";

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back
        </button>

        {/* Shelter header */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {shelter.name || "Shelter"}
              </h1>
              {locationLine && (
                <p className="mt-1 text-sm text-slate-600">{locationLine}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              {applyUrl && (
                <a
                  href={applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                >
                  Apply / Visit site →
                </a>
              )}

              <button
                onClick={viewDogs}
                className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                View dogs →
              </button>
            </div>
          </div>
        </div>

        {/* Dogs preview */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">
            Dogs at this shelter
          </h2>

          {dogs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              No dogs currently listed.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
              {dogs.slice(0, 6).map((dog) => (
                <DogCard
                  key={dog.id}
                  dog={dog}
                  scorePct={null}
                  showMatch={false}
                />
              ))}
            </div>
          )}

          {dogs.length > 6 && (
            <div className="mt-6">
              <button
                onClick={viewDogs}
                className="text-sm font-semibold text-slate-900 underline hover:decoration-slate-900"
              >
                View all {dogs.length} dogs →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
