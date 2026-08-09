// src/lib/quizStorage.js
import { canonicalizeAllergySensitivity } from "./quizQuestions.js";

const SESSION_STORAGE_PREFIX = "hoomanFinder.quizResponses.session.v1";
const LOCAL_STORAGE_PREFIX = "hoomanFinder.quizResponses.local.v1";
const ACTIVE_SESSION_KEY = "hoomanFinderActiveQuizSession";

function cleanArray(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v;
  return [v];
}

function storageKey(prefix, sessionId) {
  return `${prefix}:${sessionId}`;
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function readJsonFrom(storage, key, fallback) {
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonTo(storage, key, value) {
  if (!storage) return;

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Browser persistence is best-effort.
  }
}

function readSessionJson(key, fallback) {
  return readJsonFrom(canUseSessionStorage() ? window.sessionStorage : null, key, fallback);
}

function writeSessionJson(key, value) {
  writeJsonTo(canUseSessionStorage() ? window.sessionStorage : null, key, value);
}

function readLocalJson(key, fallback) {
  return readJsonFrom(canUseLocalStorage() ? window.localStorage : null, key, fallback);
}

function writeLocalJson(key, value) {
  writeJsonTo(canUseLocalStorage() ? window.localStorage : null, key, value);
}

export function getActiveQuizSessionId() {
  try {
    if (canUseSessionStorage()) {
      const sessionValue = window.sessionStorage.getItem(ACTIVE_SESSION_KEY);
      if (sessionValue) return sessionValue;
    }
  } catch {
    // Fall through to same-device recovery.
  }

  try {
    if (canUseLocalStorage()) {
      return window.localStorage.getItem(ACTIVE_SESSION_KEY) || "";
    }
  } catch {
    // Active-session tracking is best-effort.
  }

  return "";
}

export function setActiveQuizSessionId(sessionId) {
  if (!sessionId) return;

  try {
    if (canUseSessionStorage()) {
      window.sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    }
  } catch {
    // Active-session tracking is best-effort.
  }

  try {
    if (canUseLocalStorage()) {
      window.localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    }
  } catch {
    // Same-device session recovery is best-effort.
  }
}

function normalizeQuizPatch(patch) {
  const safePatch = { ...(patch || {}) };
  delete safePatch.kids_age_band;

  if ("allergy_sensitivity" in safePatch) {
    safePatch.allergy_sensitivity = canonicalizeAllergySensitivity(
      safePatch.allergy_sensitivity
    );
  }

  // Ensure array columns stay arrays (text[])
  if ("size_preference" in safePatch) safePatch.size_preference = cleanArray(safePatch.size_preference);
  if ("age_preference" in safePatch) safePatch.age_preference = cleanArray(safePatch.age_preference);
  if ("play_styles" in safePatch) safePatch.play_styles = cleanArray(safePatch.play_styles);
  if ("pets_in_home" in safePatch) safePatch.pets_in_home = cleanArray(safePatch.pets_in_home);
  if ("behavior_tolerance" in safePatch) safePatch.behavior_tolerance = cleanArray(safePatch.behavior_tolerance);
  if ("shedding_levels" in safePatch) safePatch.shedding_levels = cleanArray(safePatch.shedding_levels);

  return safePatch;
}

/**
 * Loads quiz answers from browser storage only. Session storage is preferred,
 * with local storage as the same-device fallback after the tab is closed.
 *
 * Anonymous quiz state never needs to be retrieved from Supabase.
 */
export async function loadQuizResponses(sessionId) {
  if (!sessionId) throw new Error("Missing session id");

  setActiveQuizSessionId(sessionId);

  const sessionAnswers = readSessionJson(storageKey(SESSION_STORAGE_PREFIX, sessionId), null);
  const localAnswers = readLocalJson(storageKey(LOCAL_STORAGE_PREFIX, sessionId), null);
  const answersById = normalizeQuizPatch(sessionAnswers || localAnswers || {});

  if (!sessionAnswers && localAnswers) {
    writeSessionJson(storageKey(SESSION_STORAGE_PREFIX, sessionId), localAnswers);
  }
  return { answersById: answersById || {}, row: null };
}

/**
 * Saves the complete anonymous quiz state to this browser only.
 */
export async function saveQuizResponses(sessionId, patch) {
  if (!sessionId) throw new Error("Missing session id");

  const safePatch = normalizeQuizPatch(patch);
  setActiveQuizSessionId(sessionId);
  writeSessionJson(storageKey(SESSION_STORAGE_PREFIX, sessionId), safePatch);
  writeLocalJson(storageKey(LOCAL_STORAGE_PREFIX, sessionId), safePatch);
  return { answersById: safePatch };
}
