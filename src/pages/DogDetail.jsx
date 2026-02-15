// src/pages/DogDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

// Simple inline fallback (no new image file required)
const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
    <rect width="100%" height="100%" fill="#F1F5F9"/>
    <circle cx="210" cy="200" r="60" fill="#CBD5E1"/>
    <circle cx="390" cy="200" r="60" fill="#CBD5E1"/>
    <rect x="250" y="220" width="100" height="80" rx="28" fill="#CBD5E1"/>
    <text x="50%" y="70%" text-anchor="middle" font-family="Arial" font-size="20" fill="#475569">
      Photo unavailable
    </text>
  </svg>
`);

function normalizeImageUrl(raw) {
  if (!raw || typeof raw !== "string") return "";

  const trimmed = raw.trim();
  if (!trimmed) return "";

  // If it's protocol-relative (//example.com/img.jpg)
  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  // If it's http, try to upgrade to https (prevents mixed-content issues)
  if (trimmed.startsWith("http://")) return trimmed.replace("http://", "https://");

  // If it's already https or a data uri
  if (trimmed.startsWith("https://") || trimmed.startsWith("data:")) return trimmed;

  // If it's a local/public path like "/dogs/nala.jpg"
  if (trimmed.startsWith("/")) return trimmed;

  // If it's something like "dogs/nala.jpg" assume public
  return `/${trimmed}`;
}

function pickDogImage(dog) {
  if (!dog) return "";

  // Try common field names first
  const candidates = [
    dog.photo_url,
    dog.image_url,
    dog.photo,
    dog.image,
    dog.primary_photo_url,
    dog.profile_photo_url,
    dog.img,
    dog.picture,
  ];

  // If you store an array of photos
  if (Array.isArray(dog.photos) && dog.photos.length) candidates.unshift(dog.photos[0]);
  if (Array.isArray(dog.images) && dog.images.length) candidates.unshift(dog.images[0]);

  // If you store JSON like { photos: [{url: "..."}] }
  if (Array.isArray(dog.photos) && dog.photos[0] && typeof dog.photos[0] === "object") {
    candidates.unshift(dog.photos[0].url, dog.photos[0].src);
  }
  if (Array.isArray(dog.images) && dog.images[0] && typeof dog.images[0] === "object") {
    candidates.unshift(dog.images[0].url, dog.images[0].src);
  }

  // First usable URL wins
  for (const c of candidates) {
    const url = normalizeImageUrl(c);
    if (url) return url;
  }

  return "";
}

export default function DogDetail() {
  const { id } = useParams();

  const [dog, setDog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Image state so we can swap to fallback on error
  const [imgSrc, setImgSrc] = useState(FALLBACK_IMG);

  useEffect(() => {
    let isMounted = true;

    async function fetchDog() {
      setLoading(true);
      setLoadError("");

      try {
        // Adjust table name/columns if yours differ
        const { data, error } = await supabase
          .from("dogs")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw error;

        if (!isMounted) return;
        setDog(data || null);
      } catch (err) {
        if (!isMounted) return;
        setLoadError(err?.message || "Failed to load dog.");
        setDog(null);
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    }

    fetchDog();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const resolvedImage = useMemo(() => pickDogImage(dog), [dog]);

  // Whenever the dog changes, set image to resolved or fallback
  useEffect(() => {
    setImgSrc(resolvedImage || FALLBACK_IMG);
  }, [resolvedImage]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="h-6 w-40 rounded bg-slate-200 animate-pulse" />
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-80 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-80 rounded-2xl bg-slate-200 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !dog) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Link to="/dogs" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
            ← Back to dogs
          </Link>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
            <h1 className="text-xl font-extrabold text-slate-900">Dog not found</h1>
            <p className="mt-2 text-slate-600">{loadError || "This dog may have been removed."}</p>
          </div>
        </div>
      </div>
    );
  }

  const name = dog.name || "Unnamed dog";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between">
          <Link to="/dogs" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
            ← Back
          </Link>

          <Link to="/saved" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
            Saved
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: PHOTO + ABOUT */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {/* Use aspect ratio so it behaves on mobile and never “collapses” */}
              <div className="relative w-full aspect-[4/3] bg-slate-100">
                <img
                  src={imgSrc}
                  alt={name}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="eager"
                  onError={() => setImgSrc(FALLBACK_IMG)}
                />
              </div>

              {/* Name row (optional) */}
              <div className="px-5 py-4 border-t border-slate-200">
                <div className="text-lg font-extrabold text-slate-900">{name}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {(dog.breed || "Unknown")} • {(dog.age || "Unknown")} • {(dog.size || "Unknown")}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
              <div className="text-sm font-extrabold text-slate-900">About</div>
              <p className="mt-2 text-sm text-slate-700 leading-relaxed">
                {dog.about || dog.description || "No description provided yet."}
              </p>
            </div>
          </div>

          {/* RIGHT: DETAILS */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
              <h1 className="text-3xl font-extrabold text-slate-900">{name}</h1>
              <p className="mt-2 text-slate-600">
                {(dog.breed || "Unknown")} • {(dog.age || "Unknown")} • {(dog.size || "Unknown")} •{" "}
                {(dog.energy || "Unknown")}
              </p>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-extrabold text-slate-900">Hooman Finder’s role</div>
                <p className="mt-2 text-sm text-slate-700">
                  Hooman Finder helps you find dogs that fit your lifestyle. We don’t process adoptions —
                  when you’re ready, you’ll apply directly with the shelter or rescue.
                </p>
              </div>

              <div className="mt-5">
                <div className="text-sm font-extrabold text-slate-900">Apply to adopt</div>
                <p className="mt-1 text-sm text-slate-600">
                  You’ll be redirected to the shelter’s official application page.
                </p>

                <a
                  href={normalizeImageUrl(dog.apply_url) || dog.apply_url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  onClick={(e) => {
                    const url = dog.apply_url;
                    if (!url) e.preventDefault();
                  }}
                >
                  Apply on shelter site
                </a>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <div className="text-sm font-extrabold text-slate-900">Listed by</div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-slate-100 border border-slate-200" />
                  <div>
                    <div className="font-semibold text-slate-900">
                      {dog.shelter_name || "Shelter/Rescue"}
                    </div>
                    <div className="text-sm text-slate-600">{dog.location || "Location unknown"}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Traits / any extras */}
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div className="text-lg font-extrabold text-slate-900">Traits</div>
                <div className="text-xs text-slate-500">Unknown means the shelter hasn’t provided it yet.</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Trait label="Age" value={dog.age} />
                <Trait label="Size" value={dog.size} />
                <Trait label="Energy" value={dog.energy} />
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
  const v =
    value === true ? "Yes" : value === false ? "No" : value === null || value === undefined || value === ""
      ? "Unknown"
      : String(value);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-extrabold text-slate-900">{v}</div>
    </div>
  );
}
