// src/pages/DogDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import SEO from "../components/SEO";
import { computeRankedMatches } from "../lib/matchingLogic";
import { getMatchReasons as getSupportedMatchReasons } from "../lib/matchReasons.js";
import { isPubliclyVisibleDog } from "../lib/dogVisibility";
import {
  getDogApplyLink,
  getDogApplyLabel,
  getDogSourceLocation,
  getDogSourceLogo,
  getDogSourceName,
} from "../lib/dogSource";
import {
  getActiveQuizSessionId,
  loadQuizResponses,
  setActiveQuizSessionId,
} from "../lib/quizStorage";
import { supabase } from "../lib/supabase";
import { FALLBACK_DOG_IMAGE, normalizeImageUrl } from "../lib/urlSafety";
import { decodeHtmlEntities } from "../utils/decodeHtmlEntities";

const SAVED_KEY = "hooman_saved_dog_ids_v1";
const BIO_PREVIEW_LENGTH = 520;
const FALLBACK_IMG = FALLBACK_DOG_IMAGE;

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

function pickDogImage(dog) {
  const candidates = [
    dog?.photo_url,
    dog?.image_url,
    dog?.photo,
    dog?.image,
    dog?.primary_photo_url,
  ];

  for (const item of candidates) {
    const url = normalizeImageUrl(item, { allowRelative: false });
    if (url) return url;
  }

  return "";
}

function cleanText(value) {
  if (!value) return "";

  return decodeHtmlEntities(value)
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
  return getDogSourceName(dog);
}

function displayShelterLogo(dog) {
  return getDogSourceLogo(dog);
}

function displayLocation(dog) {
  return getDogSourceLocation(dog);
}

function displayApplyLink(dog) {
  return getDogApplyLink(dog);
}

function displayApplyLabel(dog) {
  return getDogApplyLabel(dog);
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

function normalizeBioValue(value) {
  const raw = String(value || "unknown").trim().toLowerCase();

  if (raw === "yes") return "yes";
  if (raw === "most_likely") return "most_likely";
  if (raw === "may_do_well") return "may_do_well";
  if (raw === "no") return "no";

  return "unknown";
}

function hasUsefulBioValue(value) {
  const normalized = normalizeBioValue(value);
  return normalized !== "unknown";
}

function displayBooleanValue(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "Unknown";
  return String(value);
}

function displayBioTrait(value) {
  const normalized = normalizeBioValue(value);

  if (normalized === "yes") return "Yes";
  if (normalized === "most_likely") return "Most likely";
  if (normalized === "may_do_well") return "May do well";
  if (normalized === "no") return "No";

  return "Unknown";
}

function normalizeEnergyValue(value) {
  const raw = String(value || "unknown").trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (["low", "medium_low", "medium", "medium_high", "high"].includes(raw)) return raw;
  if (raw === "not_required") return "low";
  if (raw.includes("moderate") || raw.includes("medium")) return "medium";
  if (raw.includes("high")) return "high";
  if (raw.includes("low")) return "low";
  return "unknown";
}

function obedienceTrainingNeed(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("needs training")) return "High";
  if (raw.includes("basic training")) return "Moderate";
  if (raw.includes("well trained")) return "Low";
  return null;
}

function displayEnergyValue(value) {
  const normalized = normalizeEnergyValue(value);
  const labels = {
    low: "Low",
    medium_low: "Medium-low",
    medium: "Medium",
    medium_high: "Medium-high",
    high: "High",
    unknown: "Unknown",
  };
  return labels[normalized] || "Unknown";
}

function normalizeSheddingValue(value) {
  const raw = String(value || "unknown").trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (["low", "medium", "high"].includes(raw)) return raw;
  if (raw === "none" || raw === "minimal") return "low";
  if (raw === "moderate") return "medium";
  if (raw === "heavy") return "high";
  return "unknown";
}

function displaySheddingValue(value) {
  const normalized = normalizeSheddingValue(value);
  const labels = {
    low: "Low",
    medium: "Medium",
    high: "High",
    unknown: "Unknown",
  };
  return labels[normalized] || "Unknown";
}

function getTraitDisplay({ structuredValue, bioValue }) {
  if (structuredValue === true) {
    return {
      value: "Yes",
      source: "listed",
      estimated: false,
    };
  }

  if (structuredValue === false) {
    return {
      value: "No",
      source: "listed",
      estimated: false,
    };
  }

  const normalizedBio = normalizeBioValue(bioValue);

  if (normalizedBio !== "unknown") {
    return {
      value: displayBioTrait(normalizedBio),
      source: "bio",
      estimated: true,
    };
  }

  return {
    value: "Unknown",
    source: "unknown",
    estimated: false,
  };
}

function getEnergyTrait({ structuredValue, bioValue }) {
  const structured = normalizeEnergyValue(structuredValue);
  if (structured !== "unknown") {
    return {
      value: displayEnergyValue(structured),
      source: "listed",
      estimated: false,
    };
  }

  const bio = normalizeEnergyValue(bioValue);
  if (bio !== "unknown") {
    return {
      value: `Likely ${displayEnergyValue(bio).toLowerCase()}`,
      source: "bio",
      estimated: true,
    };
  }

  return {
    value: "Unknown",
    source: "unknown",
    estimated: false,
  };
}

function getSheddingTrait({ structuredValue, bioValue }) {
  const structured = normalizeSheddingValue(structuredValue);
  if (structured !== "unknown") {
    return {
      value: displaySheddingValue(structured),
      source: "listed",
      estimated: false,
    };
  }

  const bio = normalizeSheddingValue(bioValue);
  if (bio !== "unknown") {
    return {
      value: `Likely ${displaySheddingValue(bio).toLowerCase()}`,
      source: "bio",
      estimated: true,
    };
  }

  return {
    value: "Unknown",
    source: "unknown",
    estimated: false,
  };
}

function getEstimatedTextTrait({ value, displayValue }) {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "unknown") {
    return {
      value: "Unknown",
      source: "unknown",
      estimated: false,
    };
  }

  return {
    value: displayValue || raw,
    source: "bio",
    estimated: true,
  };
}

function getSimpleTrait({ value }) {
  return {
    value:
      value === null || value === undefined || value === ""
        ? "Unknown"
        : String(value),
    source: "listed",
    estimated: false,
  };
}

function getSizeTrait({ structuredValue, bioValue }) {
  const structured = String(structuredValue || "").trim();
  if (structured) {
    return { value: structured, source: "listed", estimated: false };
  }

  const bio = String(bioValue || "").trim();
  if (bio) {
    return {
      value: `Likely ${bio}`,
      source: "bio",
      estimated: true,
      note: "Estimated adult size, from breed and listing details",
      title: "Estimated adult size from breed and age for puppies. Not guaranteed — confirm with the shelter or rescue.",
    };
  }

  return { value: "Unknown", source: "unknown", estimated: false };
}

function getPreviewText(text, maxLength = BIO_PREVIEW_LENGTH) {
  if (!text || text.length <= maxLength) return text;

  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  const preview = lastSpace > maxLength * 0.75 ? sliced.slice(0, lastSpace) : sliced;
  return `${preview.trim()}...`;
}

function getAiDisclosure(aiTraits) {
  if (!aiTraits) return null;

  const needsReview = aiTraits?.needs_human_review === true;

  return {
    needsReview,
  };
}

function isRealMatchScore(match) {
  if (match?.breakdown?.enoughQuizInfo === false) return false;
  return Number.isFinite(Number(match?.scorePct));
}

function getMatchReasons(match, dog) {
  const supportedReasons = Array.isArray(match?.breakdown?.matchReasons)
    ? match.breakdown.matchReasons.filter(Boolean)
    : [];

  if (supportedReasons.length) return supportedReasons.slice(0, 6);
  return getSupportedMatchReasons(dog, {}, 6);
}

export default function DogDetail() {
  const { id } = useParams();
  const routerLocation = useLocation();
  const [searchParams] = useSearchParams();
  const sessionFromUrl = searchParams.get("session") || "";
  const fromParam = searchParams.get("from") || "";
  const sessionId = sessionFromUrl || getActiveQuizSessionId();

  const [dog, setDog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [imgSrc, setImgSrc] = useState(FALLBACK_IMG);
  const [saved, setSaved] = useState(() => isSavedId(id));
  const [quizMatch, setQuizMatch] = useState(() => {
    const stateMatch = routerLocation.state?.match;
    return isRealMatchScore(stateMatch) ? stateMatch : null;
  });
  const [aiInfoOpen, setAiInfoOpen] = useState(false);
  const [matchInfoOpen, setMatchInfoOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [shelterLogoFailed, setShelterLogoFailed] = useState(false);

  useEffect(() => {
    if (sessionId) setActiveQuizSessionId(sessionId);
  }, [sessionId]);

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
    setShelterLogoFailed(false);
  }, [dog?.id, dog?.shelters?.logo_url, dog?.shelter_logo_url, dog?.rescue_logo_url]);

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
            id,
            name,
            website,
            apply_url,
            logo_url,
            city,
            state,
            rescuegroups_org_id
          )
        `)
        .eq("id", id)
        .single();

      if (!isMounted) return;

      if (error) {
        setLoadError(error.message || "Failed to load dog.");
        setDog(null);
      } else {
        let dogData = data;

        if (!displayShelterLogo(dogData)) {
          let fallbackShelter = null;

          if (dogData?.rescuegroups_org_id) {
            const { data: shelterByOrg } = await supabase
              .from("shelters")
              .select("id, name, website, apply_url, logo_url, city, state, rescuegroups_org_id")
              .eq("rescuegroups_org_id", String(dogData.rescuegroups_org_id))
              .limit(1)
              .maybeSingle();

            fallbackShelter = shelterByOrg || null;
          }

          if (!fallbackShelter && dogData?.shelter_name) {
            const { data: shelterByName } = await supabase
              .from("shelters")
              .select("id, name, website, apply_url, logo_url, city, state, rescuegroups_org_id")
              .eq("name", dogData.shelter_name)
              .limit(1)
              .maybeSingle();

            fallbackShelter = shelterByName || null;
          }

          if (fallbackShelter?.logo_url) {
            dogData = {
              ...dogData,
              shelters: fallbackShelter,
            };
          }
        }

        if (isMounted) setDog(dogData);
      }

      setLoading(false);
    }

    fetchDog();

    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    let isMounted = true;

    async function loadMatch() {
      if (!sessionId || !dog) {
        setQuizMatch(null);
        return;
      }

      const stateMatch = routerLocation.state?.match;
      if (isRealMatchScore(stateMatch)) {
        setQuizMatch(stateMatch);
      }

      try {
        const { answersById } = await loadQuizResponses(sessionId);
        const [row] = computeRankedMatches([dog], answersById || {});
        const nextMatch = row
          ? { scorePct: row.scorePct, breakdown: row.breakdown }
          : null;

        if (!isMounted) return;
        setQuizMatch(isRealMatchScore(nextMatch) ? nextMatch : null);
      } catch {
        if (isMounted && !isRealMatchScore(stateMatch)) {
          setQuizMatch(null);
        }
      }
    }

    loadMatch();

    return () => {
      isMounted = false;
    };
  }, [dog, routerLocation.state, sessionId]);

  const resolvedImage = useMemo(() => pickDogImage(dog), [dog]);

  const galleryUrls = useMemo(() => {
    const extra = Array.isArray(dog?.photo_urls)
      ? dog.photo_urls.map((url) => normalizeImageUrl(url, { allowRelative: false }))
      : [];

    return Array.from(new Set([resolvedImage, ...extra].filter(Boolean)));
  }, [dog, resolvedImage]);

  const hasMultiplePhotos = galleryUrls.length > 1;
  const galleryIndex = Math.max(0, galleryUrls.indexOf(imgSrc));

  function goToPhoto(nextIndex) {
    if (!galleryUrls.length) return;
    const wrapped = (nextIndex + galleryUrls.length) % galleryUrls.length;
    setImgSrc(galleryUrls[wrapped]);
  }

  useEffect(() => {
    setImgSrc(resolvedImage || FALLBACK_IMG);
  }, [resolvedImage]);

  const seoDogName = dog?.name?.trim();
  const dogIsPublic = dog ? isPubliclyVisibleDog(dog) : false;
  const seoBreed = dog ? displayBreed(dog) : "Dog";
  const seoShelter = dog ? displayShelterName(dog) : "a rescue or shelter";
  const seoTitle = seoDogName
    ? `${seoDogName} - Adoptable ${seoBreed} | Hooman Finder`
    : !loading && (loadError || !dog)
      ? "Dog Not Found | Hooman Finder"
      : "Adoptable Dog | Hooman Finder";
  const seoDescription = seoDogName
    ? `Meet ${seoDogName}, an adoptable ${seoBreed} listed through ${seoShelter}. View photos, rescue details, and lifestyle fit information on Hooman Finder.`
    : "View adoptable dog details, photos, and adoption fit information on Hooman Finder.";
  const seoImage = resolvedImage?.startsWith("https://") ? resolvedImage : "/home-hero-dogs.jpg";
  const seoImageAlt = seoDogName
    ? `${seoDogName}, adoptable ${seoBreed}`
    : "Adoptable dog on Hooman Finder";
  const seoNoindex = Boolean(sessionFromUrl) || (!loading && (loadError || !dog || !dogIsPublic));
  const seo = (
    <SEO
      title={seoTitle}
      description={seoDescription}
      canonicalPath={id ? `/dog/${id}` : "/dogs"}
      ogImage={seoImage}
      ogImageAlt={seoImageAlt}
      noindex={seoNoindex}
    />
  );

  useEffect(() => {
    if (!photoOpen) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") setPhotoOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [photoOpen]);

  useEffect(() => {
    if (!matchInfoOpen) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") setMatchInfoOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [matchInfoOpen]);

  function onToggleSaved() {
    const nextSaved = toggleSavedId(id);
    setSaved(nextSaved);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        {seo}
        <div className="mx-auto max-w-6xl px-4 py-8 text-slate-600">
          Loading dog…
        </div>
      </div>
    );
  }

  if (loadError || !dog || !dogIsPublic) {
    return (
      <div className="min-h-screen bg-slate-50">
        {seo}
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Link to="/dogs" className="text-sm font-semibold text-slate-700">
            ← Back to dogs
          </Link>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
            <h1 className="text-xl font-extrabold text-slate-900">
              This dog may no longer be available
            </h1>
            <p className="mt-2 text-slate-600">
              Browse current adoptable dogs instead.
            </p>
            <Link
              to="/dogs"
              className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Browse current adoptable dogs
            </Link>
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
  const applyLabel = displayApplyLabel(dog);
  const description = cleanText(dog.description) || "No description provided yet.";
  const coreFactsLine = [breed, age, dog.size, dog.energy_level].filter(Boolean).join(" • ");
  const bioIsLong = description.length > BIO_PREVIEW_LENGTH;
  const bioPreview = getPreviewText(description);
  const quickFacts = [
    { label: "Breed", value: breed },
    { label: "Age", value: age },
    dog.size ? { label: "Size", value: dog.size } : null,
    dog.energy_level ? { label: "Energy", value: dog.energy_level } : null,
    location !== "Location unknown" ? { label: "Location", value: location } : null,
  ].filter(Boolean);

  const aiTraits = parseAiTraits(dog.ai_traits);
  const aiDisclosure = getAiDisclosure(aiTraits);
  const hasBioTraitData =
    hasUsefulBioValue(dog.bio_good_with_kids) ||
    hasUsefulBioValue(dog.bio_good_with_dogs) ||
    hasUsefulBioValue(dog.bio_good_with_cats) ||
    hasUsefulBioValue(dog.bio_first_time_friendly) ||
    hasUsefulBioValue(dog.bio_potty_trained) ||
    normalizeEnergyValue(dog.bio_energy_level) !== "unknown" ||
    normalizeSheddingValue(dog.bio_shedding_level) !== "unknown" ||
    normalizeEnergyValue(dog.bio_exercise_needs) !== "unknown" ||
    normalizeEnergyValue(dog.bio_training_needs) !== "unknown" ||
    Boolean(dog.bio_max_alone_hours) ||
    Boolean(dog.bio_size);
  const matchScorePct = Number(quizMatch?.scorePct);
  const hasQuizMatch = isRealMatchScore(quizMatch);
  const matchReasons = getMatchReasons(quizMatch, dog);
  let backLink = "/dogs";
  let backLabel = "← Back to dogs";

  if (fromParam === "results" && sessionId) {
    backLink = `/results?session=${encodeURIComponent(sessionId)}`;
    backLabel = "← Back to matches";
  } else if (fromParam === "saved") {
    backLink = "/saved";
    backLabel = "← Back to saved dogs";
  } else if (fromParam === "dogs") {
    backLink = "/dogs";
    backLabel = "← Back to dogs";
  } else if (sessionId) {
    backLink = `/results?session=${encodeURIComponent(sessionId)}`;
    backLabel = "← Back to matches";
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {seo}
      {matchInfoOpen && hasQuizMatch
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 px-3 pb-3 pt-12 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="match-modal-title"
              onMouseDown={() => setMatchInfoOpen(false)}
            >
              <div
                className="max-h-[86vh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-[#f5f1e9] p-5 shadow-2xl ring-1 ring-white/30 sm:p-6"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                      {Math.round(matchScorePct)}% match
                    </div>
                    <h2
                      id="match-modal-title"
                      className="mt-2 text-3xl font-extrabold leading-none text-slate-950"
                    >
                      Why you matched
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMatchInfoOpen(false)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl font-bold leading-none text-slate-500 shadow-sm ring-1 ring-slate-950/5 hover:bg-slate-100 hover:text-slate-950"
                    aria-label="Close why you matched"
                  >
                    ×
                  </button>
                </div>

                <p className="mt-4 text-sm font-semibold leading-6 text-slate-700">
                  This score is based on your quiz answers and the dog details currently available from the shelter or rescue.
                </p>

                {matchReasons.length ? (
                  <div className="mt-5">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                      Compatibility highlights
                    </div>
                    <ul className="mt-3 space-y-2">
                      {matchReasons.map((reason) => (
                        <li
                          key={reason}
                          className="flex gap-2.5 rounded-2xl border border-slate-950/10 bg-white/80 px-3.5 py-3 text-sm font-bold leading-5 text-slate-800 shadow-sm"
                        >
                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dfe7d7] text-[11px] text-slate-950">
                            ✓
                          </span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p className="mt-5 rounded-2xl bg-white/62 px-4 py-3 text-xs font-semibold leading-5 text-slate-600 ring-1 ring-slate-950/5">
                  Some details are estimated from the dog’s rescue bio, so always confirm with the shelter or rescue.
                </p>

                <button
                  type="button"
                  onClick={() => setMatchInfoOpen(false)}
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {photoOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-3 py-5 backdrop-blur-sm sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-label={`${name} expanded photo`}
          onClick={() => setPhotoOpen(false)}
        >
          <div
            className="relative flex max-h-full w-full max-w-5xl items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPhotoOpen(false)}
              className="absolute right-1 top-1 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl font-bold leading-none text-slate-900 shadow-lg transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:-translate-y-5 sm:translate-x-5"
              aria-label="Close enlarged photo"
            >
              ×
            </button>

            <img
              src={imgSrc}
              alt={`${name}, enlarged adoptable ${breed} photo`}
              className="max-h-[88vh] max-w-full rounded-2xl bg-white object-contain shadow-2xl"
              onError={() => setImgSrc(FALLBACK_IMG)}
            />
          </div>
        </div>
      ) : null}

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
                  What we noticed from the bio
                </div>
                <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-slate-950">
                  Things to confirm with the shelter or rescue
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setAiInfoOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-950"
                aria-label="Close bio notes information"
              >
                ×
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-700">
              Some details are estimated from the dog’s rescue bio, so always confirm with the shelter or rescue.
            </p>

            <p className="mt-3 text-sm leading-6 text-slate-700">
              These notes can help you compare dogs, but they are not behavior guarantees. Ask about kids, cats, dogs, training, routine, and home fit before applying.
            </p>

            {aiDisclosure?.needsReview ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                This listing has limited bio details, so treat these notes with extra caution.
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

      <div className="mx-auto max-w-5xl px-4 py-5 sm:py-6">
        <div className="flex items-center justify-between">
          <Link to={backLink} className="text-sm font-semibold text-slate-700 hover:text-slate-900">
            {backLabel}
          </Link>

          <Link to="/saved" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
            View saved dogs
          </Link>
        </div>

        <section className="mt-4 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="relative aspect-[5/4] w-full bg-slate-100 lg:aspect-auto lg:min-h-[360px]">
              <button
                type="button"
                onClick={() => setPhotoOpen(true)}
                className="group absolute inset-0 block h-full w-full cursor-zoom-in bg-slate-100 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20"
                aria-label={`Open larger photo of ${name}`}
              >
                <img
                  src={imgSrc}
                  alt={`${name}, adoptable ${breed}`}
                  className="h-full w-full bg-slate-100 object-cover transition duration-200 group-hover:brightness-95"
                  onError={() => setImgSrc(FALLBACK_IMG)}
                />
              </button>

              {hasMultiplePhotos ? (
                <>
                  <button
                    type="button"
                    onClick={() => goToPhoto(galleryIndex - 1)}
                    aria-label={`Show previous photo of ${name}`}
                    className="absolute left-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/40 text-lg leading-none text-white backdrop-blur-sm transition hover:bg-slate-950/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-10 sm:w-10"
                  >
                    ‹
                  </button>

                  <button
                    type="button"
                    onClick={() => goToPhoto(galleryIndex + 1)}
                    aria-label={`Show next photo of ${name}`}
                    className="absolute right-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950/40 text-lg leading-none text-white backdrop-blur-sm transition hover:bg-slate-950/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-10 sm:w-10"
                  >
                    ›
                  </button>

                  <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-950/45 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                    {galleryIndex + 1} / {galleryUrls.length}
                  </div>
                </>
              ) : null}

              <button
                type="button"
                onClick={onToggleSaved}
                className={[
                  "absolute bottom-4 right-4 z-10 inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition",
                  saved
                    ? "border-rose-600 bg-rose-600 text-white"
                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                ].join(" ")}
              >
                {saved ? "♥ Saved" : "♡ Save"}
              </button>
            </div>

            <div className="flex flex-col justify-center border-t border-slate-200 bg-gradient-to-b from-white to-stone-50/70 px-5 py-5 sm:px-7 sm:py-7 lg:border-l lg:border-t-0">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Adoptable dog profile
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-extrabold leading-tight text-slate-950 sm:text-4xl">
                  {name}
                </h1>

                {hasQuizMatch ? (
                  <button
                    type="button"
                    onClick={() => setMatchInfoOpen(true)}
                    className="inline-flex rounded-full border border-[#0f2742]/10 bg-[#dfe7d7] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-950 shadow-sm hover:bg-[#eef3e8]"
                    aria-label={`Open why you matched. ${Math.round(matchScorePct)} percent match`}
                  >
                    {Math.round(matchScorePct)}% match
                  </button>
                ) : null}
              </div>
              {coreFactsLine ? (
                <p className="mt-2 text-sm leading-5 text-slate-600 sm:text-base">
                  {coreFactsLine}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {quickFacts.map((fact) => (
                  <QuickFact key={`${fact.label}-${fact.value}`} label={fact.label} value={fact.value} />
                ))}
              </div>

              <div className="mt-5 rounded-3xl border border-slate-200 bg-white/85 p-4 shadow-sm">
                <div className="text-sm font-extrabold text-slate-900">
                  Ready to take the next step?
                </div>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Hooman Finder helps you compare adoption fit information for {name}. The listing shelter or rescue manages applications, fees,
                  availability, and final adoption decisions.
                </p>

                <a
                  href={applyLink || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={`mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition ${
                    applyLink
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "cursor-not-allowed bg-slate-200 text-slate-500"
                  }`}
                  onClick={(e) => {
                    if (!applyLink) e.preventDefault();
                  }}
                  aria-disabled={!applyLink}
                >
                  {applyLabel}
                </a>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Opens the shelter or rescue’s official listing, website, or application page.
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">

          {hasQuizMatch ? (
            <section className="order-3 rounded-3xl border border-[#dfe7d7] bg-[#f7faf3] p-5 shadow-sm sm:p-6 lg:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Why you matched
                  </div>
                  <h2 className="mt-2 text-2xl font-extrabold leading-tight text-slate-950">
                    {name} may fit parts of your home and routine.
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                    These highlights come from your quiz answers and the dog details currently available from the shelter or rescue.
                  </p>
                </div>

              </div>

              {matchReasons.length ? (
                <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {matchReasons.slice(0, 4).map((reason) => (
                    <li
                      key={reason}
                      className="flex gap-2.5 rounded-2xl border border-slate-950/10 bg-white/80 px-3.5 py-3 text-sm font-semibold leading-5 text-slate-700"
                    >
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dfe7d7] text-[11px] text-slate-950">
                        ✓
                      </span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <p className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-xs font-semibold leading-5 text-slate-600 ring-1 ring-slate-950/5">
                Some details are estimated from the dog’s rescue bio, so always confirm with the shelter or rescue.
              </p>
            </section>
          ) : null}

          <section className="order-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold text-slate-900">What we noticed</div>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Listed details first, with gentle notes from the shelter or rescue bio when available.
                </p>
              </div>

              {hasBioTraitData ? (
                <button
                  type="button"
                  onClick={() => setAiInfoOpen(true)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-black text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  aria-label="Learn about bio notes"
                >
                  i
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3">
              <TraitCard label="Size" trait={getSizeTrait({ structuredValue: dog.size, bioValue: dog.bio_size })} />
              <TraitCard
                label="Energy"
                trait={getEnergyTrait({
                  structuredValue: dog.energy_level || dog.activity_level,
                  bioValue: dog.bio_energy_level,
                })}
              />
              <TraitCard
                label="Potty trained"
                trait={getTraitDisplay({
                  structuredValue: dog.potty_trained,
                  bioValue: dog.bio_potty_trained,
                })}
              />
              <TraitCard
                label="Good with dogs"
                trait={getTraitDisplay({
                  structuredValue: dog.good_with_dogs,
                  bioValue: dog.bio_good_with_dogs,
                })}
              />
              <TraitCard
                label="Good with cats"
                trait={getTraitDisplay({
                  structuredValue: dog.good_with_cats,
                  bioValue: dog.bio_good_with_cats,
                })}
              />
              <TraitCard
                label="Good with kids"
                trait={getTraitDisplay({
                  structuredValue: dog.good_with_kids,
                  bioValue: dog.bio_good_with_kids,
                })}
              />
              <TraitCard
                label="Shedding"
                trait={getSheddingTrait({
                  structuredValue: dog.shedding_level,
                  bioValue: dog.bio_shedding_level,
                })}
              />
              <TraitCard
                label="Alone time"
                trait={getEstimatedTextTrait({
                  value: dog.bio_max_alone_hours_label,
                  displayValue:
                    dog.bio_max_alone_hours_label && dog.bio_max_alone_hours_label !== "unknown"
                      ? `Likely ${dog.bio_max_alone_hours_label} hrs`
                      : "",
                })}
              />
              <TraitCard
                label="Exercise needs"
                trait={getEnergyTrait({
                  structuredValue: dog.exercise_needs,
                  bioValue: dog.bio_exercise_needs,
                })}
              />
              <TraitCard
                label="Training needs"
                trait={getEnergyTrait({
                  structuredValue: obedienceTrainingNeed(dog.obedience_training),
                  bioValue: dog.bio_training_needs,
                })}
              />
            </div>

            {hasBioTraitData ? (
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Some details are estimated from the dog’s rescue bio, so always confirm with the shelter or rescue.
              </p>
            ) : null}
          </section>

          <section className="order-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
            <div className="text-lg font-extrabold text-slate-900">About {name}</div>
            <p
              id="dog-bio-text"
              className="mt-3 text-sm leading-6 text-slate-700 sm:hidden"
            >
              {bioExpanded || !bioIsLong ? description : bioPreview}
            </p>
            <p className="mt-3 hidden text-sm leading-6 text-slate-700 sm:block">
              {description}
            </p>

            {bioIsLong ? (
              <button
                type="button"
                onClick={() => setBioExpanded((isExpanded) => !isExpanded)}
                className="mt-3 inline-flex min-h-10 items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:hidden"
                aria-expanded={bioExpanded}
                aria-controls="dog-bio-text"
              >
                {bioExpanded ? "Show less" : "Read more"}
              </button>
            ) : null}
          </section>

          <section className="order-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="text-sm font-extrabold text-slate-900">Listed by</div>
            <div className="mt-3 flex items-center gap-3">
              {shelterLogo && !shelterLogoFailed ? (
                <div className="flex h-14 w-28 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 sm:h-16 sm:w-36">
                  <img
                    src={shelterLogo}
                    alt={`${shelterName} logo`}
                    className="h-full w-full object-contain"
                    onError={() => setShelterLogoFailed(true)}
                  />
                </div>
              ) : (
                <div className="flex h-14 w-28 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-lg font-extrabold text-slate-500 sm:h-16 sm:w-36">
                  {shelterName.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0">
                <div className="break-words font-semibold text-slate-900">{shelterName}</div>
                <div className="break-words text-sm text-slate-600">{location}</div>
              </div>
            </div>
          </section>

          <section className="order-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="text-sm font-extrabold text-slate-900">Before you inquire</div>
            <ul className="mt-3 space-y-2 text-sm leading-5 text-slate-700">
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span>Read the dog’s full bio and match notes.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span>Check known fit details like kids, cats, dogs, potty training, and energy.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span>Make sure the location and travel distance work for you.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span>Contact the shelter or rescue directly for current availability and adoption requirements.</span>
              </li>
            </ul>
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
              Listing info can change. Dog availability, adoption fees, and requirements may
              change quickly. Always confirm details directly with the shelter or rescue before applying
              or visiting.
            </p>
          </section>

          <section className="order-8 rounded-3xl border border-sky-200 bg-sky-50/70 p-5 shadow-sm sm:p-6 lg:col-span-2">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">
              Bringing your dog home
            </div>
            <h2 className="mt-2 text-xl font-extrabold text-slate-900">
              Expect an adjustment period
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Even potty-trained dogs may have accidents while settling into a new home. New
              routines, smells, people, and stress can all affect behavior at first. A dog may
              be quiet, nervous, extra clingy, bark or whine, test rules, or need time to show
              their real personality.
            </p>

            <div className="mt-4 rounded-2xl border border-sky-200 bg-white/80 p-4">
              <div className="text-sm font-extrabold text-slate-900">
                The 3-3-3 rule is a rough guide
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-700 sm:grid-cols-3">
                <div>
                  <span className="font-bold text-sky-800">First 3 days:</span> decompress
                </div>
                <div>
                  <span className="font-bold text-sky-800">First 3 weeks:</span> learn routines
                </div>
                <div>
                  <span className="font-bold text-sky-800">First 3 months:</span> feel more settled
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                Every dog is different, so this is a guide, not a guarantee. Patience and
                consistency help.
              </p>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-extrabold text-slate-900">
                Quick tips for the first few weeks
              </h3>
              <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm leading-5 text-slate-700 sm:grid-cols-2">
                <li>• Keep the first few days calm and predictable.</li>
                <li>• Set up a quiet safe space.</li>
                <li>• Take potty breaks more often than you think you need to.</li>
                <li>• Supervise indoors at first.</li>
                <li>• Reward outdoor potty trips and calm behavior.</li>
                <li>• Introduce new people, pets, and places slowly.</li>
              </ul>
              <p className="mt-3 text-sm leading-5 text-slate-700">
                Ask the shelter, rescue, vet, or trainer for help if concerns feel severe or do not
                improve.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function QuickFact({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-extrabold leading-5 text-slate-900">{value}</div>
    </div>
  );
}

function TraitCard({ label, trait }) {
  const title = trait.title || "Noted from the shelter or rescue bio. Confirm with the source.";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
        <span>{trait.value}</span>
        {trait.estimated ? (
          <span className="text-xs" title={title} aria-label={title}>
            *
          </span>
        ) : null}
      </div>

      {trait.estimated ? (
        <div className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
          {trait.note || "From bio"}
        </div>
      ) : null}
    </div>
  );
}
