// src/components/DogCard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { formatAge } from "../utils/formatAge";

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
      className: "bg-white/90 text-stone-950",
    };
  }

  const n = Number(scorePct);

  if (n >= 85) return { label: "Strong match", className: "bg-white text-stone-950" };
  if (n >= 70) return { label: "Good match", className: "bg-white/90 text-stone-950" };
  return { label: "Potential match", className: "bg-white/85 text-stone-950" };
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
      return "bg-white/85 text-stone-950";
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
  const incoming = Array.isArray(breakdown?.topReasons) ? breakdown.topReasons : [];

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
      reasonsTitle: topReasons.length ? "Top reasons" : "What we know",
      reasons: topReasons.length
        ? topReasons
        : buildDogInfoBullets(dog).map((item) => `Available rescue info: ${item}`),
      note: "These reasons are based on your quiz answers and available rescue/shelter info.",
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
  return (
    dog?.shelters?.apply_url ||
    dog?.shelters?.website ||
    dog?.source_url ||
    dog?.shelter_website ||
    ""
  );
}

function displayLocation(dog) {
  if (dog?.shelters?.city && dog?.shelters?.state) {
    return `${dog.shelters.city}, ${dog.shelters.state}`;
  }

  if (dog?.placement_location) return dog.placement_location;

  if (dog?.placement_city && dog?.placement_state) {
    return `${dog.placement_city}, ${dog.placement_state}`;
  }

  return "Apply through rescue";
}

function shelterName(dog) {
  return dog?.shelters?.name || dog?.shelter_name || "Shelter or rescue";
}

function displayBreed(dog) {
  return dog?.breed || "Mixed breed";
}

function buildDescription(dog) {
  const raw =
    dog?.description ||
    dog?.bio ||
    dog?.placement_note ||
    dog?.notes ||
    "";

  const clean = String(raw).replace(/\s+/g, " ").trim();

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

function PlaceholderPhoto({ name }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#eee8da] to-[#dfe7d7] text-center">
      <div className="text-3xl">🐶</div>
      <div className="mt-2 px-3 text-xs font-bold uppercase tracking-[0.14em] text-stone-500">
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

  const urgency = dog?.urgency_level || "Standard";
  const applyLink = displayApplyLink(dog);
  const imgSrc = dog?.photo_url || dog?.image_url || dog?.photo || "";
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
    const formatted = formatAge(dog?.age_years);
    if (formatted && formatted !== "Unknown") return formatted;
    if (dog?.age_text) return dog.age_text;
    return "";
  }, [dog?.age_years, dog?.age_text]);

  const lifestyleTags = useMemo(() => buildLifestyleTags(dog, ageLabel), [dog, ageLabel]);

  const dogLink = useMemo(() => {
    const base = `/dog/${dog?.id}`;
    const search = sessionId ? `?session=${encodeURIComponent(sessionId)}` : "";
    return `${base}${search}`;
  }, [dog?.id, sessionId]);

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
          : "bg-black/35 text-white ring-1 ring-white/30 hover:bg-white hover:text-stone-950",
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
                className="relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-[#f4f1ea] p-5 shadow-2xl ring-1 ring-white/25 sm:max-w-lg sm:p-6"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg font-semibold text-stone-500 shadow-sm ring-1 ring-stone-950/5 hover:bg-stone-100 hover:text-stone-950"
                  onClick={closeModal}
                  aria-label="Close"
                >
                  ×
                </button>

                <div className="pr-12">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-stone-500">
                    {matchState.eyebrow}
                  </div>

                  <h2 className="mt-2 text-[2rem] font-semibold leading-[0.95] tracking-[-0.06em] text-stone-950 sm:text-4xl">
                    {matchState.headline}
                  </h2>

                  <p className="mt-3 text-sm font-semibold leading-6 text-stone-600">
                    {matchState.subhead}
                  </p>
                </div>

                <div className="mt-5 border-t border-stone-950/10 pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-stone-500">
                      {matchState.reasonsTitle}
                    </div>

                    {matchState.kind === "match" && Number.isFinite(Number(scorePct)) ? (
                      <div className="rounded-full bg-stone-950 px-3 py-1.5 text-xs font-black text-white">
                        {Math.round(Number(scorePct))}%
                      </div>
                    ) : null}
                  </div>

                  <ul className="mt-4 space-y-2.5">
                    {matchState.reasons.map((reason) => (
                      <li
                        key={reason}
                        className="flex gap-2.5 rounded-2xl border border-stone-950/8 bg-white/68 px-3.5 py-3 text-sm font-semibold leading-5 text-stone-750 shadow-sm"
                      >
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dfe7d7] text-[11px] text-stone-950">
                          ✓
                        </span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-4 rounded-2xl bg-white/50 px-4 py-3 text-xs font-medium leading-5 text-stone-500 ring-1 ring-stone-950/5">
                    {matchState.note}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                  <Link
                    to={dogLink}
                    state={linkState}
                    className="inline-flex items-center justify-center rounded-2xl border border-stone-950/15 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-stone-950 hover:bg-stone-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View profile
                  </Link>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl bg-stone-950 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white hover:bg-stone-800"
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
          className="group grid grid-cols-[88px_1fr_auto] items-center gap-3 rounded-[1.35rem] border border-stone-950/10 bg-white/72 p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md sm:grid-cols-[112px_1fr_auto] sm:p-3"
        >
          <div className="relative aspect-square overflow-hidden rounded-[1.05rem] bg-stone-200">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={dog?.name || "Dog"}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                loading="lazy"
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
            <h3 className="truncate text-xl font-semibold leading-none tracking-[-0.04em] text-stone-950">
              {dog?.name || "Unnamed"}
            </h3>

            <p className="mt-1 truncate text-[11px] font-semibold text-stone-500">
              {shelterName(dog)}
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {(ageLabel ? [ageLabel, displayBreed(dog), dog?.size] : [displayBreed(dog), dog?.size])
                .filter(Boolean)
                .slice(0, 3)
                .map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[#f4f1ea] px-2 py-1 text-[10px] font-bold text-stone-600 ring-1 ring-stone-950/5"
                  >
                    {tag}
                  </span>
                ))}
            </div>

            <p className="mt-2 hidden truncate text-xs text-stone-500 sm:block">
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
    return (
      <>
        <Link
          to={dogLink}
          state={linkState}
          className="group relative block overflow-hidden rounded-[1.55rem] bg-stone-950 shadow-sm ring-1 ring-black/10 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl"
        >
          <div className="relative aspect-[4/4.7] min-h-[360px] w-full overflow-hidden bg-stone-200 sm:aspect-[16/13]">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={dog?.name || "Dog"}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                loading="lazy"
              />
            ) : (
              <PlaceholderPhoto name={dog?.name} />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/35 to-black/15" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />

            <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {rank === 1 && matchState.kind === "match" ? (
                  <span className="inline-flex items-center rounded-full bg-[#dfe7d7] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-stone-950 shadow-sm">
                    Top match
                  </span>
                ) : null}

                {showMatch && tier ? (
                  <span
                    className={[
                      "inline-flex items-center rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.14em] shadow-sm backdrop-blur",
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
                      "inline-flex items-center rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.14em] shadow-sm",
                      urgencyStyle(urgency),
                    ].join(" ")}
                  >
                    {urgency}
                  </span>
                ) : null}
              </div>

              {heartButton}
            </div>

            {matchState.showScoreCircle && Number.isFinite(Number(scorePct)) ? (
              <div className="absolute right-4 top-16 hidden h-14 w-14 items-center justify-center rounded-full border border-[#dfe7d7]/70 bg-black/35 text-center text-[#dfe7d7] backdrop-blur sm:flex">
                <div>
                  <div className="text-base font-black leading-none">
                    {Math.round(Number(scorePct))}%
                  </div>
                  <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em]">
                    Match
                  </div>
                </div>
              </div>
            ) : null}

            <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
              <p className="mb-1 truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-white/62">
                {shelterName(dog)}
              </p>

              <h2 className="truncate text-4xl font-semibold leading-none tracking-[-0.06em] text-white drop-shadow-sm">
                {dog?.name || "Unnamed"}
              </h2>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {lifestyleTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-white/14 px-2.5 py-1 text-[10px] font-bold text-white ring-1 ring-white/18 backdrop-blur"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <p className="mt-3 line-clamp-2 text-xs font-medium leading-5 text-white/82 sm:text-sm">
                {buildDescription(dog)}
              </p>

              <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                <span className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-stone-950 transition group-hover:bg-stone-100">
                  View profile
                </span>

                <button
                  type="button"
                  onClick={openFromClick}
                  className="inline-flex items-center justify-center rounded-xl border border-white/45 bg-white/10 px-3 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white backdrop-blur transition hover:bg-white hover:text-stone-950"
                >
                  Why
                </button>
              </div>
            </div>
          </div>
        </Link>

        {modals}
      </>
    );
  }

  return (
    <>
      <Link
        to={dogLink}
        state={linkState}
        className="group relative block overflow-hidden rounded-[1.25rem] bg-stone-950 shadow-sm ring-1 ring-black/10 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl"
      >
        <div className="relative aspect-[3/4] min-h-[210px] w-full overflow-hidden bg-stone-200 sm:min-h-[300px]">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={dog?.name || "Dog"}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
              loading="lazy"
            />
          ) : (
            <PlaceholderPhoto name={dog?.name} />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/24 to-black/10" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent" />

          <div className="absolute left-2.5 right-2.5 top-2.5 flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap gap-1">
              {urgency !== "Standard" ? (
                <span
                  className={[
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] shadow-sm sm:px-2.5 sm:py-1 sm:text-[10px]",
                    urgencyStyle(urgency),
                  ].join(" ")}
                >
                  {urgency}
                </span>
              ) : null}
            </div>

            {heartButton}
          </div>

          <div className="absolute inset-x-0 bottom-0 p-3 text-white sm:p-4">
            <p className="mb-1 truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-white/65 sm:text-[10px]">
              {shelterName(dog)}
            </p>

            <h2 className="truncate text-2xl font-semibold leading-none tracking-[-0.055em] text-white drop-shadow-sm sm:text-3xl">
              {dog?.name || "Unnamed"}
            </h2>

            <div className="mt-2 flex flex-wrap gap-1">
              {lifestyleTags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex max-w-full items-center truncate rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-bold text-white ring-1 ring-white/18 backdrop-blur sm:px-2.5 sm:py-1 sm:text-[10px]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Link>

      {modals}
    </>
  );
}