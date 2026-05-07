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
  if (n >= 85) return { label: "Strong match", pillClass: "bg-teal-700 text-white" };
  if (n >= 70) return { label: "Good match", pillClass: "bg-indigo-600 text-white" };
  return { label: "Potential match", pillClass: "bg-slate-600 text-white" };
}

function urgencyStyle(level) {
  switch (level) {
    case "Critical":
      return "bg-red-600 text-white border-red-600";
    case "High":
      return "bg-orange-500 text-white border-orange-500";
    case "Adopted":
      return "bg-emerald-600 text-white border-emerald-600";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
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

  return "Apply through shelter";
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

  const tier = useMemo(() => (showMatch ? matchTier(scorePct) : null), [showMatch, scorePct]);
  const topReasons = useMemo(() => buildTopReasons({ dog, breakdown }), [dog, breakdown]);

  const ageLabel = useMemo(() => {
    const v = formatAge(dog?.age_years);
    return v === "Unknown" ? "" : v;
  }, [dog?.age_years]);

  const imgSrc = dog?.photo_url || dog?.image_url || dog?.photo || "";

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
        computePopoverPosition(anchorRect, { width: popRect.width, height: popRect.height }, 10)
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
        className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
      >
        <div className="relative aspect-[4/3] w-full bg-slate-100">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={dog?.name || "Dog"}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
              No photo
            </div>
          )}

          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {showMatch && tier ? (
              <span
                className={[
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow-sm",
                  tier.pillClass,
                ].join(" ")}
                title={Number.isFinite(Number(scorePct)) ? `${Math.round(scorePct)}% match` : ""}
              >
                {tier.label}
              </span>
            ) : null}

            <span
              className={[
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold shadow-sm",
                urgencyStyle(urgency),
              ].join(" ")}
            >
              {urgency}
            </span>
          </div>

          <div className="absolute right-3 top-3">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-100 shadow-sm">
              Adoptable
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleSaved}
            className={[
              "absolute right-3 bottom-3 inline-flex items-center justify-center rounded-full border px-3 py-2 text-xs font-semibold shadow-sm transition",
              saved
                ? "bg-rose-600 text-white border-rose-600"
                : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50",
            ].join(" ")}
            aria-label={saved ? "Unsave dog" : "Save dog"}
            title={saved ? "Saved" : "Save"}
          >
            {saved ? "♥ Saved" : "♡ Save"}
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-extrabold text-slate-900">{dog?.name || "Unnamed"}</div>

              <div className="mt-1 text-sm text-slate-600">
                {dog?.breed ? <span>{dog.breed}</span> : <span>Mixed breed</span>}
                {ageLabel ? <span> • {ageLabel}</span> : null}
              </div>

              <div className="mt-1 text-sm text-slate-600">
                {dog?.age_years !== null && dog?.age_years !== undefined ? (
                  <span>Age: {formatAge(dog.age_years)}</span>
                ) : null}
                {dog?.size ? <span> • Size: {dog.size}</span> : null}
                {dog?.energy_level ? <span> • Energy: {dog.energy_level}</span> : null}
              </div>

              <div className="mt-4 flex items-center gap-3">
                {shelter?.logo_url ? (
                  <img
                    src={shelter.logo_url}
                    alt={shelter?.name || "Shelter logo"}
                    className="h-9 w-9 rounded-full border border-slate-200 object-cover bg-white"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full border border-slate-200 bg-slate-100" />
                )}

                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {shelter?.name || dog?.shelter_name || "Shelter/Rescue"}
                  </div>
                  <div className="text-xs text-slate-500">{displayLocation(dog)}</div>
                </div>
              </div>
            </div>

            {showMatch && (
              <div className="shrink-0">
                <button
                  ref={whyBtnRef}
                  type="button"
                  onClick={openFromClick}
                  onMouseEnter={openHover}
                  onMouseLeave={scheduleCloseHover}
                  onFocus={openHover}
                  onBlur={scheduleCloseHover}
                  className="inline-flex items-center justify-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50"
                >
                  Why matched?
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onApplyClick}
            disabled={!applyLink}
            className={[
              "mt-5 inline-flex w-full items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition",
              applyLink
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "bg-slate-200 text-slate-500 cursor-not-allowed",
            ].join(" ")}
          >
            {applyLink ? "Apply on shelter site" : "Application link unavailable"}
          </button>
        </div>
      </Link>

      {showMatch &&
        showHover &&
        createPortal(
          <div
            ref={hoverPanelRef}
            className="fixed z-[9999] w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
            style={{ left: hoverPos.left, top: hoverPos.top }}
            onMouseEnter={openHover}
            onMouseLeave={scheduleCloseHover}
          >
            <div className="text-xs font-semibold text-slate-500">Top reasons</div>

            {Number.isFinite(Number(scorePct)) && (
              <div className="mt-1 text-sm font-bold text-slate-900">
                {Math.round(scorePct)}% match
              </div>
            )}

            <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
              {topReasons.length ? (
                topReasons.map((r) => (
                  <li key={r} className="capitalize">
                    {r}
                  </li>
                ))
              ) : (
                <li>overall fit</li>
              )}
            </ul>

            <div className="mt-3 text-xs text-slate-500">
              Based on your quiz + what the shelter has observed so far.
            </div>
          </div>,
          document.body
        )}

      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={closeModal}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-600">Why this match</div>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">
                  {dog?.name || "This dog"}
                </div>
                {Number.isFinite(Number(scorePct)) && (
                  <div className="mt-1 text-sm text-slate-600">{Math.round(scorePct)}% match</div>
                )}
              </div>

              <button
                type="button"
                className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
                onClick={closeModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">Top reasons</div>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                {topReasons.length ? (
                  topReasons.map((r) => (
                    <li key={r} className="capitalize">
                      {r}
                    </li>
                  ))
                ) : (
                  <li>overall fit</li>
                )}
              </ul>
              <div className="mt-3 text-xs text-slate-500">
                These reasons are based on your quiz + what the shelter has observed so far.
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={closeModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}