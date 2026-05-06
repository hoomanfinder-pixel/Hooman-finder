// src/pages/DogDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const SAVED_KEY = "hooman_saved_dog_ids_v1";

const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
    <rect width="100%" height="100%" fill="#F1F5F9"/>
    <text x="50%" y="50%" text-anchor="middle" font-family="Arial" font-size="22" fill="#475569">
      Photo unavailable
    </text>
  </svg>
`);

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
    window.dispatchEvent(new Event("hooman:saved_changed"));
  } catch {}
}

function isSavedId(id) {
  return readSavedIds().includes(String(id));
}

function toggleSavedId(id) {
  const sid = String(id);
  const ids = readSavedIds();
  const next = ids.includes(sid) ? ids.filter((x) => x !== sid) : [sid, ...ids];
  writeSavedIds(next);
  return next.includes(sid);
}

function normalizeImageUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("http://")) return trimmed.replace("http://", "https://");
  if (trimmed.startsWith("https://") || trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return `/${trimmed}`;
}

function pickDogImage(dog) {
  const candidates = [
    dog?.photo_url,
    dog?.image_url,
    dog?.photo,
    dog?.image,
    dog?.primary_photo_url,
  ];

  for (const item of candidates) {
    const url = normalizeImageUrl(item);
    if (url) return url;
  }

  return "";
}

function decodeHtmlOnce(value) {
  if (!value) return "";

  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function cleanText(value) {
  if (!value) return "";

  let text = String(value);

  for (let i = 0; i < 4; i += 1) {
    const decoded = decodeHtmlOnce(text);
    if (decoded === text) break;
    text = decoded;
  }

  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function displayAge(dog) {
  if (dog?.age_text) return dog.age_text;

  if (dog?.age_years !== null && dog?.age_years !== undefined && dog?.age_years !== "") {
    return `${dog.age_years} years`;
  }

  return "Age unknown";
}

function displayBreed(dog) {
  return dog?.breed || "Mixed breed";
}

function displayShelterName(dog) {
  return dog?.shelters?.name || dog?.shelter_name || "Shelter/Rescue";
}

function displayShelterLogo(dog) {
  return dog?.shelters?.logo_url || "";
}

function displayLocation(dog) {
  if (dog?.shelters?.city && dog?.shelters?.state) {
    return `${dog.shelters.city}, ${dog.shelters.state}`;
  }

  if (dog?.placement_location) return dog.placement_location;

  if (dog?.placement_city && dog?.placement_state) {
    return `${dog.placement_city}, ${dog.placement_state}`;
  }

  return "Location unknown";
}

function displayApplyLink(dog) {
  return (
    dog?.shelters?.apply_url ||
    dog?.shelters?.website ||
    dog?.source_url ||
    dog?.shelter_website ||
    ""
  );
}

export default function DogDetail() {
  const { id } = useParams();

  const [dog, setDog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [imgSrc, setImgSrc] = useState(FALLBACK_IMG);
  const [saved, setSaved] = useState(() => isSavedId(id));

  useEffect(() => {
    const sync = () => setSaved(isSavedId(id));
    window.addEventListener("storage", sync);
    window.addEventListener("hooman:saved_changed", sync);

    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("hooman:saved_changed", sync);
    };
  }, [id]);

  useEffect(() => {
    let isMounted = true;

    async function fetchDog() {
      setLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("dogs")
        .select(`
          *,
          shelters (
            name,
            website,
            apply_url,
            logo_url,
            city,
            state
          )
        `)
        .eq("id", id)
        .single();

      if (!isMounted) return;

      if (error) {
        setLoadError(error.message || "Failed to load dog.");
        setDog(null);
      } else {
        setDog(data);
      }

      setLoading(false);
    }

    fetchDog();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const resolvedImage = useMemo(() => pickDogImage(dog), [dog]);

  useEffect(() => {
    setImgSrc(resolvedImage || FALLBACK_IMG);
  }, [resolvedImage]);

  function onToggleSaved() {
    const nextSaved = toggleSavedId(id);
    setSaved(nextSaved);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8 text-slate-600">
          Loading dog…
        </div>
      </div>
    );
  }

  if (loadError || !dog) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Link to="/dogs" className="text-sm font-semibold text-slate-700">
            ← Back to dogs
          </Link>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
            <h1 className="text-xl font-extrabold text-slate-900">Dog not found</h1>
            <p className="mt-2 text-slate-600">
              {loadError || "This dog may have been removed."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const name = dog.name || "Unnamed dog";
  const age = displayAge(dog);
  const breed = displayBreed(dog);
  const shelterName = displayShelterName(dog);
  const shelterLogo = displayShelterLogo(dog);
  const location = displayLocation(dog);
  const applyLink = displayApplyLink(dog);
  const description = cleanText(dog.description) || "No description provided yet.";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between">
          <Link to="/dogs" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
            ← Back to dogs
          </Link>

          <Link to="/saved" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
            View saved dogs
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="relative w-full aspect-[4/3] bg-slate-100">
                <img
                  src={imgSrc}
                  alt={name}
                  className="absolute inset-0 h-full w-full object-contain bg-slate-100"
                  onError={() => setImgSrc(FALLBACK_IMG)}
                />

                <button
                  type="button"
                  onClick={onToggleSaved}
                  className={[
                    "absolute right-4 bottom-4 inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition",
                    saved
                      ? "bg-rose-600 text-white border-rose-600"
                      : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {saved ? "♥ Saved" : "♡ Save"}
                </button>
              </div>

              <div className="px-5 py-4 border-t border-slate-200">
                <div className="text-lg font-extrabold text-slate-900">{name}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {breed} • {age} • {dog.size || "Size unknown"} •{" "}
                  {dog.energy_level || "Energy unknown"}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
              <div className="text-sm font-extrabold text-slate-900">About</div>
              <p className="mt-2 text-sm text-slate-700 leading-relaxed">{description}</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-extrabold text-slate-900">{name}</h1>

                  <p className="mt-2 text-slate-600">
                    {breed} • {age} • {dog.size || "Size unknown"} •{" "}
                    {dog.energy_level || "Energy unknown"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onToggleSaved}
                  className={[
                    "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition",
                    saved
                      ? "bg-rose-600 text-white border-rose-600"
                      : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {saved ? "♥ Saved" : "♡ Save"}
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-extrabold text-slate-900">Hooman Finder’s role</div>
                <p className="mt-2 text-sm text-slate-700">
                  Hooman Finder helps you discover dogs that may fit your lifestyle. We do not
                  process adoptions directly — when you’re ready, apply through the shelter or rescue.
                </p>
              </div>

              <div className="mt-5">
                <div className="text-sm font-extrabold text-slate-900">Apply to adopt</div>
                <p className="mt-1 text-sm text-slate-600">
                  You’ll be redirected to the shelter’s official website or application page.
                </p>

                <a
                  href={applyLink || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={`mt-3 inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-sm font-semibold ${
                    applyLink
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "bg-slate-200 text-slate-500 cursor-not-allowed"
                  }`}
                  onClick={(e) => {
                    if (!applyLink) e.preventDefault();
                  }}
                >
                  {applyLink ? "Apply on shelter site" : "Application link unavailable"}
                </a>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <div className="text-sm font-extrabold text-slate-900">Listed by</div>
                <div className="mt-3 flex items-center gap-3">
                  {shelterLogo ? (
                    <img
                      src={shelterLogo}
                      alt={`${shelterName} logo`}
                      className="h-12 w-12 rounded-full border border-slate-200 object-cover bg-white"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-slate-100 border border-slate-200" />
                  )}

                  <div>
                    <div className="font-semibold text-slate-900">{shelterName}</div>
                    <div className="text-sm text-slate-600">{location}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
              <div className="text-lg font-extrabold text-slate-900">Traits</div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Trait label="Size" value={dog.size} />
                <Trait label="Energy" value={dog.energy_level} />
                <Trait label="Potty trained" value={dog.potty_trained} />
                <Trait label="Good with dogs" value={dog.good_with_dogs} />
                <Trait label="Good with cats" value={dog.good_with_cats} />
                <Trait label="Good with kids" value={dog.good_with_kids} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Trait({ label, value }) {
  const display =
    value === true
      ? "Yes"
      : value === false
        ? "No"
        : value === null || value === undefined || value === ""
          ? "Unknown"
          : String(value);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-extrabold text-slate-900">{display}</div>
    </div>
  );
}