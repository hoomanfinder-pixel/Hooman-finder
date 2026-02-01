// src/pages/Quiz.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import QuestionCard from "../components/QuestionCard";
import { QUIZ_MODES, getQuestionsForMode, getCompletionCounts } from "../lib/quizQuestions";
import { loadQuizResponses, saveQuizResponses } from "../lib/quizStorage";

function ensureSessionId(existing) {
  if (existing) return existing;
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return String(Date.now());
}

const REFINE_SECTIONS = [
  "Household & Compatibility",
  "Behavior & Training",
  "Care & Lifestyle",
];

// fallback: if a refine question doesn’t have refineSection set in quizQuestions.js
function fallbackRefineSection(question) {
  const id = String(question?.id || "").toLowerCase();

  // household-ish
  if (id.includes("kids") || id.includes("cats") || id.includes("dogs") || id.includes("pets") || id.includes("first")) {
    return "Household & Compatibility";
  }

  // care/lifestyle-ish (allergies / grooming / shedding / etc)
  if (id.includes("allerg") || id.includes("shed") || id.includes("groom") || id.includes("coat")) {
    return "Care & Lifestyle";
  }

  // otherwise
  return "Behavior & Training";
}

function getAnsweredCountForQuestions(questions, answersById) {
  let answered = 0;
  for (const q of questions) {
    const v = answersById[q.id];
    const has =
      v !== undefined &&
      v !== null &&
      !(Array.isArray(v) && v.length === 0) &&
      !(typeof v === "string" && v.trim() === "");
    if (has) answered += 1;
  }
  return answered;
}

export default function Quiz() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const modeParam = searchParams.get("mode") || QUIZ_MODES.DEALBREAKERS;
  const mode = modeParam === QUIZ_MODES.REFINE ? QUIZ_MODES.REFINE : QUIZ_MODES.DEALBREAKERS;

  const sessionFromUrl = searchParams.get("session");
  const sessionId = useMemo(() => ensureSessionId(sessionFromUrl), [sessionFromUrl]);

  const [answersById, setAnswersById] = useState({});
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState("");

  const questions = useMemo(() => getQuestionsForMode(mode), [mode]);
  const completion = useMemo(() => getCompletionCounts(mode, answersById), [mode, answersById]);

  // ✅ Refine accordion open state (default first section open)
  const [openRefineSection, setOpenRefineSection] = useState(REFINE_SECTIONS[0]);

  // Ensure URL has session
  useEffect(() => {
    if (!sessionFromUrl || sessionFromUrl !== sessionId) {
      const next = new URLSearchParams(searchParams);
      next.set("session", sessionId);
      next.set("mode", mode);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, mode]);

  // When switching into refine, default open first section
  useEffect(() => {
    if (mode === QUIZ_MODES.REFINE) setOpenRefineSection(REFINE_SECTIONS[0]);
  }, [mode]);

  // Load existing
  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        setLoading(true);
        setSaveError("");
        const { answersById: loaded } = await loadQuizResponses(sessionId);
        if (!mounted) return;
        setAnswersById(loaded || {});
      } catch (e) {
        if (!mounted) return;
        setSaveError(e?.message || String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  async function updateAnswer(questionId, nextValue) {
    const nextAnswers = { ...answersById, [questionId]: nextValue };
    setAnswersById(nextAnswers);

    try {
      setSaveError("");
      await saveQuizResponses(sessionId, nextAnswers);
    } catch (e) {
      setSaveError(e?.message || String(e));
    }
  }

  function goRefine() {
    navigate(`/quiz?session=${encodeURIComponent(sessionId)}&mode=${QUIZ_MODES.REFINE}`);
  }

  function goDealbreakers() {
    navigate(`/quiz?session=${encodeURIComponent(sessionId)}&mode=${QUIZ_MODES.DEALBREAKERS}`);
  }

  function goResults() {
    navigate(`/results?session=${encodeURIComponent(sessionId)}`);
  }

  // ✅ group refine questions into exactly 3 sections
  const refineGroups = useMemo(() => {
    if (mode !== QUIZ_MODES.REFINE) return [];

    const byTitle = new Map();
    for (const title of REFINE_SECTIONS) byTitle.set(title, []);

    for (const q of questions) {
      const title = q.refineSection || fallbackRefineSection(q);
      const safeTitle = byTitle.has(title) ? title : REFINE_SECTIONS[1];
      byTitle.get(safeTitle).push(q);
    }

    return REFINE_SECTIONS.map((title) => ({
      title,
      questions: byTitle.get(title) || [],
    }));
  }, [mode, questions]);

  return (
    <div className="min-h-screen bg-[#EAF7F0]">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <button className="text-sm text-gray-600 mb-3" onClick={() => navigate("/dogs")}>
          ← Back to dogs
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">
              {mode === QUIZ_MODES.DEALBREAKERS ? "Deal Breakers" : "Refine matches"}
            </h1>
            <p className="text-gray-600 mt-1">
              {mode === QUIZ_MODES.DEALBREAKERS
                ? "Must-haves only. Answering these improves results the most."
                : "Optional. Answer extra questions to refine ranking (including allergies)."}
            </p>
          </div>

          <div className="text-sm text-gray-600 whitespace-nowrap">
            {completion.answered}/{completion.total} answered • Better matches with more answers
          </div>
        </div>

        <div className="h-2 bg-green-100 rounded mt-4 overflow-hidden">
          <div
            className="h-full bg-green-600"
            style={{
              width: `${
                completion.total ? Math.round((completion.answered / completion.total) * 100) : 0
              }%`,
            }}
          />
        </div>

        {saveError ? <div className="mt-4 text-sm text-red-600">{saveError}</div> : null}

        {loading ? (
          <div className="mt-8 text-gray-600">Loading…</div>
        ) : (
          <div className="mt-8 space-y-6">
            {mode === QUIZ_MODES.DEALBREAKERS ? (
              // ✅ Deal Breakers stays as a simple list
              questions.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  value={answersById[q.id]}
                  onChange={(v) => updateAnswer(q.id, v)}
                />
              ))
            ) : (
              // ✅ Refine becomes 3 accordion sections (one open)
              <div className="space-y-4">
                {refineGroups.map((group) => {
                  const isOpen = openRefineSection === group.title;
                  const answeredCount = getAnsweredCountForQuestions(group.questions, answersById);
                  const totalCount = group.questions.length;

                  return (
                    <div
                      key={group.title}
                      className={[
                        "rounded-2xl border shadow-sm overflow-hidden",
                        isOpen ? "border-slate-800 bg-white" : "border-green-200 bg-green-50",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenRefineSection(isOpen ? "" : group.title)}
                        className="w-full flex items-center justify-between gap-3 px-5 py-4"
                      >
                        <div className="text-left">
                          <div className="text-base font-semibold text-slate-900">{group.title}</div>
                          <div className="mt-1 text-sm text-slate-600">
                            {answeredCount}/{totalCount} answered
                          </div>
                        </div>

                        <div className="text-slate-700 text-lg">{isOpen ? "▾" : "▸"}</div>
                      </button>

                      {isOpen ? (
                        <div className="px-5 pb-5 space-y-6">
                          {group.questions.map((q) => (
                            <QuestionCard
                              key={q.id}
                              question={q}
                              value={answersById[q.id]}
                              onChange={(v) => updateAnswer(q.id, v)}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="mt-10 bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            Answer what you want — more answers = better matches.
            <div className="text-xs text-gray-500 mt-1">
              Tip: Deal Breakers usually improves results the most.
            </div>
          </div>

          <div className="flex items-center gap-2">
            {mode === QUIZ_MODES.DEALBREAKERS ? (
              <button
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-gray-900"
                onClick={goRefine}
              >
                Refine (optional)
              </button>
            ) : (
              <button
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-gray-900"
                onClick={goDealbreakers}
              >
                Back to Deal Breakers
              </button>
            )}

            <button className="px-4 py-2 rounded-xl bg-green-700 text-white" onClick={goResults}>
              See my matches
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
