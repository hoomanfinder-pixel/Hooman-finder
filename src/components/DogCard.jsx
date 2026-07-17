// src/components/DogCard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  getDogApplyLink,
  getDogSourceLocation,
  getDogSourceName,
} from "../lib/dogSource";
import { normalizeImageUrl } from "../lib/urlSafety";
import { formatAge, resolveAgeYears } from "../utils/formatAge";
import { decodeHtmlEntities } from "../utils/decodeHtmlEntities";
import { getTraitDisplay } from "../lib/traitDisplay";

const SAVED_KEY = "hooman_saved_dog_ids_v1";

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

function isRealMatchScore(scorePct, breakdown) {
  if (breakdown?.enoughQuizInfo === false) return false;
  return Number.isFinite(Number(scorePct));
}

function matchTier(scorePct, breakdown) {
  if (!isRealMatchScore(scorePct, breakdown)) {
    return {
      label: "Quiz needed",
      className: "bg-white/90 text-[#0F2742]",
    };
  }

  const n = Number(scorePct);

  if (n >= 85) return { label: "Strong match", className: "bg-white text-[#0F2742]" };
  if (n >= 70) return { label: "Good match", className: "bg-white/90 text-[#0F2742]" };
  return { label: "Potential match", className: "bg-white/85 text-[#0F2742]" };
}

function urgencyStyle(level) {
  switch (level) {
    case "Critical":
      return "bg-red-600 text-white";
    case "High":
      return "bg-orange-500 text-white";
    case "Urgent":
      return "bg-orange-500 text-white";
    case "Adopted":
      return "bg-emerald-600 text-white";
    default:
      return "bg-white/85 text-[#0F2742]";
  }
}

function readableReason(reason) {
  const raw = String(reason || "").trim();
  if (!raw) return "";

  const map = {
    Size: "Matches your preferred size range",
    size: "Matches your preferred size range",
    "Energy Level": "Fits your preferred energy level",
    "energy level": "Fits your preferred energy level",
    Energy: "Fits your preferred energy level",
    energy: "Fits your preferred energy level",
    Age: "Fits the age range you selected",
    age: "Fits the age range you selected",
    Kids: "May work with your kid/home setup",
    kids: "May work with your kid/home setup",
    "Other pets": "Lines up with your pet preferences",
    "other pets": "Lines up with your pet preferences",
    "Potty training": "Fits your potty-training preference",
    "potty training": "Fits your potty-training preference",
    Allergies: "May fit allergy or shedding needs",
    allergies: "May fit allergy or shedding needs",
    Shedding: "Fits your shedding preference",
    shedding: "Fits your shedding preference",
    "Alone time": "May fit your weekday alone-time schedule",
    "alone time": "May fit your weekday alone-time schedule",
  };

  return map[raw] || raw;
}

function getCleanTopReasons(breakdown) {
  const incoming = Array.isArray(breakdown?.matchReasons)
    ? breakdown.matchReasons
    : Array.isArray(breakdown?.topReasons)
      ? breakdown.topReasons
      : [];

  return incoming
    .map(readableReason)
    .filter(Boolean)
    .filter((reason, index, arr) => arr.indexOf(reason) === index)
    .slice(0, 4);
}

function hasStructuredDogInfo(dog) {
  return Boolean(
    dog?.size ||
      dog?.age_years !== null ||
      dog?.age_text ||
      dog?.energy_level ||
      dog?.good_with_kids === true ||
      dog?.good_with_dogs === true ||
      dog?.good_with_cats === true ||
      dog?.potty_trained === true ||
      dog?.hypoallergenic === true ||
      dog?.description
  );
}

function buildDogInfoBullets(dog) {
  const bullets = [];

  if (dog?.size) bullets.push(`${dog.size} size`);
  if (dog?.energy_level) bullets.push(`${dog.energy_level} energy`);
  if (dog?.good_with_dogs === true) bullets.push("Listed as good with dogs");
  if (dog?.good_with_cats === true) bullets.push("Listed as good with cats");
  if (dog?.good_with_kids === true) bullets.push("Listed as good with kids");
  if (dog?.potty_trained === true) bullets.push("Potty trained");
  if (dog?.hypoallergenic === true) bullets.push("Hypoallergenic");

  return bullets.slice(0, 4);
}

function getMatchState({ dog, scorePct, breakdown }) {
  const hasScore = isRealMatchScore(scorePct, breakdown);
  const topReasons = getCleanTopReasons(breakdown);
  const answeredCount = Number(breakdown?.answeredCount || 0);

  if (hasScore) {
    return {
      kind: "match",
      eyebrow: "Why this match",
      headline: dog?.name || "This dog",
      subhead: `${Math.round(Number(scorePct))}% match`,
      reasonsTitle: "Why this dog may match you",
      reasons: topReasons,
      note: topReasons.length
        ? "These reasons are based on your quiz answers and available rescue/shelter info."
        : "We found a possible fit, but there are not enough confirmed details for specific highlights yet.",
      pillText: `${Math.round(Number(scorePct))}% match`,
      showScoreCircle: true,
    };
  }

  if (answeredCount <= 0 || breakdown?.emptyReason === "no_quiz_answers") {
    return {
      kind: "quiz_needed",
      eyebrow: "Match details",
      headline: "Not enough match info yet",
      subhead: "Answer the quiz to unlock better lifestyle matches for this dog.",
      reasonsTitle: "What the quiz compares",
      reasons: [
        "Size, age, and energy preferences",
        "Home setup, stairs, and alone-time needs",
        "Kids, cats, dogs, and other pet compatibility",
      ],
      note: "For now, this is a browse suggestion — not a true lifestyle match score yet.",
      pillText: "Quiz needed",
      showScoreCircle: false,
    };
  }

  if (!hasStructuredDogInfo(dog)) {
    return {
      kind: "limited_info",
      eyebrow: "Match details",
      headline: "Limited dog info available",
      subhead: "This dog may still be a great fit, but the listing does not include enough structured details yet.",
      reasonsTitle: "What would improve this match",
      reasons: [
        "More details about energy level",
        "More info about kids, cats, or other dogs",
        "More notes about home setup and routine",
      ],
      note: "We avoid guessing when rescue/shelter info is limited.",
      pillText: "Info limited",
      showScoreCircle: false,
    };
  }

  return {
    kind: "more_info_needed",
    eyebrow: "Match details",
    headline: "More quiz info needed",
    subhead: "Answer a few more questions so we can compare this dog against your lifestyle.",
    reasonsTitle: "We’ll compare",
    reasons: [
      "Lifestyle and activity level",
      "Home setup and daily routine",
      "Pet, kid, and experience preferences",
    ],
    note: "A real match score needs both your quiz answers and available dog details.",
    pillText: "More info needed",
    showScoreCircle: false,
  };
}

function displayApplyLink(dog) {
  return getDogApplyLink(dog);
}

function displayLocation(dog) {
  return getDogSourceLocation(dog, "Apply through listing organization");
}

function shelterName(dog) {
  return getDogSourceName(dog);
}

function displayBreed(dog) {
  return dog?.breed || "Mixed breed";
}

function dogPhotoAlt(dog) {
  const name = dog?.name || "Unnamed dog";
  const breed = displayBreed(dog);
  const source = shelterName(dog);
  return source
    ? `${name}, adoptable ${breed} from ${source}`
    : `${name}, adoptable ${breed}`;
}

function buildDescription(dog) {
  const raw =
    dog?.description ||
    dog?.bio ||
    dog?.placement_note ||
    dog?.notes ||
    "";

  const clean = decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();

  if (!clean) {
    const bits = [];
    if (dog?.energy_level) bits.push(`${dog.energy_level.toLowerCase()} energy`);
    if (dog?.good_with_dogs === true) bits.push("dog-friendly");
    if (dog?.good_with_cats === true) bits.push("cat-friendly");
    if (dog?.potty_trained === true) bits.push("potty trained");

    return bits.length
      ? `A ${bits.join(", ")} dog who could be a strong fit.`
      : "Tap to learn more about this dog's personality and adoption details.";
  }

  return clean.length > 120 ? `${clean.slice(0, 117)}...` : clean;
}

function buildLifestyleTags(dog, ageLabel) {
  const tags = [];

  if (ageLabel) tags.push(ageLabel);
  if (dog?.breed) tags.push(dog.breed);
  else tags.push("Mixed breed");
  if (dog?.size) tags.push(dog.size);
  if (dog?.energy_level) tags.push(`${dog.energy_level} energy`);

  return tags.filter(Boolean).slice(0, 4);
}

const FIT_CHIP_FIELDS = [
  { structuredKey: "good_with_dogs", bioKey: "bio_good_with_dogs", label: "good with dogs" },
  { structuredKey: "good_with_cats", bioKey: "bio_good_with_cats", label: "good with cats" },
  { structuredKey: "good_with_kids", bioKey: "bio_good_with_kids", label: "good with kids" },
  { structuredKey: "potty_trained", bioKey: "bio_potty_trained", label: "potty trained" },
];

function capitalizeFirst(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Confirmed chips come only from structured shelter fields explicitly true;
// estimated chips come only from the existing bio-derived fallback fields,
// reusing the same source-priority rule DogDetail.jsx uses (never inventing
// a new one). Negative/unknown traits are omitted rather than shown.
function buildFitChips(dog) {
  const chips = [];

  for (const field of FIT_CHIP_FIELDS) {
    const trait = getTraitDisplay({
      structuredValue: dog?.[field.structuredKey],
      bioValue: dog?.[field.bioKey],
    });

    if (!trait.estimated && trait.value === "Yes") {
      chips.push({ label: capitalizeFirst(field.label), confirmed: true });
    } else if (trait.estimated && ["Yes", "Most likely", "May do well"].includes(trait.value)) {
      chips.push({ label: `Likely ${field.label}`, confirmed: false });
    }
  }

  return chips.slice(0, 3);
}

function PlaceholderPhoto({ name }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#eee8da] to-[#dfe7d7] text-center">
      <div className="text-3xl" aria-hidden="true">🐶</div>
      <div className="mt-2 px-3 text-xs font-black uppercase tracking-[0.18em] text-[#6F6A66]">
        {name || "Dog photo"}
      </div>
    </div>
  );
}

export default function DogCard({
  dog,
  scorePct = null,
  breakdown = null,
  showMatch = false,
  sessionId = null,
  variant = "grid",
  rank = null,
}) {
  const [openModal, setOpenModal] = useState(false);
  const [saved, setSaved] = useState(() => isSavedId(dog?.id));
  const [imageFailed, setImageFailed] = useState(false);

  const urgency = dog?.urgency_level || "Standard";
  const applyLink = displayApplyLink(dog);
  const rawImgSrc = useMemo(
    () => [dog?.photo_url, dog?.image_url, dog?.photo, dog?.image, dog?.primary_photo_url]
      .map((url) => normalizeImageUrl(url, { allowRelative: false }))
      .find(Boolean) || "",
    [dog?.image, dog?.image_url, dog?.photo, dog?.photo_url, dog?.primary_photo_url]
  );
  const imgSrc = imageFailed ? "" : rawImgSrc;
  const imgAlt = dogPhotoAlt(dog);
  const cardVariant = showMatch ? "match" : variant;

  const matchState = useMemo(
    () => getMatchState({ dog, scorePct, breakdown }),
    [dog, scorePct, breakdown]
  );

  const tier = useMemo(
    () => (showMatch ? matchTier(scorePct, breakdown) : null),
    [showMatch, scorePct, breakdown]
  );

  const ageLabel = useMemo(() => {
    const formatted = formatAge(resolveAgeYears(dog?.age_years, dog?.age_text));
    if (formatted && formatted !== "Unknown") return formatted;
    if (dog?.age_text) return dog.age_text;
    return "";
  }, [dog?.age_years, dog?.age_text]);

  const lifestyleTags = useMemo(() => buildLifestyleTags(dog, ageLabel), [dog, ageLabel]);
  const descriptionPreview = useMemo(() => buildDescription(dog), [dog]);
  const fitChips = useMemo(() => buildFitChips(dog), [dog]);

  const dogLink = useMemo(() => {
    const base = `/dog/${dog?.id}`;
    const params = new URLSearchParams();
    if (sessionId) params.set("session", sessionId);
    if (showMatch && sessionId) params.set("from", "results");
    else if (cardVariant === "saved") params.set("from", "saved");
    else params.set("from", "dogs");
    const search = params.toString() ? `?${params.toString()}` : "";
    return `${base}${search}`;
  }, [cardVariant, dog?.id, sessionId, showMatch]);

  const linkState = useMemo(() => {
    if (!showMatch) return null;

    return {
      fromQuiz: true,
      sessionId: sessionId || null,
      match: { scorePct, breakdown },
    };
  }, [showMatch, sessionId, scorePct, breakdown]);

  useEffect(() => {
    const sync = () => setSaved(isSavedId(dog?.id));

    window.addEventListener("storage", sync);
    window.addEventListener("hooman:saved_changed", sync);

    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("hooman:saved_changed", sync);
    };
  }, [dog?.id]);

  useEffect(() => {
    setImageFailed(false);
  }, [dog?.id, rawImgSrc]);

  function openFromClick(e) {
    e.preventDefault();
    e.stopPropagation();
    setOpenModal(true);
  }

  function closeModal() {
    setOpenModal(false);
  }

  function onToggleSaved(e) {
    e.preventDefault();
    e.stopPropagation();

    const nextSaved = toggleSavedId(dog?.id);
    setSaved(nextSaved);
  }

  function onApplyClick(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!applyLink) return;

    window.open(applyLink, "_blank", "noopener,noreferrer");
  }

  const heartButton = (
    <button
      type="button"
      onClick={onToggleSaved}
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full font-black shadow-sm backdrop-blur transition",
        cardVariant === "saved" ? "h-9 w-9 text-lg" : "h-8 w-8 text-base sm:h-9 sm:w-9 sm:text-lg",
        saved
          ? "bg-white text-rose-600"
          : "bg-black/35 text-white ring-1 ring-white/30 hover:bg-white hover:text-[#0F2742]",
      ].join(" ")}
      aria-label={saved ? "Unsave dog" : "Save dog"}
      title={saved ? "Saved" : "Save"}
    >
      {saved ? "♥" : "♡"}
    </button>
  );

  const modals = (
    <>
      {openModal
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4 py-5 backdrop-blur-sm"
              onMouseDown={closeModal}
            >
              <div
                className="relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-[#f5f1e9] p-5 shadow-2xl ring-1 ring-white/25 sm:max-w-lg sm:p-6"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-semibold text-[#6F6A66] shadow-sm ring-1 ring-[#0F2742]/5 hover:bg-[#EFE8DC] hover:text-[#0F2742]"
                  onClick={closeModal}
                  aria-label="Close"
                >
                  ×
                </button>

                <div className="pr-12">
                  <div className="text-[10px] font-black uppercase tracking-[0.28em] text-[#6F6A66]">
                    {matchState.eyebrow}
                  </div>

                  <h2 className="mt-2 font-['Fraunces',serif] text-[2rem] font-semibold leading-[1.05] text-[#0F2742] sm:text-4xl">
                    {matchState.headline}
                  </h2>

                  <p className="mt-3 text-sm font-semibold leading-6 text-[#6F6A66]">
                    {matchState.subhead}
                  </p>
                </div>

                <div className="mt-5 border-t border-[#0F2742]/10 pt-5">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#6F6A66]">
                    {matchState.reasonsTitle}
                  </div>

                  {matchState.reasons.length ? (
                    <ul className="mt-4 space-y-2.5">
                      {matchState.reasons.map((reason) => (
                        <li
                          key={reason}
                          className="flex gap-2.5 rounded-2xl border border-[#0F2742]/10 bg-white/70 px-3.5 py-3 text-sm font-semibold leading-5 text-[#0F2742] shadow-sm"
                        >
                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dfe7d7] text-[11px] text-[#0F2742]">
                            ✓
                          </span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <p className="mt-4 rounded-2xl bg-white/50 px-4 py-3 text-xs font-medium leading-5 text-[#6F6A66] ring-1 ring-[#0F2742]/5">
                    {matchState.note}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                  <Link
                    to={dogLink}
                    state={linkState}
                    className="inline-flex items-center justify-center rounded-2xl border border-[#0F2742]/15 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#0F2742] hover:bg-[#EFE8DC]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View profile
                  </Link>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl bg-[#0F2742] px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#F3C982] hover:bg-[#0C1E35]"
                    onClick={closeModal}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );

  if (cardVariant === "saved") {
    return (
      <>
        <Link
          to={dogLink}
          state={linkState}
          className="group grid grid-cols-[92px_1fr_auto] items-center gap-3 rounded-[1.35rem] border border-[#0F2742]/10 bg-white/80 p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md sm:grid-cols-[116px_1fr_auto] sm:p-3"
        >
          <div className="relative aspect-square overflow-hidden rounded-[1.05rem] bg-[#EFE8DC]">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={imgAlt}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                loading="lazy"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <PlaceholderPhoto name={dog?.name} />
            )}

            {urgency !== "Standard" ? (
              <span
                className={[
                  "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] shadow-sm",
                  urgencyStyle(urgency),
                ].join(" ")}
              >
                {urgency}
              </span>
            ) : null}
          </div>

          <div className="min-w-0 py-1">
            <h3 className="truncate font-['Fraunces',serif] text-xl font-semibold leading-none text-[#0F2742]">
              {dog?.name || "Unnamed"}
            </h3>

            <p className="mt-1 truncate text-[11px] font-semibold text-[#6F6A66]">
              {shelterName(dog)}
            </p>

            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#6F6A66]">
              {descriptionPreview}
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {(ageLabel ? [ageLabel, displayBreed(dog), dog?.size] : [displayBreed(dog), dog?.size])
                .filter(Boolean)
                .slice(0, 3)
                .map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[#f5f1e9] px-2 py-1 text-[10px] font-bold text-[#6F6A66] ring-1 ring-[#0F2742]/5"
                  >
                    {tag}
                  </span>
                ))}
            </div>

            <p className="mt-2 hidden truncate text-xs text-[#6F6A66] sm:block">
              {displayLocation(dog)}
            </p>
          </div>

          <div className="self-start">{heartButton}</div>
        </Link>

        {modals}
      </>
    );
  }

  if (cardVariant === "match") {
    const rankLabel = rank === 1 && matchState.kind === "match" ? "Top match" : `#${rank || "?"} match`;

    return (
      <>
        <Link
          to={dogLink}
          state={linkState}
          className="group flex h-full flex-col overflow-hidden rounded-[1.35rem] border border-[#0F2742]/10 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-xl sm:rounded-[1.5rem]"
        >
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#EFE8DC]">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={imgAlt}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                loading="lazy"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <PlaceholderPhoto name={dog?.name} />
            )}

            <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/35 to-transparent" />

            <div className="absolute left-2.5 right-2.5 top-2.5 flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap gap-1">
                <span className="inline-flex items-center rounded-full bg-[#dfe7d7] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-[#0F2742] shadow-sm sm:px-2.5 sm:py-1 sm:text-[10px]">
                  {rankLabel}
                </span>

                {showMatch && tier ? (
                  <span
                    className={[
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] shadow-sm backdrop-blur sm:px-2.5 sm:py-1 sm:text-[10px]",
                      tier.className,
                    ].join(" ")}
                    title={matchState.pillText}
                  >
                    {matchState.pillText}
                  </span>
                ) : null}

                {urgency !== "Standard" ? (
                  <span
                    className={[
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] shadow-sm sm:px-2.5 sm:py-1 sm:text-[10px]",
                      urgencyStyle(urgency),
                    ].join(" ")}
                  >
                    {urgency}
                  </span>
                ) : null}
              </div>

              {heartButton}
            </div>
          </div>

          <div className="flex flex-1 flex-col p-3.5 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-[#6F6A66]">
                  {shelterName(dog)}
                </p>

                <h2 className="mt-1 truncate font-['Fraunces',serif] text-2xl font-semibold leading-none text-[#0F2742] sm:text-3xl">
                  {dog?.name || "Unnamed"}
                </h2>
              </div>
            </div>

            <p className="mt-3 line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-[#6F6A66]">
              {descriptionPreview}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {lifestyleTags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex max-w-full items-center truncate rounded-full bg-[#f5f1e9] px-2.5 py-1 text-[10px] font-bold text-[#6F6A66] ring-1 ring-[#0F2742]/5"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-auto pt-4">
              <span className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-[#0F2742] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-[#F3C982] transition group-hover:bg-[#0C1E35]">
                View Profile
              </span>
            </div>
          </div>
        </Link>

        {modals}
      </>
    );
  }

  const metaLine = [ageLabel, displayBreed(dog), dog?.size].filter(Boolean).join(" · ");

  return (
    <>
      <Link
        to={dogLink}
        state={linkState}
        className="group flex flex-row items-start gap-3 overflow-hidden rounded-2xl border border-[#0F2742]/10 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:h-full sm:flex-col sm:items-stretch sm:gap-0 sm:rounded-[1.5rem] sm:p-0 sm:duration-300 sm:hover:shadow-xl"
      >
        {/* Compact square photo on mobile; full-width 4:3 photo from sm: up (unchanged desktop design). */}
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-[#EFE8DC] sm:h-auto sm:w-full sm:aspect-[4/3] sm:rounded-none">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={imgAlt}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <PlaceholderPhoto name={dog?.name} />
          )}

          <div className="absolute inset-x-0 top-0 hidden h-20 bg-gradient-to-b from-black/35 to-transparent sm:block" />

          <div className="absolute left-1.5 right-1.5 top-1.5 flex items-start justify-between gap-1.5 sm:left-2.5 sm:right-2.5 sm:top-2.5 sm:gap-2">
            <div className="flex min-w-0 flex-wrap gap-1">
              {urgency !== "Standard" ? (
                <span
                  className={[
                    "inline-flex items-center rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.1em] shadow-sm sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.14em]",
                    urgencyStyle(urgency),
                  ].join(" ")}
                >
                  {urgency}
                </span>
              ) : null}
            </div>

            {heartButton}
          </div>
        </div>

        {/* Compact info column on mobile (no bio, line-clamped facts); original desktop column from sm: up. */}
        <div className="min-w-0 flex-1 sm:flex sm:flex-1 sm:flex-col sm:p-4">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-[#6F6A66]">
            {shelterName(dog)}
          </p>

          <h2 className="mt-0.5 truncate font-['Fraunces',serif] text-base font-semibold leading-tight text-[#0F2742] sm:mt-1 sm:text-2xl sm:leading-none sm:text-3xl">
            {dog?.name || "Unnamed"}
          </h2>

          {metaLine ? (
            <p className="mt-1 text-xs leading-5 text-[#6F6A66] sm:text-sm">{metaLine}</p>
          ) : null}

          <p className="mt-3 line-clamp-3 min-h-[3.75rem] hidden text-sm leading-5 text-[#6F6A66] sm:block">
            {descriptionPreview}
          </p>

          {fitChips.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3">
              {fitChips.map((chip) => (
                <span
                  key={chip.label}
                  className={[
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold",
                    chip.confirmed
                      ? "bg-[#dfe7d7] text-[#0f2742]"
                      : "bg-[#fbf0dc] text-[#8a6a2f]",
                  ].join(" ")}
                >
                  <span aria-hidden="true">{chip.confirmed ? "✓" : "~"}</span>
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-auto hidden pt-4 sm:block">
            <span className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-[#0F2742] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-[#F3C982] transition group-hover:bg-[#0C1E35]">
              View Profile
            </span>
          </div>
        </div>
      </Link>

      {modals}
    </>
  );
}
