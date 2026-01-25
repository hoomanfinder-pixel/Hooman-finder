// src/components/DogCard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";

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
  } catch {
    // ignore
  }
}

function isSavedId(id) {
  const ids = readSavedIds();
  return ids.includes(String(id));
}

function toggleSavedId(id) {
  const sid = String(id);
  const ids = readSavedIds();
  const next = ids.includes(sid) ? ids.filter((x) => x !== sid) : [sid, ...ids];
  writeSavedIds(next);
  return next.includes(sid);
}

function formatAge(ageYears) {
  const n = Number(ageYears);
  if (!Number.isFinite(n)) return "";
  return `${n} yrs`;
}

function matchTier(scorePct) {
  const n = Number(scorePct);
  if (!Number.isFinite(n)) return null;

  // Strong match now teal (not black, not red)
  if (n >= 85) return { label: "Strong match", pillClass: "bg-teal-700 text-white" };
  if (n >= 70) return { label: "Good match", pillClass: "bg-indigo-600 text-white" };
  return { label: "Potential match", pillClass: "bg-slate-600 text-white" };
}

function buildTopReasons({ dog, breakdown }) {
  // Prefer breakdown if we have it
  if (breakdown && typeof breakdown === "object") {
    const pretty = {
      play: "play style",
      energy: "energy",
      size: "size",
      age: "age",
      potty: "potty training",
      kids: "kids",
      cats: "cats",
      firstTime: "first-time owner",
      allergy: "allergies",
      shedding: "shedding",
      pets: "pets",
      noise: "noise",
      alone: "alone time",
    };

    const top = Object.entries(breakdown)
      .filter(([, v]) => Number(v) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 3)
      .map(([k]) => pretty[k] || k);

    if (top.length) return top;
  }

  // Fallback if no breakdown
  const reasons = [];
  if (dog?.size) reasons.push("size");
  if (dog?.energy_level) reasons.push("energy");
  if (dog?.age_years !== null && dog?.age_years !== undefined) reasons.push("age");
  return reasons.slice(0, 3);
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

export default function DogCard({
  dog,
  scorePct = null,
  breakdown = null,
  showMatch = false,
  sessionId = null,
}) {
  const [openModal, setOpenModal] = useState(false); // click modal
  const [showHover, setShowHover] = useState(false); // hover popover
  const [hoverPos, setHoverPos] = useState({ left: 0, top: 0 });

  const [saved, setSaved] = useState(() => isSavedId(dog?.id));

  const whyBtnRef = useRef(null);
  const hoverPanelRef = useRef(null);

  const tier = useMemo(() => (showMatch ? matchTier(scorePct) : null), [showMatch, scorePct]);
  const topReasons = useMemo(() => buildTopReasons({ dog, breakdown }), [dog, breakdown]);

  const ageLabel = useMemo(() => formatAge(dog?.age_years), [dog]);
  const imgSrc = dog?.photo_url || dog?.image_url || dog?.photo || "";

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

    const anchorRect = anchor.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    setHoverPos(
      computePopoverPosition(anchorRect, { width: popRect.width, height: popRect.height }, 10)
    );

    const onScrollOrResize = () => {
      const a = anchor.getBoundingClientRect();
      const p = pop.getBoundingClientRect();
      setHoverPos(computePopoverPosition(a, { width: p.width, height: p.height }, 10));
    };

    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [showHover]);

  const closeTimer = useRef(null);
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

  // ✅ Build link that ALWAYS includes session when we have it (so refresh/new tab still works)
  const dogLink = useMemo(() => {
    const base = `/dog/${dog?.id}`;
    const search = sessionId ? `?session=${encodeURIComponent(sessionId)}` : "";
    return `${base}${search}`;
  }, [dog?.id, sessionId]);

  // ✅ Pass match info through router state for instant render (no extra fetch needed)
  const linkState = useMemo(() => {
    if (!showMatch) return null;
    return {
      fromQuiz: true,
      sessionId: sessionId || null,
      match: {
        scorePct,
        breakdown,
      },
    };
  }, [showMatch, sessionId, scorePct, breakdown]);

  return (
    <>
      <Link
        to={dogLink}
        state={linkState}
        className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
      >
        {/* Image */}
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

          {/* Save button */}
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

          {/* Match pill */}
          {showMatch && tier && (
            <div className="absolute left-3 top-3 flex items-center gap-2">
              <span
                className={[
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow-sm",
                  tier.pillClass,
                ].join(" ")}
                title={Number.isFinite(Number(scorePct)) ? `${Math.round(scorePct)}% match` : ""}
              >
                {tier.label}
              </span>
            </div>
          )}

          {/* Adoptable badge */}
          <div className="absolute right-3 top-3">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-100 shadow-sm">
              Adoptable
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
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
            </div>

            {/* Why matched */}
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
        </div>
      </Link>

      {/* Hover popover */}
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
                <li>general fit</li>
              )}
            </ul>

            <div className="mt-3 text-xs text-slate-500">
              Based on your quiz + what the shelter has observed so far.
            </div>
          </div>,
          document.body
        )}

      {/* Click modal */}
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
                  <li>general fit</li>
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
