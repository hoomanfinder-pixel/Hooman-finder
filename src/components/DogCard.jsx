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

function buildLifestyleTags(dog) {
  const tags = [];

  if (dog?.energy_level) tags.push(`${dog.energy_level} energy`);
  if (dog?.size) tags.push(dog.size);
  if (dog?.good_with_kids === true) tags.push("Kids");
  if (dog?.good_with_dogs === true) tags.push("Dogs");
  if (dog?.good_with_cats === true) tags.push("Cats");
  if (dog?.potty_trained === true) tags.push("Potty trained");
  if (dog?.hypoallergenic === true) tags.push("Hypoallergenic");
  if (dog?.first_time_friendly === true) tags.push("First-time friendly");

  return tags.slice(0, 3);
}

export default function DogCard({
  dog,
  scorePct = null,
  breakdown = null,
  showMatch = false,
  sessionId = null,
}) {
  const [openModal, setOpenModal] = useState(false);
  const [showHover, setShowHover] = useState(false);
  const [hoverPos, setHoverPos] = useState({ left: 0, top: 0 });
  const [saved, setSaved] = useState(() => isSavedId(dog?.id));

  const whyBtnRef = useRef(null);
  const hoverPanelRef = useRef(null);
  const closeTimer = useRef(null);

  const shelter = dog?.shelters || {};
  const urgency = dog?.urgency_level || "Standard";
  const applyLink = displayApplyLink(dog);
  const imgSrc = dog?.photo_url || dog?.image_url || dog?.photo || "";

  const tier = useMemo(() => (showMatch ? matchTier(scorePct) : null), [showMatch, scorePct]);
  const topReasons = useMemo(() => buildTopReasons({ dog, breakdown }), [dog, breakdown]);
  const lifestyleTags = useMemo(() => buildLifestyleTags(dog), [dog]);

  const ageLabel = useMemo(() => {
    const v = formatAge(dog?.age_years);
    return v === "Unknown" ? "" : v;
  }, [dog?.age_years]);

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

  return (
    <>
      <Link
        to={dogLink}
        state={linkState}
        className="group relative block overflow-hidden rounded-[1.65rem] bg-stone-950 shadow-sm ring-1 ring-black/5 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl"
      >
        <div className="relative aspect-[4/5] min-h-[300px] w-full overflow-hidden bg-stone-200 sm:aspect-[3/4]">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={dog?.name || "Dog"}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-stone-200 text-sm font-semibold text-stone-500">
              No photo yet
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/24 to-black/18" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />

          <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {showMatch && tier ? (
                <span
                  className={[
                    "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] shadow-sm backdrop-blur",
                    tier.className,
                  ].join(" ")}
                  title={
                    Number.isFinite(Number(scorePct))
                      ? `${Math.round(scorePct)}% match`
                      : ""
                  }
                >
                  {Number.isFinite(Number(scorePct))
                    ? `${Math.round(scorePct)}%`
                    : tier.label}
                </span>
              ) : null}

              {urgency !== "Standard" ? (
                <span
                  className={[
                    "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] shadow-sm",
                    urgencyStyle(urgency),
                  ].join(" ")}
                >
                  {urgency}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onToggleSaved}
              className={[
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-black shadow-sm backdrop-blur transition",
                saved
                  ? "bg-white text-rose-600"
                  : "bg-black/35 text-white ring-1 ring-white/30 hover:bg-white hover:text-stone-950",
              ].join(" ")}
              aria-label={saved ? "Unsave dog" : "Save dog"}
              title={saved ? "Saved" : "Save"}
            >
              {saved ? "♥" : "♡"}
            </button>
          </div>

          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/62">
                  {shelter?.name || dog?.shelter_name || "Rescue dog"}
                </p>

                <h2 className="truncate text-3xl font-semibold leading-none tracking-[-0.055em] text-white drop-shadow-sm">
                  {dog?.name || "Unnamed"}
                </h2>

                <p className="mt-2 truncate text-sm font-medium text-white/82">
                  {dog?.breed || "Mixed breed"}
                  {ageLabel ? ` • ${ageLabel}` : ""}
                </p>
              </div>

              <div className="hidden shrink-0 text-right sm:block">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
                  Location
                </p>
                <p className="mt-1 max-w-[120px] truncate text-xs font-semibold text-white/85">
                  {displayLocation(dog)}
                </p>
              </div>
            </div>

            {lifestyleTags.length > 0 ? (
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
            ) : null}

            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <span className="inline-flex items-center justify-center bg-white px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-stone-950 transition group-hover:bg-stone-100">
                View profile
              </span>

              {showMatch ? (
                <button
                  ref={whyBtnRef}
                  type="button"
                  onClick={openFromClick}
                  onMouseEnter={openHover}
                  onMouseLeave={scheduleCloseHover}
                  onFocus={openHover}
                  onBlur={scheduleCloseHover}
                  className="inline-flex items-center justify-center border border-white/45 bg-white/10 px-3 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white backdrop-blur transition hover:bg-white hover:text-stone-950"
                >
                  Why
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onApplyClick}
                  disabled={!applyLink}
                  className={[
                    "inline-flex items-center justify-center border px-3 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] backdrop-blur transition",
                    applyLink
                      ? "border-white/45 bg-white/10 text-white hover:bg-white hover:text-stone-950"
                      : "cursor-not-allowed border-white/15 bg-white/5 text-white/35",
                  ].join(" ")}
                >
                  Apply
                </button>
              )}
            </div>

            {showMatch ? (
              <button
                type="button"
                onClick={onApplyClick}
                disabled={!applyLink}
                className={[
                  "mt-2 inline-flex w-full items-center justify-center border px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] backdrop-blur transition",
                  applyLink
                    ? "border-white/35 bg-black/20 text-white hover:bg-white hover:text-stone-950"
                    : "cursor-not-allowed border-white/15 bg-white/5 text-white/35",
                ].join(" ")}
              >
                {applyLink ? "Apply through rescue" : "Application unavailable"}
              </button>
            ) : null}
          </div>
        </div>
      </Link>

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

            <div className="mt-5 border border-stone-950/10 bg-white p-4">
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
                className="bg-stone-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-stone-800"
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
}