// src/pages/DogDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { rankDogs } from "../lib/matchingLogic";

const SAVED_KEY = "hooman_saved_dog_ids_v1";

function getParam(search, key) {
  const params = new URLSearchParams(search);
  return params.get(key);
}

function readSavedIds() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeSavedIds(ids) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function boolLabel(v) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "Unknown";
}

function textOrUnknown(v) {
  const s = String(v ?? "").trim();
  return s ? s : "Unknown";
}

/* ✅ NEW: Age formatter */
function ageLabel(ageYears) {
  const n = Number(ageYears);
  if (!Number.isFinite(n)) return "Unknown";

  if (n < 1) {
    const months = Math.max(1, Math.round(n * 12));
    return `${months} ${months === 1 ? "month" : "months"}`;
  }

  const years = Math.round(n);
  return `${years} ${years === 1 ? "yr" : "yrs"}`;
}

function chipClass(tone) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border";
  switch (tone) {
    case "blue":
      return `${base} bg-blue-50 text-blue-700 border-blue-200`;
    case "green":
      return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
    case "amber":
      return `${base} bg-amber-50 text-amber-800 border-amber-200`;
    case "purple":
      return `${base} bg-violet-50 text-violet-700 border-violet-200`;
    case "pink":
      return `${base} bg-pink-50 text-pink-700 border-pink-200`;
    case "teal":
      return `${base} bg-teal-50 text-teal-700 border-teal-200`;
    default:
      return `${base} bg-slate-50 text-slate-700 border-slate-200`;
  }
}

function traitRow(label, value, tone = "slate") {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="text-sm font-semibold text-slate-800">{label}</div>
      <div className={chipClass(tone)}>{value}</div>
    </div>
  );
}

export default function DogDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  const sessionId = useMemo(
    () => getParam(location.search, "session"),
    [location.search]
  );

  const [loading, setLoading] = useState(true);
  const [dog, setDog] = useState(null);
  const [error, setError] = useState("");
  const [savedIds, setSavedIds] = useState(() => readSavedIds());

  const isSaved = savedIds.includes(String(id));

  useEffect(() => {
    let cancelled = false;

    async function loadDog() {
      setLoading(true);
      setError("");

      try {
        const { data, error: e } = await supabase
          .from("dogs")
          .select(
            "*, shelters ( id, name, city, state, apply_url, website, contact_email, logo_url )"
          )
          .eq("id", id)
          .maybeSingle();

        if (e) throw e;
        if (!cancelled) setDog(data || null);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Could not load dog.");
          setDog(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (id) loadDog();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function toggleSaved() {
    const sid = String(id);
    const next = isSaved
      ? savedIds.filter((x) => x !== sid)
      : [...savedIds, sid];
    setSavedIds(next);
    writeSavedIds(next);
  }

  const shelter = dog?.shelters || null;
  const applyUrl =
    shelter?.apply_url || dog?.apply_url || dog?.application_url || "";

  const heroImg =
    dog?.photo_url ||
    dog?.image_url ||
    (Array.isArray(dog?.photos) && dog.photos[0]) ||
    "";

  const traits = useMemo(() => {
    if (!dog) return [];

    const playStyles = Array.isArray(dog.play_styles)
      ? dog.play_styles
      : dog.play_styles
      ? [dog.play_styles]
      : [];

    return [
      { label: "Age", value: ageLabel(dog.age_years), tone: "blue" },
      { label: "Size", value: textOrUnknown(dog.size), tone: "purple" },
      { label: "Energy level", value: textOrUnknown(dog.energy_level), tone: "pink" },

      { label: "Hypoallergenic", value: boolLabel(dog.hypoallergenic), tone: "green" },
      { label: "Potty trained", value: boolLabel(dog.potty_trained), tone: "green" },

      { label: "Good with kids", value: boolLabel(dog.good_with_kids), tone: "amber" },
      { label: "Good with cats", value: boolLabel(dog.good_with_cats), tone: "amber" },
      { label: "Good with other dogs", value: boolLabel(dog.good_with_dogs), tone: "amber" },

      { label: "Shedding", value: textOrUnknown(dog.shedding_level), tone: "slate" },
      { label: "Grooming", value: textOrUnknown(dog.grooming_level), tone: "slate" },

      {
        label: "Play style",
        value: playStyles.length ? playStyles.join(", ") : "Unknown",
        tone: "blue",
      },

      { label: "Noise level", value: textOrUnknown(dog.barking_level), tone: "purple" },
      {
        label: "Yard needed",
        value:
          typeof dog.yard_required === "boolean"
            ? boolLabel(dog.yard_required)
            : "Unknown",
        tone: "pink",
      },
    ];
  }, [dog]);

  if (loading) {
    return <div className="p-10 text-slate-600">Loading…</div>;
  }

  if (error || !dog) {
    return <div className="p-10 text-red-600">{error || "Dog not found."}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-6xl px-6 py-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* LEFT */}
        <div className="space-y-6">
          <div className="rounded-2xl bg-white border overflow-hidden">
            {heroImg && <img src={heroImg} alt={dog.name} />}
            <button
              onClick={toggleSaved}
              className="m-4 rounded-full px-4 py-2 bg-white border"
            >
              {isSaved ? "Saved" : "Save"}
            </button>
          </div>

          {dog.description && (
            <div className="rounded-2xl bg-white border p-6">
              <h3 className="font-bold text-slate-900 mb-2">About</h3>
              <p className="text-slate-700">{dog.description}</p>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="rounded-2xl bg-white border p-6">
          <h1 className="text-3xl font-bold">{dog.name}</h1>

          <div className="mt-4 divide-y">
            {traits.map((t) => (
              <div key={t.label}>{traitRow(t.label, t.value, t.tone)}</div>
            ))}
          </div>

          <button
            onClick={() => applyUrl && window.open(applyUrl, "_blank")}
            className="mt-6 w-full bg-slate-900 text-white py-3 rounded-full"
          >
            Apply on shelter site
          </button>
        </div>
      </main>
    </div>
  );
}
