// src/pages/DogDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import SEO from "../components/SEO";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import Breadcrumbs, { StructuredData } from "../components/Breadcrumbs";
import { breadcrumbJsonLd } from "../lib/structuredData";
import { computeRankedMatches } from "../lib/matchingLogic";
import { isPubliclyVisibleDog } from "../lib/dogVisibility";
import RescueGroupsTracker from "../components/RescueGroupsTracker";
import { buildDogProfileMetadata, normalizeDogLocation } from "../lib/dogProfileSeo";
import { trackAdoptionLinkClick } from "../lib/googleAnalytics";
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
import { hasUsefulBioValue, getTraitDisplay } from "../lib/traitDisplay";
import { getChildTraitDisplay } from "../lib/childCompatibility";
import { resolveAloneTimeEvidence } from "../lib/aloneTimeEvidence";
import {
  formatFitScore,
  getEvidenceLabels,
  getFitScoreScope,
  getPositiveEvidenceItems,
  getTradeoffEvidenceItems,
  hasRealFitScore,
} from "../lib/matchPresentation";

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
  } catch {
    // Saving is best-effort when browser storage is unavailable.
  }
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
  return normalizeDogLocation(getDogSourceLocation(dog));
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

function normalizeEnergyValue(value) {
  const raw = String(value || "unknown").trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (["low", "medium_low", "medium", "medium_high", "high"].includes(raw)) return raw;
  if (raw === "not_required") return "low";
  if (raw.includes("moderate") || raw.includes("medium")) return "medium";
  if (raw.includes("high")) return "high";
  if (raw.includes("low")) return "low";
  return "unknown";
}

function getTrainingTraitDisplay(trait) {
  const value = String(trait?.value || "unknown").toLowerCase();
  const labels = {
    true: "Yes, described in the listing",
    likely: "Likely",
    maybe: "Possible; needs confirmation",
    false: "No, described in the listing",
    unknown: "Unknown",
  };
  if (!Object.hasOwn(labels, value) || value === "unknown") {
    return { value: "Unknown", source: "unknown", estimated: false };
  }
  return {
    value: labels[value],
    estimated: true,
    ...estimatedTraitMetadata(trait?.evidence_basis),
    note: trait?.evidence || "AI interpretation of listing-specific training information; confirm with the rescue.",
  };
}

function getStructuredObedienceDisplay(value) {
  const raw = String(value || "").trim();
  return raw
    ? { value: raw, source: "listed", estimated: false, title: "Obedience information supplied in the shelter or rescue listing." }
    : { value: "Unknown", source: "unknown", estimated: false };
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

function estimatedTraitMetadata(evidenceBasis) {
  const bioExplicit = evidenceBasis === "bio_explicit";
  const breedCoatInference = evidenceBasis === "breed_coat_inference";
  return {
    source: bioExplicit ? "bio" : breedCoatInference ? "breed_coat_inference" : "profile_inference",
    note: bioExplicit
      ? "Interpreted from listing bio"
      : breedCoatInference
        ? "Estimated from breed and coat evidence"
        : "AI profile estimate",
    title: bioExplicit
      ? "AI interpretation of dog-specific wording in the shelter or rescue bio. Confirm with the source."
      : breedCoatInference
        ? "Estimated from the source-listed breed and any dog-specific coat evidence. Coat inheritance varies, especially in mixes, and this is not a hypoallergenic guarantee."
      : "AI estimate based on broader profile context. This is not a known behavioral fact. Confirm with the shelter or rescue.",
  };
}

function getEnergyTrait({ structuredValue, bioValue, evidenceBasis }) {
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
      estimated: true,
      ...estimatedTraitMetadata(evidenceBasis),
    };
  }

  return {
    value: "Unknown",
    source: "unknown",
    estimated: false,
  };
}

function getSheddingTrait({ structuredValue, bioValue, evidenceBasis }) {
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
      estimated: true,
      ...estimatedTraitMetadata(evidenceBasis),
    };
  }

  return {
    value: "Unknown",
    source: "unknown",
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
      title: "Estimated adult size from breed and age for puppies. This is not guaranteed. Confirm with the shelter or rescue.",
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
  return hasRealFitScore(match?.scorePct, match?.breakdown);
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
  const [imageFailed, setImageFailed] = useState(false);
  const [saved, setSaved] = useState(() => isSavedId(id));
  const [saveAnnouncement, setSaveAnnouncement] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
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
          ),
          ingestion_sources (
            id,
            source_type,
            external_org_id,
            enabled,
            publication_eligible,
            last_successful_sync_at
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
  }, [id, reloadKey]);

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
    setImageFailed(false);
  }, [resolvedImage]);

  const dogIsPublic = dog ? isPubliclyVisibleDog(dog) : false;
  const sharedSeo = dog
    ? buildDogProfileMetadata(dog, id, { publiclyVisible: dogIsPublic })
    : null;
  const seoTitle = sharedSeo
    ? sharedSeo.title
    : !loading && (loadError || !dog)
      ? "Dog Not Found | Hooman Finder"
      : "Adoptable Dog | Hooman Finder";
  const seoDescription = sharedSeo?.description ||
    "View adoptable dog details, photos, and adoption fit information on Hooman Finder.";
  const seoImage = sharedSeo?.image || "/home-hero-dogs.jpg";
  const seoImageAlt = sharedSeo?.imageAlt || "Adoptable dog on Hooman Finder";
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
    setSaveAnnouncement(
      nextSaved
        ? `${dog?.name || "Dog"} saved to your dogs.`
        : `${dog?.name || "Dog"} removed from your saved dogs.`
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#183D35]">
        {seo}
        <SiteHeader back={{ to: "/dogs", label: "Back to dogs" }} />
        <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8" aria-busy="true">
          <p role="status" className="sr-only">Loading dog profile.</p>
          <div className="overflow-hidden rounded-[1.75rem] bg-white shadow-[0_18px_50px_rgba(24,61,53,0.10)] ring-1 ring-[#183D35]/8 sm:rounded-[2.25rem]">
            <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
              <div className="hf-skeleton aspect-[4/3] lg:min-h-[34rem] lg:aspect-auto" />
              <div className="space-y-4 bg-[#183D35] p-6 sm:p-8 lg:p-10">
                <div className="hf-skeleton h-3 w-32 rounded-full opacity-40" />
                <div className="hf-skeleton h-14 w-2/3 rounded-2xl opacity-50" />
                <div className="hf-skeleton h-5 w-3/4 rounded-full opacity-40" />
                <div className="flex gap-2 pt-2">
                  <div className="hf-skeleton h-14 w-24 rounded-2xl opacity-40" />
                  <div className="hf-skeleton h-14 w-28 rounded-2xl opacity-40" />
                </div>
                <div className="hf-skeleton mt-8 h-44 rounded-[1.5rem] opacity-45" />
              </div>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (loadError || !dog) {
    return (
      <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#183D35]">
        {seo}
        <SiteHeader back={{ to: "/dogs", label: "Back to dogs" }} />
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
          <div className="rounded-[1.75rem] bg-white p-6 shadow-[0_16px_42px_rgba(24,61,53,0.08)] ring-1 ring-[#183D35]/8 sm:p-9" role="alert">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef3e8] text-2xl" aria-hidden="true">♡</div>
            <h1 className="mt-5 font-['Fraunces',serif] text-3xl font-semibold leading-tight text-[#183D35]">
              We couldn’t load this profile.
            </h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-[#6F6A66]">
              The listing may still be available. Check your connection and try again, or browse the current public catalog.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setReloadKey((value) => value + 1)}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#183D35] px-6 text-sm font-black text-[#F3C982] hover:bg-[#12332C]"
              >
                Try again
              </button>
              <Link to="/dogs" className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#183D35]/15 px-6 text-sm font-black text-[#183D35] hover:bg-white">
                Browse dogs
              </Link>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (!dogIsPublic) {
    return (
      <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#183D35]">
        {seo}
        <SiteHeader back={{ to: "/dogs", label: "Back to dogs" }} />
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
          <div className="rounded-[1.75rem] bg-white p-6 shadow-[0_16px_42px_rgba(24,61,53,0.08)] ring-1 ring-[#183D35]/8 sm:p-9">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9B6B16]">Listing update</p>
            <h1 className="mt-3 font-['Fraunces',serif] text-3xl font-semibold leading-tight text-[#183D35]">
              This listing isn’t currently available to show.
            </h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-[#6F6A66]">
              It is no longer in Hooman Finder’s public catalog. That does not confirm whether the dog was adopted; the shelter or rescue is the source for current status.
            </p>
            <Link
              to="/dogs"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-[#183D35] px-6 text-sm font-black text-[#F3C982] hover:bg-[#12332C]"
            >
              Browse available dogs
            </Link>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const name = dog.name || "Unnamed dog";
  const age = displayAge(dog);
  const breed = displayBreed(dog);
  const shelterName = displayShelterName(dog);
  const shelterId = dog?.shelters?.id || dog?.shelter_id || "";
  const shelterLogo = displayShelterLogo(dog);
  const location = displayLocation(dog);
  const applyLink = displayApplyLink(dog);
  const applyLabel = displayApplyLabel(dog);
  const description = cleanText(dog.description) || "A full description isn't available here yet.";
  const coreFactsLine = [breed, age, dog.gender, dog.size, dog.energy_level].filter(Boolean).join(" • ");
  const bioIsLong = description.length > BIO_PREVIEW_LENGTH;
  const bioPreview = getPreviewText(description);
  const quickFacts = [
    { label: "Breed", value: breed },
    { label: "Age", value: age },
    dog.gender ? { label: "Gender", value: dog.gender } : null,
    dog.size ? { label: "Size", value: dog.size } : null,
    dog.energy_level ? { label: "Energy", value: dog.energy_level } : null,
  ].filter(Boolean);

  const aiTraits = parseAiTraits(dog.ai_traits);
  const aiDisclosure = getAiDisclosure(aiTraits);
  const aloneTimeEvidence = resolveAloneTimeEvidence(dog);
  const aloneTimeProfileTraits = [];
  if (aloneTimeEvidence.structuredHours !== null) {
    aloneTimeProfileTraits.push({
      label: "Alone time · shelter-listed",
      trait: {
        value: `${aloneTimeEvidence.structuredHours} hrs listed`,
        source: "listed",
        estimated: false,
        note: aloneTimeEvidence.bioDurationConflict
          ? "The biography gives conflicting durations; confirm current capacity with the rescue."
          : aloneTimeEvidence.durationConflict
          ? "The biography gives a different duration; confirm current capacity with the rescue."
          : aloneTimeEvidence.behaviorConflict
            ? "The biography also describes separation concerns; confirm current capacity with the rescue."
            : "",
        title: "Structured alone-time duration supplied by the shelter or rescue listing.",
      },
    });
  }
  if (aloneTimeEvidence.bioHours !== null && (aloneTimeEvidence.structuredHours === null || aloneTimeEvidence.conflict)) {
    aloneTimeProfileTraits.push({
      label: "Alone time · listing bio",
      trait: {
        value: `About ${aloneTimeEvidence.bioHours} hrs stated`,
        estimated: true,
        ...{
          source: "bio",
          note: aloneTimeEvidence.behaviorConflict
            ? "The biography also describes separation concerns; confirm current capacity with the rescue."
            : aloneTimeEvidence.durationConflict ? "This differs from the shelter-listed duration; confirm with the rescue." : "Explicit duration in the listing bio; confirm the dog's current capacity.",
          title: "A duration stated in the biography is not a guarantee of current capacity.",
        },
      },
    });
  }
  if ((!aloneTimeEvidence.structuredHours && aloneTimeEvidence.bioHours === null) || aloneTimeEvidence.bioDurationConflict) {
    aloneTimeProfileTraits.push({
      label: aloneTimeEvidence.bioDurationConflict ? "Alone time · confirmation needed" : "Alone time",
      trait: {
        value: aloneTimeEvidence.bioDurationConflict ? "Conflicting durations" : "Unknown duration",
        source: "unknown",
        estimated: false,
        note: aloneTimeEvidence.bioDurationConflict
          ? "The biography gives more than one duration; ask the rescue which information is current."
          : aloneTimeEvidence.legacyDurationUnverified ? "A prior stored estimate could not be verified against an explicit duration in the listing bio." : "The listing does not establish a duration.",
      },
    });
  }
  const aloneObservationLabels = {
    general_independence: "General independence mentioned",
    alone_comfort_claim: "Bio says the dog is comfortable alone",
    observed_comfort: "Observed comfort when left alone",
    separation_concern: "Separation-related concerns mentioned",
    significant_distress: "Significant separation distress mentioned",
  };
  const aloneObservation = aloneTimeEvidence.observation;
  if (aloneObservation !== "unknown") {
    const observationTrait = aloneTimeEvidence.observationEvidence || {};
    const observationBasis = observationTrait.evidence_basis || "bio_explicit";
    const metadata = estimatedTraitMetadata(observationBasis);
    aloneTimeProfileTraits.push({
      label: "Alone-time behavior",
      trait: {
        value: aloneObservationLabels[aloneObservation] || "Behavior needs confirmation",
        estimated: true,
        ...metadata,
        note: observationTrait.evidence || "Qualitative behavior does not establish a number of hours.",
        title: "Qualitative alone-time information does not establish the hours a dog can be left alone.",
      },
    });
  }
  const profileTraits = [
    { label: "Size", trait: getSizeTrait({ structuredValue: dog.size, bioValue: dog.bio_size }) },
    {
      label: "Energy",
      trait: getEnergyTrait({
        structuredValue: dog.energy_level || dog.activity_level,
        bioValue: dog.bio_energy_level,
        evidenceBasis: aiTraits?.energy_level?.evidence_basis,
      }),
    },
    {
      label: "Potty trained",
      trait: getTraitDisplay({
        structuredValue: dog.potty_trained,
        bioValue: dog.bio_potty_trained,
        evidenceBasis: aiTraits?.potty_trained?.evidence_basis,
      }),
    },
    {
      label: "Good with dogs",
      trait: getTraitDisplay({
        structuredValue: dog.good_with_dogs,
        bioValue: dog.bio_good_with_dogs,
        evidenceBasis: aiTraits?.good_with_dogs?.evidence_basis,
      }),
    },
    {
      label: "Good with cats",
      trait: getTraitDisplay({
        structuredValue: dog.good_with_cats,
        bioValue: dog.bio_good_with_cats,
        evidenceBasis: aiTraits?.good_with_cats?.evidence_basis,
      }),
    },
    { label: "Good with kids", trait: getChildTraitDisplay(dog) },
    {
      label: "Shedding",
      trait: getSheddingTrait({
        structuredValue: dog.shedding_level,
        bioValue: dog.bio_shedding_level,
        evidenceBasis: aiTraits?.shedding_level?.evidence_basis,
      }),
    },
    ...aloneTimeProfileTraits,
    {
      label: "Exercise needs",
      trait: getEnergyTrait({
        structuredValue: dog.exercise_needs,
        bioValue: dog.bio_exercise_needs,
        evidenceBasis: aiTraits?.exercise_needs?.evidence_basis,
      }),
    },
    {
      label: "Obedience training",
      trait: getStructuredObedienceDisplay(dog.obedience_training),
    },
    {
      label: "Training support estimate",
      trait: getEnergyTrait({
        structuredValue: null,
        bioValue: dog.bio_training_needs,
        evidenceBasis: aiTraits?.training_needs?.evidence_basis,
      }),
    },
    {
      label: "First-time owner fit",
      trait: getTraitDisplay({
        structuredValue: dog.first_time_friendly,
        bioValue: dog.bio_first_time_friendly,
        evidenceBasis: aiTraits?.first_time_friendly?.evidence_basis,
      }),
    },
    {
      label: "Crate training",
      trait: getTrainingTraitDisplay(aiTraits?.crate_trained),
    },
    {
      label: "Leash manners",
      trait: getTrainingTraitDisplay(aiTraits?.leash_trained),
    },
  ];
  const confirmedTraits = profileTraits.filter(({ trait }) => !trait.estimated && trait.source !== "unknown");
  const estimatedTraits = profileTraits.filter(({ trait }) => trait.estimated);
  const unknownTraits = profileTraits.filter(({ trait }) => trait.source === "unknown");
  const hasDogPhoto = Boolean(resolvedImage) && !imageFailed;
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
    aloneTimeEvidence.observation !== "unknown" ||
    String(aiTraits?.crate_trained?.value || "unknown") !== "unknown" ||
    String(aiTraits?.leash_trained?.value || "unknown") !== "unknown" ||
    String(aiTraits?.training_needs?.value || "unknown") !== "unknown" ||
    dog.first_time_friendly === true || dog.first_time_friendly === false ||
    Boolean(dog.bio_size);
  const matchScorePct = Number(quizMatch?.scorePct);
  const hasQuizMatch = isRealMatchScore(quizMatch);
  const limitedMatchInformation = quizMatch?.breakdown?.limitedInformation === true;
  const fitScoreLabel = formatFitScore(matchScorePct);
  const matchReasons = getPositiveEvidenceItems(quizMatch?.breakdown, 6);
  const matchTradeoffs = getTradeoffEvidenceItems(quizMatch?.breakdown, 2);
  const matchEvidenceLabels = getEvidenceLabels(quizMatch?.breakdown);
  const fitScoreScope = getFitScoreScope(quizMatch?.breakdown);
  const matchCautions = Array.isArray(quizMatch?.breakdown?.compatibilityCautions)
    ? quizMatch.breakdown.compatibilityCautions.filter(Boolean)
    : [];
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
    <div className="min-h-screen bg-[#F5F1E9] font-['Inter',sans-serif] text-[#183D35]">
      {seo}
      <RescueGroupsTracker dog={dog} />
      {matchInfoOpen && hasQuizMatch
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex items-end justify-center bg-[#183D35]/55 px-3 pb-3 pt-12 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
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
                    <h2
                      id="match-modal-title"
                      className="text-3xl font-extrabold leading-none text-[#183D35]"
                    >
                      Why this dog may fit
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMatchInfoOpen(false)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl font-bold leading-none text-[#6F6A66] shadow-sm ring-1 ring-[#183D35]/5 hover:bg-[#EFE8DC] hover:text-[#183D35]"
                    aria-label="Close fit score details"
                  >
                    ×
                  </button>
                </div>

                <p className="mt-4 text-sm font-semibold leading-6 text-[#6F6A66]">
                  {limitedMatchInformation
                    ? "Limited listing information: this fit score uses the dog details currently available, but several active preferences could not be assessed."
                    : "This fit score is based on your quiz answers and the dog details currently available from the shelter or rescue."}
                </p>

                {fitScoreScope.summary ? (
                  <div className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-sm font-semibold leading-6 text-[#6F6A66] ring-1 ring-[#183D35]/5">
                    <p className="text-[#183D35]">{fitScoreScope.summary}</p>
                    <p>{fitScoreScope.evidenceSummary}</p>
                  </div>
                ) : null}

                {matchEvidenceLabels.length ? (
                  <div className="mt-4 flex flex-wrap gap-2" aria-label="Fit score evidence sources">
                    {matchEvidenceLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold text-[#183D35] ring-1 ring-[#183D35]/10"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {matchCautions.length ? (
                  <div className="mt-5 rounded-2xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm font-bold leading-5 text-amber-950" role="alert">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-800">
                      Important compatibility caution
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {matchCautions.map((caution) => (
                        <li key={caution}>{caution}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {matchTradeoffs.length ? (
                  <div className="mt-5 rounded-2xl border border-[#183D35]/10 bg-white/70 px-4 py-3 text-sm leading-5 text-[#6F6A66]">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#183D35]">
                      Things to consider
                    </div>
                    <ul className="mt-2 space-y-2">
                      {matchTradeoffs.map((tradeoff) => (
                        <li key={tradeoff.explanation}>
                          <div className="font-semibold">{tradeoff.explanation}</div>
                          <div className="mt-0.5 text-[11px] font-bold">{tradeoff.sourceLabel}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {matchReasons.length ? (
                  <div className="mt-5">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#6F6A66]">
                      Compatibility highlights
                    </div>
                    <ul className="mt-3 space-y-2">
                      {matchReasons.map((reason) => (
                        <li
                          key={reason.explanation}
                          className="flex gap-2.5 rounded-2xl border border-[#183D35]/10 bg-white/80 px-3.5 py-3 text-sm font-bold leading-5 text-[#183D35] shadow-sm"
                        >
                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dfe7d7] text-[11px] text-[#183D35]">
                            ✓
                          </span>
                          <span>
                            <span className="block">{reason.explanation}</span>
                            <span className="mt-0.5 block text-[11px] text-[#6F6A66]">{reason.sourceLabel}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p className="mt-5 rounded-2xl bg-white/62 px-4 py-3 text-xs font-semibold leading-5 text-[#6F6A66] ring-1 ring-[#183D35]/5">
                  Some lifestyle information is estimated using shelter-provided information, breed characteristics, and listing descriptions when specific details aren’t available. Always confirm with the shelter or rescue.
                </p>

                <button
                  type="button"
                  onClick={() => setMatchInfoOpen(false)}
                  className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#183D35] px-5 py-3 text-sm font-bold text-[#F3C982] hover:bg-[#12332C]"
                >
                  Close
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {photoOpen && hasDogPhoto ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#183D35]/80 px-3 py-5 backdrop-blur-sm sm:px-4 sm:py-6"
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
              className="absolute right-1 top-1 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl font-bold leading-none text-[#183D35] shadow-lg transition hover:bg-[#EFE8DC] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#183D35] sm:-translate-y-5 sm:translate-x-5"
              aria-label="Close enlarged photo"
            >
              ×
            </button>

            <img
              src={imgSrc}
              alt={`${name}, enlarged adoptable ${breed} photo`}
              className="max-h-[88vh] max-w-full rounded-2xl bg-white object-contain shadow-2xl"
              onError={() => {
                setImageFailed(true);
                setPhotoOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}

      {aiInfoOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#183D35]/55 px-4 backdrop-blur-sm"
          onMouseDown={() => setAiInfoOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-[#6F6A66]">
                  What we noticed from the bio
                </div>
                <h2 className="mt-2 font-['Fraunces',serif] text-2xl font-semibold tracking-[-0.01em] text-[#183D35]">
                  Things to confirm with the shelter or rescue
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setAiInfoOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#EFE8DC] text-lg font-bold text-[#6F6A66] hover:bg-[#EFE8DC] hover:text-[#183D35]"
                aria-label="Close bio notes information"
              >
                ×
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-[#6F6A66]">
              Some lifestyle information is estimated using shelter-provided information, breed characteristics, and listing descriptions when specific details aren’t available. Always confirm with the shelter or rescue.
            </p>

            <p className="mt-3 text-sm leading-6 text-[#6F6A66]">
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
              className="mt-5 w-full rounded-full bg-[#183D35] px-5 py-3 text-sm font-bold text-[#F3C982] hover:bg-[#12332C]"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      <SiteHeader
        back={{ to: backLink, label: backLabel.replace(/^←\s*/, "") }}
        ctas={[{ label: "View saved dogs", to: "/saved", variant: "secondary" }]}
      />

      <StructuredData
        value={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "ItemPage",
              name: sharedSeo.title,
              url: sharedSeo.canonicalUrl,
              description: sharedSeo.description,
            },
            breadcrumbJsonLd([
              { label: "Home", to: "/" },
              { label: "Dogs", to: "/dogs" },
              ...(shelterId ? [{ label: shelterName, to: `/shelter/${shelterId}` }] : []),
              { label: name, to: `/dog/${id}` },
            ]),
          ],
        }}
      />

      <div className="mx-auto max-w-6xl px-3.5 py-4 sm:px-6 sm:py-7">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "Dogs", to: "/dogs" },
            ...(shelterId ? [{ label: shelterName, to: `/shelter/${shelterId}` }] : []),
            { label: name, to: `/dog/${id}` },
          ]}
        />
        <section className="mt-3 overflow-hidden rounded-[1.75rem] bg-white shadow-[0_20px_58px_rgba(24,61,53,0.14)] ring-1 ring-[#183D35]/8 sm:mt-4 sm:rounded-[2.25rem]">
          <div className="grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#dfe7d7] sm:aspect-[16/11] lg:aspect-auto lg:min-h-[34rem]">
              {hasDogPhoto ? (
                <button
                  type="button"
                  onClick={() => setPhotoOpen(true)}
                  className="group absolute inset-0 block h-full w-full cursor-zoom-in bg-[#EFE8DC] focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-white/80"
                  aria-label={`Open larger photo of ${name}`}
                >
                  <img
                    src={imgSrc}
                    alt={`${name}, adoptable ${breed}`}
                    className="hf-profile-photo h-full w-full bg-[#EFE8DC] object-cover object-[50%_28%] transition duration-500 group-hover:scale-[1.018]"
                    onError={() => setImageFailed(true)}
                  />
                  <span className="absolute bottom-4 left-4 rounded-full bg-black/45 px-3 py-1.5 text-xs font-bold text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    View photo
                  </span>
                </button>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#eef3e8,#dfe7d7)] px-6 text-center" role="img" aria-label={`Photo unavailable for ${name}`}>
                  <span className="text-6xl" aria-hidden="true">🐶</span>
                  <p className="mt-4 font-['Fraunces',serif] text-2xl font-semibold text-[#183D35]">Photo unavailable</p>
                  <p className="mt-2 max-w-xs text-sm leading-6 text-[#527166]">The official listing may have more photos of {name}.</p>
                </div>
              )}

              {hasMultiplePhotos && hasDogPhoto ? (
                <>
                  <button
                    type="button"
                    onClick={() => goToPhoto(galleryIndex - 1)}
                    aria-label={`Show previous photo of ${name}`}
                    className="absolute left-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#183D35]/40 text-lg leading-none text-white backdrop-blur-sm transition hover:bg-[#183D35]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-10 sm:w-10"
                  >
                    ‹
                  </button>

                  <button
                    type="button"
                    onClick={() => goToPhoto(galleryIndex + 1)}
                    aria-label={`Show next photo of ${name}`}
                    className="absolute right-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#183D35]/40 text-lg leading-none text-white backdrop-blur-sm transition hover:bg-[#183D35]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-10 sm:w-10"
                  >
                    ›
                  </button>

                  <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[#183D35]/45 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                    {galleryIndex + 1} / {galleryUrls.length}
                  </div>
                </>
              ) : null}

            </div>

            <div className="flex flex-col justify-center bg-[#183D35] px-5 py-6 text-white sm:px-8 sm:py-9 lg:px-10 lg:py-11">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#F3C982]">Adoptable dog profile</p>
                <button
                  type="button"
                  onClick={onToggleSaved}
                  className="hf-save-button inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white/10 px-4 text-sm font-black text-white ring-1 ring-white/20 hover:bg-white hover:text-[#183D35]"
                  aria-label={saved ? `♥ Saved — Remove ${name} from saved dogs` : `♡ Save ${name}`}
                  aria-pressed={saved}
                  data-saved={saved ? "true" : "false"}
                >
                  <span className="hf-save-heart text-lg text-[#F3C982]" aria-hidden="true">{saved ? "♥" : "♡"}</span>
                  {saved ? "Saved" : "Save"}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <h1 className="font-['Fraunces',serif] text-[2.9rem] font-semibold leading-[0.98] tracking-[-0.03em] text-white sm:text-6xl">
                  {name}
                </h1>

                {hasQuizMatch ? (
                  <button
                    type="button"
                    onClick={() => setMatchInfoOpen(true)}
                    className="inline-flex flex-col items-start rounded-2xl bg-white/10 px-3 py-2 text-left text-[11px] font-black uppercase leading-tight tracking-[0.14em] text-white ring-1 ring-white/20 hover:bg-white/15"
                    aria-label={[
                      "Open fit score details",
                      fitScoreLabel,
                      fitScoreScope.prominent,
                      limitedMatchInformation ? "Limited listing information" : "",
                    ].filter(Boolean).join(". ")}
                  >
                    <span>
                      {limitedMatchInformation
                        ? `${fitScoreLabel} · Limited listing information`
                        : fitScoreLabel}
                    </span>
                    {fitScoreScope.prominent ? (
                      <span className="mt-0.5 text-[10px] font-bold normal-case tracking-normal text-white/65">
                        {fitScoreScope.prominent}
                      </span>
                    ) : null}
                  </button>
                ) : null}
              </div>
              {coreFactsLine ? (
                <p className="mt-3 text-base font-semibold leading-6 text-white/76">
                  {coreFactsLine}
                </p>
              ) : null}

              <p className="mt-2 text-sm font-semibold text-white/65">{location}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {quickFacts.map((fact) => (
                  <QuickFact key={`${fact.label}-${fact.value}`} label={fact.label} value={fact.value} tone="dark" />
                ))}
              </div>

              <div className="mt-6 rounded-[1.5rem] bg-white/8 p-4 ring-1 ring-white/15 sm:p-5">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#F3C982]">Continue with the source</p>
                <p className="mt-2 text-sm leading-6 text-white/72">
                  {shelterName} manages availability, applications, fees, and final adoption decisions.
                </p>

                <a
                  href={applyLink || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={`mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 py-3 text-sm font-black ${
                    applyLink
                      ? "bg-[#F3C982] text-[#183D35] hover:bg-[#f7d695]"
                      : "cursor-not-allowed bg-white/12 text-white/55"
                  }`}
                  onClick={(e) => {
                    if (!applyLink) {
                      e.preventDefault();
                      return;
                    }

                    trackAdoptionLinkClick();
                  }}
                  aria-disabled={!applyLink}
                >
                  {applyLabel}
                </a>

                <p className="mt-3 text-xs leading-5 text-white/58">
                  Opens the shelter or rescue’s validated official destination in a new tab.
                </p>
              </div>

              <p role="status" className="sr-only" aria-live="polite">{saveAnnouncement}</p>
            </div>
          </div>
        </section>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">

          {hasQuizMatch ? (
            <section className="order-3 overflow-hidden rounded-[1.75rem] bg-[#eef3e8] p-5 shadow-[0_12px_34px_rgba(24,61,53,0.08)] ring-1 ring-[#183D35]/8 sm:p-7 lg:col-span-2" aria-labelledby="profile-match-title">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-[#527166]">Your lifestyle fit</div>
                  <h2 id="profile-match-title" className="mt-2 font-['Fraunces',serif] text-3xl font-semibold leading-tight tracking-[-0.02em] text-[#183D35]">
                    {name} may fit parts of your home and routine.
                  </h2>
                  <p className="mt-2 max-w-2xl text-base leading-7 text-[#527166]">
                    These highlights come from your quiz answers and the dog details currently available from the shelter or rescue.
                  </p>
                  {fitScoreScope.summary ? (
                    <div className="mt-3 text-sm font-semibold leading-6 text-[#527166]">
                      <p>{fitScoreScope.summary}</p>
                      <p>{fitScoreScope.evidenceSummary}</p>
                    </div>
                  ) : null}
                </div>

              </div>

              {matchCautions.length ? (
                <div className="mt-5 rounded-2xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm font-bold leading-5 text-amber-950" role="alert">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-800">
                    Important compatibility caution
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {matchCautions.map((caution) => (
                      <li key={caution}>{caution}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {matchTradeoffs.length ? (
                <div className="mt-4 rounded-2xl border border-[#183D35]/10 bg-white/70 px-4 py-3 text-sm leading-5 text-[#6F6A66]">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#183D35]">
                    Things to consider
                  </div>
                  <ul className="mt-2 space-y-2">
                    {matchTradeoffs.map((tradeoff) => (
                      <li key={tradeoff.explanation}>
                        <div className="font-semibold">{tradeoff.explanation}</div>
                        <div className="mt-0.5 text-[11px] font-bold">{tradeoff.sourceLabel}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {matchReasons.length ? (
                <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {matchReasons.slice(0, 4).map((reason) => (
                    <li
                      key={reason.explanation}
                      className="flex gap-3 rounded-2xl bg-white/82 px-4 py-4 text-sm font-semibold leading-6 text-[#527166] shadow-sm ring-1 ring-[#183D35]/8"
                    >
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dfe7d7] text-[11px] text-[#183D35]">
                        ✓
                      </span>
                      <span>
                        <span className="block">{reason.explanation}</span>
                        <span className="mt-0.5 block text-[11px] font-bold text-[#6F6A66]">{reason.sourceLabel}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {matchEvidenceLabels.length ? (
                <div className="mt-4 flex flex-wrap gap-2" aria-label="Fit score evidence sources">
                  {matchEvidenceLabels.map((label) => (
                    <span
                      key={label}
                      className="rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold text-[#183D35] ring-1 ring-[#183D35]/10"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              ) : null}

              <p className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-xs font-semibold leading-5 text-[#6F6A66] ring-1 ring-[#183D35]/5">
                Some lifestyle information is estimated using shelter-provided information, breed characteristics, and listing descriptions when specific details aren’t available. Always confirm with the shelter or rescue.
              </p>
            </section>
          ) : null}

          <section className="order-4 rounded-[1.75rem] bg-white p-5 shadow-[0_12px_34px_rgba(24,61,53,0.07)] ring-1 ring-[#183D35]/8 sm:p-7 lg:col-span-2" aria-labelledby="profile-traits-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#6F6A66]">Lifestyle details</p>
                <h2 id="profile-traits-title" className="mt-2 font-['Fraunces',serif] text-3xl font-semibold tracking-[-0.02em] text-[#183D35]">Known details and thoughtful estimates</h2>
                <p className="mt-2 max-w-2xl text-base leading-7 text-[#6F6A66]">
                  Source-listed facts stay distinct from interpretations and unknowns, so you know what to confirm.
                </p>
              </div>

              {hasBioTraitData ? (
                <button
                  type="button"
                  onClick={() => setAiInfoOpen(true)}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F5F1E9] text-sm font-black text-[#6F6A66] ring-1 ring-[#183D35]/10 hover:bg-[#EFE8DC] hover:text-[#183D35]"
                  aria-label="Learn about bio notes"
                >
                  i
                </button>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap gap-2" aria-label="Information key">
              <EvidenceKey tone="confirmed" label="Shelter-confirmed" />
              <EvidenceKey tone="estimated" label="AI-estimated · confirm" />
              <EvidenceKey tone="unknown" label="Unknown" />
            </div>

            <div className="mt-6 space-y-4">
              <EvidenceGroup title="Shelter-confirmed" tone="confirmed" items={confirmedTraits} wide />
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <EvidenceGroup title="AI-estimated · confirm" tone="estimated" items={estimatedTraits} />
                <EvidenceGroup title="Still unknown" tone="unknown" items={unknownTraits} />
              </div>
            </div>

            <p className="mt-5 rounded-2xl bg-[#F5F1E9] px-4 py-3 text-sm leading-6 text-[#6F6A66]">
              Estimates can help you form questions, but they are not guarantees. Confirm behavior, home fit, and current needs with the shelter or rescue.
            </p>
          </section>

          <section className="order-5 rounded-[1.75rem] bg-white p-5 shadow-[0_12px_34px_rgba(24,61,53,0.07)] ring-1 ring-[#183D35]/8 sm:p-7 lg:col-span-2">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#6F6A66]">From the listing</p>
            <h2 className="mt-2 font-['Fraunces',serif] text-3xl font-semibold tracking-[-0.02em] text-[#183D35]">About {name}</h2>
            <p
              id="dog-bio-text"
              className="mt-4 text-base leading-7 text-[#6F6A66] sm:hidden"
            >
              {bioExpanded || !bioIsLong ? description : bioPreview}
            </p>
            <p className="mt-4 hidden max-w-4xl text-base leading-7 text-[#6F6A66] sm:block">
              {description}
            </p>

            {bioIsLong ? (
              <button
                type="button"
                onClick={() => setBioExpanded((isExpanded) => !isExpanded)}
                className="mt-3 inline-flex min-h-10 items-center rounded-full border border-[#183D35]/10 px-4 py-2 text-sm font-semibold text-[#183D35] hover:bg-[#F5F1E9] sm:hidden"
                aria-expanded={bioExpanded}
                aria-controls="dog-bio-text"
              >
                {bioExpanded ? "Show less" : "Read more"}
              </button>
            ) : null}
          </section>

          <section className="order-6 rounded-3xl border border-[#183D35]/10 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="font-['Fraunces',serif] text-sm font-semibold text-[#183D35]">Listed by</h2>
            <div className="mt-3 flex items-center gap-3">
              {shelterLogo && !shelterLogoFailed ? (
                <div className="flex h-14 w-28 shrink-0 items-center justify-center rounded-xl border border-[#183D35]/10 bg-white p-2 sm:h-16 sm:w-36">
                  <img
                    src={shelterLogo}
                    alt={`${shelterName} logo`}
                    className="h-full w-full object-contain"
                    onError={() => setShelterLogoFailed(true)}
                  />
                </div>
              ) : (
                <div className="flex h-14 w-28 shrink-0 items-center justify-center rounded-xl border border-[#183D35]/10 bg-[#EFE8DC] text-lg font-extrabold text-[#6F6A66] sm:h-16 sm:w-36">
                  {shelterName.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0">
                {shelterId ? (
                  <Link
                    to={`/shelter/${shelterId}`}
                    className="break-words font-semibold text-[#183D35] underline-offset-4 hover:underline"
                  >
                    {shelterName}
                  </Link>
                ) : (
                  <div className="break-words font-semibold text-[#183D35]">{shelterName}</div>
                )}
                <div className="break-words text-sm text-[#6F6A66]">{location}</div>
              </div>
            </div>
          </section>

          <section className="order-7 rounded-3xl border border-[#183D35]/10 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="font-['Fraunces',serif] text-sm font-semibold text-[#183D35]">Before you inquire</h2>
            <ul className="mt-3 space-y-2 text-sm leading-5 text-[#6F6A66]">
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C7D4BB]" />
                <span>Read the dog’s full bio and match notes.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C7D4BB]" />
                <span>Check known fit details like kids, cats, dogs, potty training, and energy.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C7D4BB]" />
                <span>Make sure the location and travel distance work for you.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C7D4BB]" />
                <span>Contact the shelter or rescue directly for current availability and adoption requirements.</span>
              </li>
            </ul>
            <p className="mt-4 border-t border-[#EFE8DC] pt-3 text-xs leading-5 text-[#6F6A66]">
              Listing info can change. Dog availability, adoption fees, and requirements may
              change quickly. Always confirm details directly with the shelter or rescue before applying
              or visiting.
            </p>
          </section>

          <section className="order-8 rounded-3xl border border-[#DFE7D7] bg-[#F7FAF3]/70 p-5 shadow-sm sm:p-6 lg:col-span-2">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-[#183D35]">
              Bringing your dog home
            </div>
            <h2 className="mt-2 font-['Fraunces',serif] text-xl font-semibold text-[#183D35]">
              Expect an adjustment period
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6F6A66]">
              Even potty-trained dogs may have accidents while settling into a new home. New
              routines, smells, people, and stress can all affect behavior at first. A dog may
              be quiet, nervous, extra clingy, bark or whine, test rules, or need time to show
              their real personality.
            </p>

            <div className="mt-4 rounded-2xl border border-[#DFE7D7] bg-white/80 p-4">
              <div className="text-sm font-extrabold text-[#183D35]">
                The 3-3-3 rule is a rough guide
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-[#6F6A66] sm:grid-cols-3">
                <div>
                  <span className="font-bold text-[#183D35]">First 3 days:</span> decompress
                </div>
                <div>
                  <span className="font-bold text-[#183D35]">First 3 weeks:</span> learn routines
                </div>
                <div>
                  <span className="font-bold text-[#183D35]">First 3 months:</span> feel more settled
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#6F6A66]">
                Every dog is different, so this is a guide, not a guarantee. Patience and
                consistency help.
              </p>
            </div>

            <div className="mt-4">
              <h3 className="font-['Fraunces',serif] text-sm font-semibold text-[#183D35]">
                Quick tips for the first few weeks
              </h3>
              <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm leading-5 text-[#6F6A66] sm:grid-cols-2">
                <li>• Keep the first few days calm and predictable.</li>
                <li>• Set up a quiet safe space.</li>
                <li>• Take potty breaks more often than you think you need to.</li>
                <li>• Supervise indoors at first.</li>
                <li>• Reward outdoor potty trips and calm behavior.</li>
                <li>• Introduce new people, pets, and places slowly.</li>
              </ul>
              <p className="mt-3 text-sm leading-5 text-[#6F6A66]">
                Ask the shelter, rescue, vet, or trainer for help if concerns feel severe or do not
                improve.
              </p>
            </div>
          </section>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}

function QuickFact({ label, value, tone = "light" }) {
  const dark = tone === "dark";
  return (
    <div className={dark
      ? "rounded-2xl bg-white/8 px-3 py-2 ring-1 ring-white/12"
      : "rounded-2xl bg-[#F5F1E9] px-3 py-2 ring-1 ring-[#183D35]/10"}
    >
      <div className={`text-[11px] font-bold uppercase tracking-[0.09em] ${dark ? "text-white/55" : "text-[#6F6A66]"}`}>
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-extrabold leading-5 ${dark ? "text-white" : "text-[#183D35]"}`}>{value}</div>
    </div>
  );
}

function EvidenceKey({ tone, label }) {
  const styles = {
    confirmed: "bg-[#eef3e8] text-[#315d50] ring-[#315d50]/20",
    estimated: "bg-[#fff4dc] text-[#805914] ring-[#c58b20]/25",
    unknown: "bg-[#f1efeb] text-[#6F6A66] ring-[#6F6A66]/15",
  };

  return (
    <span className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-black ring-1 ${styles[tone]}`}>
      {label}
    </span>
  );
}

function EvidenceGroup({ title, tone, items, wide = false }) {
  const styles = {
    confirmed: "bg-[#f7faf3] ring-[#315d50]/14",
    estimated: "bg-[#fffaf0] ring-[#c58b20]/18",
    unknown: "bg-[#f7f5f1] ring-[#6F6A66]/12",
  };

  return (
    <section className={`rounded-[1.35rem] p-4 ring-1 ${styles[tone]}`} aria-label={title}>
      <h3 className="text-sm font-black text-[#183D35]">{title}</h3>
      {items.length ? (
        <div className={`mt-3 grid gap-2.5 sm:grid-cols-2 ${wide ? "lg:grid-cols-3" : ""}`}>
          {items.map(({ label, trait }) => (
            <TraitCard key={label} label={label} trait={trait} tone={tone} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-[#6F6A66]">No details in this category.</p>
      )}
    </section>
  );
}

function TraitCard({ label, trait, tone }) {
  const title = trait.title || "Noted from the shelter or rescue bio. Confirm with the source.";
  const valueStyles = {
    confirmed: "text-[#183D35]",
    estimated: "text-[#805914]",
    unknown: "text-[#6F6A66]",
  };

  return (
    <div className="rounded-2xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-[#183D35]/7">
      <div className="text-sm font-semibold text-[#6F6A66]">{label}</div>
      <div className={`mt-1 flex items-center gap-1.5 text-base font-extrabold ${valueStyles[tone]}`}>
        <span>{trait.value}</span>
        {trait.estimated ? (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#fff4dc] text-xs text-[#805914]" title={title} aria-label={title}>
            i
          </span>
        ) : null}
      </div>

      {trait.estimated || trait.note ? (
        <div className="mt-1 text-xs font-semibold leading-5 text-[#6F6A66]">
          {trait.note || "From bio"}
        </div>
      ) : null}
    </div>
  );
}
