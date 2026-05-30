// src/lib/quizStorage.js
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

const LOCAL_STORAGE_PREFIX = "hoomanFinder.quizResponses.v1";
const CREATED_STORAGE_PREFIX = "hoomanFinder.quizResponsesCreated.v1";
const sessionClients = new Map();

const REMOTE_QUIZ_COLUMNS = new Set([
  "size_preference",
  "age_preference",
  "kids_in_home",
  "kids_age_band",
  "pets_in_home",
  "potty_requirement",
  "separation_anxiety_willingness",
  "dog_social_preference",
  "first_time_owner",
  "housing_type",
  "landlord_restrictions",
  "crate_ok",
  "training_commitment_level",
  "reactivity_comfort",
  "behavior_tolerance",
  "noise_preference",
  "daily_walk_minutes",
  "weekend_activity_style",
  "energy_preference",
  "play_styles",
  "yard",
  "stairs",
  "alone_time",
  "allergy_sensitivity",
  "shedding_preference",
  "monthly_pet_budget_range",
  "medical_needs_ok",
  "medication_comfort",
  "extra_answers",
]);

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

function readJson(key, fallback) {
  if (!canUseLocalStorage()) return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local persistence is best-effort; Supabase save errors are still surfaced.
  }
}

function hasCreatedRemoteRow(sessionId) {
  if (!canUseLocalStorage()) return false;
  return window.localStorage.getItem(storageKey(CREATED_STORAGE_PREFIX, sessionId)) === "true";
}

function markCreatedRemoteRow(sessionId) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(storageKey(CREATED_STORAGE_PREFIX, sessionId), "true");
}

function clientForSession(sessionId) {
  if (sessionClients.has(sessionId)) return sessionClients.get(sessionId);

  const client = createClient(url, anon, {
    global: {
      headers: {
        "x-session-id": sessionId,
      },
    },
  });

  sessionClients.set(sessionId, client);
  return client;
}

function normalizeQuizPatch(patch) {
  const safePatch = { ...(patch || {}) };

  // Ensure array columns stay arrays (text[])
  if ("size_preference" in safePatch) safePatch.size_preference = cleanArray(safePatch.size_preference);
  if ("age_preference" in safePatch) safePatch.age_preference = cleanArray(safePatch.age_preference);
  if ("play_styles" in safePatch) safePatch.play_styles = cleanArray(safePatch.play_styles);
  if ("pets_in_home" in safePatch) safePatch.pets_in_home = cleanArray(safePatch.pets_in_home);
  if ("behavior_tolerance" in safePatch) safePatch.behavior_tolerance = cleanArray(safePatch.behavior_tolerance);
  if ("shedding_levels" in safePatch) safePatch.shedding_levels = cleanArray(safePatch.shedding_levels);

  // The table has extra_answers NOT NULL.
  if (!("extra_answers" in safePatch) || safePatch.extra_answers == null) {
    safePatch.extra_answers = {};
  }

  return safePatch;
}

function toRemotePayload(sessionId, answersById) {
  const safeAnswers = normalizeQuizPatch(answersById);
  const payload = {
    session_id: sessionId,
  };
  const extraAnswers =
    safeAnswers.extra_answers && typeof safeAnswers.extra_answers === "object"
      ? { ...safeAnswers.extra_answers }
      : {};

  for (const [key, value] of Object.entries(safeAnswers)) {
    if (key === "extra_answers") continue;

    if (REMOTE_QUIZ_COLUMNS.has(key)) {
      payload[key] = value;
    } else {
      extraAnswers[key] = value;
    }
  }

  payload.extra_answers = extraAnswers;
  return payload;
}

function isDuplicateInsert(error) {
  return error?.code === "23505" || /duplicate key/i.test(error?.message || "");
}

async function insertQuizResponses(sessionId, payload) {
  const { error } = await clientForSession(sessionId)
    .from("quiz_responses")
    .insert(payload);

  if (error) throw error;
  markCreatedRemoteRow(sessionId);
}

async function updateQuizResponses(sessionId, payload) {
  const { error } = await clientForSession(sessionId)
    .from("quiz_responses")
    .update(payload)
    .eq("session_id", sessionId);

  if (error) throw error;
}

/**
 * Loads quiz answers from browser storage only.
 *
 * The public client intentionally does not SELECT from quiz_responses. Quiz
 * answers can be sensitive, and RLS should keep public SELECT unavailable.
 */
export async function loadQuizResponses(sessionId) {
  if (!sessionId) throw new Error("Missing session id");

  const answersById = readJson(storageKey(LOCAL_STORAGE_PREFIX, sessionId), {});
  return { answersById: answersById || {}, row: null };
}

/**
 * Saves quiz answers locally, then writes them to Supabase without returning
 * rows. First save inserts; later saves update by session_id.
 */
export async function saveQuizResponses(sessionId, patch) {
  if (!sessionId) throw new Error("Missing session id");

  const safePatch = normalizeQuizPatch(patch);
  writeJson(storageKey(LOCAL_STORAGE_PREFIX, sessionId), safePatch);

  const payload = toRemotePayload(sessionId, safePatch);

  if (!hasCreatedRemoteRow(sessionId)) {
    try {
      await insertQuizResponses(sessionId, payload);
      return { answersById: safePatch };
    } catch (error) {
      if (!isDuplicateInsert(error)) throw error;
      markCreatedRemoteRow(sessionId);
    }
  }

  await updateQuizResponses(sessionId, payload);
  return { answersById: safePatch };
}
