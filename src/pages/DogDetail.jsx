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

function parseAiTraits(raw) {
  if (!raw) return null;

  if (typeof raw === "object") return raw;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeAiValue(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  return String(value ?? "").trim().toLowerCase();
}

function getAiTrait(aiTraits, key) {
  const trait = aiTraits?.[key];

  if (!trait || typeof trait !== "object") return null;

  const value = normalizeAiValue(trait.value);
  const confidence = Number(trait.confidence ?? 0);
  const evidence = cleanText(trait.evidence || "");

  if (!value || value === "unknown") return null;
  if (!Number.isFinite(confidence) || confidence < 0.5) return null;

  return {
    key,
    value,
    confidence,
    evidence,
  };
}

function getAiMatchClues(dog) {
  const aiTraits = parseAiTraits(dog?.ai_traits);
  if (!aiTraits) return [];

  const clues = [];

  const add = ({ key, icon, label, detail, priority = 10 }) => {
    const trait = getAiTrait(aiTraits, key);
    if (!trait) return;

    clues.push({
      key,
      icon,
      label: typeof label === "function" ? label(trait) : label,
      detail: typeof detail === "function" ? detail(trait) : detail,
      value: trait.value,
      confidence: trait.confidence,
      evidence: trait.evidence,
      priority,
    });
  };

  add({
    key: "first_time_friendly",
    icon: "🌱",
    label: (trait) =>
      trait.value === "true" ? "May be beginner-friendly" : "Could be beginner-friendly",
    detail: "Estimated from temperament and bio language.",
    priority: 1,
  });

  add({
    key: "energy_level",
    icon: "⚡",
    label: (trait) => {
      if (trait.value === "low") return "Lower energy";
      if (trait.value === "high") return "Higher energy";
      if (trait.value === "moderate") return "Moderate energy";
      return "Energy clue available";
    },
    detail: "Based on listed energy or bio clues.",
    priority: 2,
  });

  add({
    key: "good_with_dogs",
    icon: "🐕",
    label: (trait) =>
      trait.value === "true" ? "Dog-friendly clue" : "May do well with dogs",
    detail: "Confirm dog introductions with the rescue.",
    priority: 3,
  });

  add({
    key: "good_with_cats",
    icon: "🐈",
    label: (trait) =>
      trait.value === "true" ? "Cat-friendly clue" : "May do well with cats",
    detail: "Confirm cat compatibility with the rescue.",
    priority: 4,
  });

  add({
    key: "good_with_kids",
    icon: "👨‍👩‍👧",
    label: (trait) =>
      trait.value === "true" ? "Kid-friendly clue" : "May do well with kids",
    detail: "Confirm child age/handling details with the rescue.",
    priority: 5,
  });

  add({
    key: "potty_trained",
    icon: "🏠",
    label: (trait) =>
      trait.value === "true" ? "Potty-training clue" : "Potty-training may need confirming",
    detail: "Estimated from listed training details.",
    priority: 6,
  });

  add({
    key: "crate_trained",
    icon: "🧺",
    label: (trait) =>
      trait.value === "true" ? "Crate-training clue" : "May have crate-training notes",
    detail: "Based on the rescue bio when mentioned.",
    priority: 7,
  });

  add({
    key: "leash_trained",
    icon: "🦮",
    label: (trait) =>
      trait.value === "true" ? "Leash manners clue" : "May have leash-training notes",
    detail: "Confirm leash behavior with the rescue.",
    priority: 8,
  });

  add({
    key: "apartment_friendly",
    icon: "🏢",
    label: (trait) =>
      trait.value === "true" ? "Apartment-friendly clue" : "May work in an apartment",
    detail: "Estimated from energy, noise, and home needs.",
    priority: 9,
  });

  add({
    key: "needs_yard",
    icon: "🌳",
    label: (trait) =>
      trait.value === "true" ? "May need yard access" : "Yard may not be required",
    detail: "Based on activity and home setup clues.",
    priority: 10,
  });

  add({
    key: "training_needs",
    icon: "🎓",
    label: (trait) => {
      if (trait.value === "high") return "Higher training needs";
      if (trait.value === "moderate") return "Moderate training needs";
      if (trait.value === "low") return "Lower training needs";
      return "Training clue available";
    },
    detail: "Estimated from behavior and training notes.",
    priority: 11,
  });

  add({
    key: "home_environment",
    icon: "🛋️",
    label: (trait) => {
      if (trait.value === "quiet") return "May prefer a quieter home";
      if (trait.value === "active") return "May enjoy an active home";
      if (trait.value === "average") return "May fit an average home routine";
      return "Home-style clue available";
    },
    detail: "Estimated from the dog’s bio and needs.",
    priority: 12,
  });

  add({
    key: "affection_level",
    icon: "♡",
    label: (trait) =>
      trait.value === "true" || trait.value === "high"
        ? "Affectionate clue"
        : "May be affectionate",
    detail: "Based on affection/social wording in the bio.",
    priority: 13,
  });

  add({
    key: "playfulness",
    icon: "🎾",
    label: (trait) =>
      trait.value === "true" || trait.value === "high"
        ? "Playful clue"
        : "May enjoy playtime",
    detail: "Based on activity or play wording in the bio.",
    priority: 14,
  });

  return clues
    .filter((clue) => clue.value !== "false")
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.confidence - a.confidence;
    })
    .slice(0, 6);
}

function getAiDisclosure(aiTraits) {
  if (!aiTraits) return null;

  const sourceVersion = aiTraits?.source?.version || "";
  const needsReview = aiTraits?.needs_human_review === true;
  const cautionNotes = Array.isArray(aiTraits?.caution_notes)
    ? aiTraits.caution_notes.filter(Boolean).slice(0, 3)
    : [];

  return {
    sourceVersion,
    needsReview,
    cautionNotes,
  };
}

export default function DogDetail() {
  const { id } = useParams();

  const [dog, setDog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [imgSrc, setImgSrc] = useState(FALLBACK_IMG);
  const [saved, setSaved] = useState(() => isSavedId(id));
  const [aiInfoOpen, setAiInfoOpen] = useState(false);

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

  const aiTraits = parseAiTraits(dog.ai_traits);
  const aiClues = getAiMatchClues(dog);
  const aiDisclosure = getAiDisclosure(aiTraits);

  return (
    <div className="min-h-screen bg-slate-50">
      {aiInfoOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm"
          onMouseDown={() => setAiInfoOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  AI-assisted match clues
                </div>
                <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-slate-950">
                  What does this mean?
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setAiInfoOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-950"
                aria-label="Close AI information"
              >
                ×
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-700">
              These clues are generated from the rescue or shelter listing to help you compare
              dogs more easily. They are not official behavior guarantees.
            </p>

            <p className="mt-3 text-sm leading-6 text-slate-700">
              Always confirm details like kids, cats, dogs, training, and home fit directly with
              the rescue before applying.
            </p>

            {aiDisclosure?.needsReview ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                This listing has limited or potentially messy bio details, so the AI clues should
                be treated as extra cautious.
              </div>
            ) : null}

            {aiDisclosure?.cautionNotes?.length ? (
              <div className="mt-4">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Notes
                </div>
                <ul className="mt-2 space-y-2 text-sm leading-5 text-slate-600">
                  {aiDisclosure.cautionNotes.map((note) => (
                    <li key={note} className="rounded-2xl bg-slate-50 px-3 py-2">
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setAiInfoOpen(false)}
              className="mt-5 w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between">
          <Link to="/dogs" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
            ← Back to dogs
          </Link>

          <Link to="/saved" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
            View saved dogs
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="relative aspect-[4/3] w-full bg-slate-100">
                <img
                  src={imgSrc}
                  alt={name}
                  className="absolute inset-0 h-full w-full bg-slate-100 object-contain"
                  onError={() => setImgSrc(FALLBACK_IMG)}
                />

                <button
                  type="button"
                  onClick={onToggleSaved}
                  className={[
                    "absolute bottom-4 right-4 inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition",
                    saved
                      ? "border-rose-600 bg-rose-600 text-white"
                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {saved ? "♥ Saved" : "♡ Save"}
                </button>
              </div>

              <div className="border-t border-slate-200 px-5 py-4">
                <div className="text-lg font-extrabold text-slate-900">{name}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {breed} • {age} • {dog.size || "Size unknown"} •{" "}
                  {dog.energy_level || "Energy unknown"}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-extrabold text-slate-900">About</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{description}</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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
                      ? "border-rose-600 bg-rose-600 text-white"
                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
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
                      : "cursor-not-allowed bg-slate-200 text-slate-500"
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
                      className="h-12 w-12 rounded-full border border-slate-200 bg-white object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full border border-slate-200 bg-slate-100" />
                  )}

                  <div>
                    <div className="font-semibold text-slate-900">{shelterName}</div>
                    <div className="text-sm text-slate-600">{location}</div>
                  </div>
                </div>
              </div>
            </div>

            {aiClues.length ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-extrabold text-slate-900">
                      AI-assisted match clues
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Estimated from the dog’s rescue bio when structured details are limited.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAiInfoOpen(true)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-black text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    aria-label="Learn about AI-assisted match clues"
                  >
                    i
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {aiClues.map((clue) => (
                    <AiClue key={clue.key} clue={clue} />
                  ))}
                </div>

                {aiDisclosure?.needsReview ? (
                  <button
                    type="button"
                    onClick={() => setAiInfoOpen(true)}
                    className="mt-4 w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs font-semibold leading-5 text-amber-900 hover:bg-amber-100"
                  >
                    This listing has limited or messy bio details. Tap to see how AI-assisted clues
                    should be interpreted.
                  </button>
                ) : (
                  <p className="mt-4 text-xs leading-5 text-slate-500">
                    These are helpful clues, not guarantees. Confirm details directly with the
                    rescue before applying.
                  </p>
                )}
              </div>
            ) : null}

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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

function AiClue({ clue }) {
  const isMaybe = clue.value === "maybe";

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm ring-1 ring-slate-200">
          {clue.icon}
        </div>

        <div className="min-w-0">
          <div className="text-sm font-extrabold text-slate-900">
            {isMaybe ? clue.label : clue.label}
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-600">{clue.detail}</div>

          {clue.evidence ? (
            <div className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-500">
              Bio clue: {clue.evidence}
            </div>
          ) : null}
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