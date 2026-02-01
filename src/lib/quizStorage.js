// src/lib/quizStorage.js
import { supabase } from "./supabase";

function cleanArray(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v;
  return [v];
}

/**
 * Loads a quiz_responses row for a session.
 * Returns:
 *  - answersById: plain object with keys matching question ids / column names
 *  - row: the raw DB row
 */
export async function loadQuizResponses(sessionId) {
  if (!sessionId) throw new Error("Missing session id");

  const { data, error } = await supabase
    .from("quiz_responses")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return { answersById: {}, row: null };
  }

  // Convert row -> answersById (excluding non-answer bookkeeping)
  const {
    id,
    session_id,
    created_at,
    total_score,
    normalized_score,
    completion_count,
    completion_total,
    completion_pct,
    ...answers
  } = data;

  return { answersById: answers || {}, row: data };
}

/**
 * Saves a partial patch of answers to quiz_responses.
 * ALWAYS writes extra_answers as {} if missing so DB not-null never fails.
 */
export async function saveQuizResponses(sessionId, patch) {
  if (!sessionId) throw new Error("Missing session id");

  const safePatch = { ...(patch || {}) };

  // Ensure array columns stay arrays (text[])
  if ("size_preference" in safePatch) safePatch.size_preference = cleanArray(safePatch.size_preference);
  if ("age_preference" in safePatch) safePatch.age_preference = cleanArray(safePatch.age_preference);
  if ("play_styles" in safePatch) safePatch.play_styles = cleanArray(safePatch.play_styles);
  if ("pets_in_home" in safePatch) safePatch.pets_in_home = cleanArray(safePatch.pets_in_home);
  if ("behavior_tolerance" in safePatch) safePatch.behavior_tolerance = cleanArray(safePatch.behavior_tolerance);
  if ("shedding_levels" in safePatch) safePatch.shedding_levels = cleanArray(safePatch.shedding_levels);

  // ✅ Critical fix: never allow null extra_answers (your table is NOT NULL)
  if (!("extra_answers" in safePatch) || safePatch.extra_answers == null) {
    safePatch.extra_answers = {};
  }

  const payload = {
    session_id: sessionId,
    ...safePatch,
  };

  const { data, error } = await supabase
    .from("quiz_responses")
    .upsert(payload, { onConflict: "session_id" })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
