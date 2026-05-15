// src/components/DogCard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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

function matchTier(scorePct) {
  const n = Number(scorePct);
  if (!Number.isFinite(n)) return null;
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

function buildTopReasons({ dog, breakdown }) {
  const pretty = {
    play: "play style",
    energy: "energy level",
    size: "size",
    age: "age",
    potty: "potty training",
    kids: "kids compatibility",
    cats: "cats compatibility",
    pets: "pets compatibility",
    dogs: "dogs compatibility",
    firstTime: "first-time owner friendly",
    allergy: "allergies / hypoallergenic",
    shedding: "shedding",
    noise: "barking / noise",
    alone: "alone time",
    yard: "yard / outdoor access",
    stairs: "stairs",
    budget: "budget fit",
    medical: "medical needs",
    meds: "medication comfort",
    reactivity: "reactivity comfort",
    training: "training commitment",
    behavior: "behavior tolerance",
  };

  const EXCLUDE = new Set([
    "ScorePct",
    "scorePct",
    "activePct",
    "matchPct",
    "score",
    "total",
    "totalScore",
    "points",
    "weighted",
    "weightedScore",
  ]);

  const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);

  if (isPlainObject(breakdown)) {
    const top = Object.entries(breakdown)
      .map(([k, v]) => [k, Number(v)])
      .filter(([k, v]) => !EXCLUDE.has(k) && Number.isFinite(v) && v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => pretty[k] || k);

    if (top.length) return top;
  }

  const reasons = [];

  if (dog?.size) reasons.push("size");
  if (dog?.energy_level) reasons.push("energy level");
  if (dog?.age_years !== null && dog?.age_years !== undefined) reasons.push("age");
  if (dog?.good_with_kids === true) reasons.push("good with kids");
  if (dog?.good_with_dogs === true) reasons.push("good with other dogs");
  if (dog?.good_with_cats === true) reasons.push("good with cats");
  if (dog?.potty_trained === true) reasons.push("potty trained");
  if (dog?.hypoallergenic === true) reasons.push("hypoallergenic");

  return reasons.length ? reasons.slice(0, 3) : ["overall fit"];
}

function computePopoverPosition(anchorRect, popoverSize, gap = 10) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = anchorRect.left;
  let top = anchorRect.bottom + gap;

  if (left + popoverSize.width > vw - 12) {
    left = Math.max(12, vw - popoverSize.width - 12);
  }

  if (top + popoverSize.height > vh - 12) {
    top = anchorRect.top - popoverSize.height - gap;
  }

  left = Math.max(12, Math.min(left, vw - popoverSize.width - 12));
  top = Math.max(12, Math.min(top, vh - popoverSize.height - 12));

  return { left, top };
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
  const [showHover, setShowHover] = useState(false);
  const [hoverPos, setHoverPos] = useState({ left: 0, top: 0 });
  const [saved, setSaved] = useState(() => isSavedId(dog?.id));

  const whyBtnRef = useRef(null);
  const hoverPanelRef = useRef(null);
  const closeTimer = useRef(null);

  const urgency = dog?.urgency_level || "Standard";
  const applyLink = displayApplyLink(dog);
  const imgSrc = dog?.photo_url || dog?.image_url || dog?.photo || "";
  const cardVariant = showMatch ? "match" : variant;

  const tier = useMemo(() => (showMatch ? matchTier(scorePct) : null), [showMatch, scorePct]);
  const topReasons = useMemo(() => buildTopReasons({ dog, breakdown }), [dog, breakdown]);

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

  useEffect(() => {
    if (!showHover) return;

    const anchor = whyBtnRef.current;
    const pop = hoverPanelRef.current;
    if (!anchor || !pop) return;

    const updatePosition = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const popRect = pop.getBoundingClientRect();

      setHoverPos(
        computePopoverPosition(
          anchorRect,
          { width: popRect.width, height: popRect.height },
          10
        )
      );
    };

    updatePosition();

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showHover]);

  function clearCloseTimer() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openHover() {
    clearCloseTimer();
    setShowHover(true);
  }

  function scheduleCloseHover() {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setShowHover(false), 120);
  }

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
      {showMatch &&
        showHover &&
        createPortal(
          <div
            ref={hoverPanelRef}
            className="fixed z-[9999] w-72 rounded-2xl border border-stone-200 bg-white p-4 shadow-xl"
            style={{ left: hoverPos.left, top: hoverPos.top }}
            onMouseEnter={openHover}
            onMouseLeave={scheduleCloseHover}
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
              Top reasons
            </div>

            {Number.isFinite(Number(scorePct)) ? (
              <div className="mt-1 text-lg font-black text-stone-950">
                {Math.round(scorePct)}% match
              </div>
            ) : null}

            <ul className="mt-3 list-disc pl-5 text-sm leading-6 text-stone-700">
              {topReasons.length ? (
                topReasons.map((reason) => (
                  <li key={reason} className="capitalize">
                    {reason}
                  </li>
                ))
              ) : (
                <li>overall fit</li>
              )}
            </ul>

            <div className="mt-3 text-xs leading-5 text-stone-500">
              Based on your quiz + what the shelter has observed so far.
            </div>
          </div>,
          document.body
        )}

      {openModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
          onMouseDown={closeModal}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-[#f4f1ea] p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-stone-500">
                  Why this match
                </div>

                <div className="mt-2 text-3xl font-semibold leading-none tracking-[-0.04em] text-stone-950">
                  {dog?.name || "This dog"}
                </div>

                {Number.isFinite(Number(scorePct)) ? (
                  <div className="mt-2 text-sm font-semibold text-stone-600">
                    {Math.round(scorePct)}% match
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="rounded-full bg-white px-3 py-1.5 text-stone-500 shadow-sm hover:bg-stone-100"
                onClick={closeModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-stone-950/10 bg-white p-4">
              <div className="text-sm font-black text-stone-950">Top reasons</div>

              <ul className="mt-3 list-disc pl-5 text-sm leading-6 text-stone-700">
                {topReasons.length ? (
                  topReasons.map((reason) => (
                    <li key={reason} className="capitalize">
                      {reason}
                    </li>
                  ))
                ) : (
                  <li>overall fit</li>
                )}
              </ul>

              <div className="mt-4 text-xs leading-5 text-stone-500">
                These reasons are based on your quiz + what the shelter has observed so far.
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="rounded-full bg-stone-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-stone-800"
                onClick={closeModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
                {rank === 1 ? (
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
                    title={
                      Number.isFinite(Number(scorePct))
                        ? `${Math.round(scorePct)}% match`
                        : ""
                    }
                  >
                    {Number.isFinite(Number(scorePct))
                      ? `${Math.round(scorePct)}% match`
                      : tier.label}
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

            {Number.isFinite(Number(scorePct)) ? (
              <div className="absolute right-4 top-16 hidden h-14 w-14 items-center justify-center rounded-full border border-[#dfe7d7]/70 bg-black/35 text-center text-[#dfe7d7] backdrop-blur sm:flex">
                <div>
                  <div className="text-base font-black leading-none">{Math.round(scorePct)}%</div>
                  <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em]">Match</div>
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
                  ref={whyBtnRef}
                  type="button"
                  onClick={openFromClick}
                  onMouseEnter={openHover}
                  onMouseLeave={scheduleCloseHover}
                  onFocus={openHover}
                  onBlur={scheduleCloseHover}
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