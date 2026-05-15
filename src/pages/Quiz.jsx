// src/pages/Quiz.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import AccordionSection from "../components/AccordionSection";
import QuestionCard from "../components/QuestionCard";
import {
  QUIZ_MODES,
  getQuestionsForMode,
  getCompletionCounts,
} from "../lib/quizQuestions";
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

function fallbackRefineSection(question) {
  const id = String(question?.id || "").toLowerCase();

  if (
    id.includes("kids") ||
    id.includes("cats") ||
    id.includes("dogs") ||
    id.includes("pets") ||
    id.includes("first")
  ) {
    return "Household & Compatibility";
  }

  if (id.includes("allerg") || id.includes("shed") || id.includes("groom") || id.includes("coat")) {
    return "Care & Lifestyle";
  }

  return "Behavior & Training";
}

function hasAnswer(value) {
  return (
    value !== undefined &&
    value !== null &&
    !(Array.isArray(value) && value.length === 0) &&
    !(typeof value === "string" && value.trim() === "")
  );
}

function getAnsweredCountForQuestions(questions, answersById) {
  let answered = 0;

  for (const q of questions) {
    if (hasAnswer(answersById[q.id])) answered += 1;
  }

  return answered;
}

function answerSummary(question, value) {
  if (!hasAnswer(value)) return "Not answered";

  const values = Array.isArray(value) ? value.map(String) : [String(value)];
  const options = Array.isArray(question?.options) ? question.options : [];

  const labels = values
    .map((v) => options.find((opt) => String(opt.value) === String(v))?.label)
    .filter(Boolean);

  if (labels.length === 0) return Array.isArray(value) ? `${value.length} selected` : "Answered";
  if (labels.length === 1) return labels[0];
  return `${labels.length} selected`;
}

function sectionStatus(answered, total) {
  if (!answered) return "empty";
  if (answered >= total) return "complete";
  return "partial";
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
  const [openRefineSection, setOpenRefineSection] = useState(REFINE_SECTIONS[0]);

  const questions = useMemo(() => getQuestionsForMode(mode, answersById), [mode, answersById]);
  const completion = useMemo(() => getCompletionCounts(mode, answersById), [mode, answersById]);

  useEffect(() => {
    if (!sessionFromUrl || sessionFromUrl !== sessionId) {
      const next = new URLSearchParams(searchParams);
      next.set("session", sessionId);
      next.set("mode", mode);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, mode]);

  useEffect(() => {
    if (mode === QUIZ_MODES.REFINE) setOpenRefineSection(REFINE_SECTIONS[0]);
  }, [mode]);

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
    let nextAnswers = { ...answersById, [questionId]: nextValue };

    if (questionId === "kids_in_home") {
      const v = (nextValue ?? "").toString().trim().toLowerCase();
      if (v === "no" || v === "") {
        const cleaned = { ...nextAnswers };
        delete cleaned.kids_age_band;
        nextAnswers = cleaned;
      }
    }

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

  function saveAndExit() {
    navigate("/dogs");
  }

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

  const pct = completion.total
    ? Math.round((completion.answered / completion.total) * 100)
    : 0;

  const segments = Array.from({ length: Math.max(completion.total || 1, 1) });

  const pageTitle =
    mode === QUIZ_MODES.DEALBREAKERS ? "Deal Breakers" : "Refine matches";

  const pageSubtitle =
    mode === QUIZ_MODES.DEALBREAKERS
      ? "Start with the must-haves that matter most for your home."
      : "Fine-tune your rankings with extra lifestyle and care preferences.";

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#0f2742]">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-3.5 pb-28 pt-4 sm:px-6 sm:pb-32 sm:pt-6">
        <header className="sticky top-0 z-30 -mx-3.5 border-b border-[#0f2742]/10 bg-[#f4f1ea]/92 px-3.5 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-semibold text-[#0f2742] hover:opacity-75"
              onClick={() => navigate("/dogs")}
            >
              ← Back to dogs
            </button>

            <div className="shrink-0 text-right text-sm font-bold text-[#0f2742]">
              {completion.answered}/{completion.total} answered
            </div>
          </div>

          <div className="mt-3 flex gap-1 overflow-hidden">
            {segments.map((_, idx) => (
              <div
                key={idx}
                className={[
                  "h-1.5 min-w-0 flex-1 rounded-full transition",
                  idx < completion.answered ? "bg-[#0f4f88]" : "bg-[#0f2742]/12",
                ].join(" ")}
              />
            ))}
          </div>
        </header>

        <main className="flex-1">
          <section className="py-5 sm:py-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-[#0f2742]/55">
                  Hooman Finder Quiz
                </p>

                <h1 className="mt-2 text-[2.45rem] font-semibold leading-[0.88] tracking-[-0.06em] text-[#0f2742] sm:text-5xl">
                  {pageTitle}
                </h1>

                <p className="mt-3 max-w-xl text-sm leading-6 text-[#0f2742]/70 sm:text-base">
                  {pageSubtitle}
                </p>
              </div>

              <div className="hidden rounded-3xl bg-[#dfe7d7] px-4 py-3 text-center text-xs font-bold text-[#0f2742] sm:block">
                <div className="text-lg leading-none">{pct}%</div>
                <div className="mt-1 uppercase tracking-[0.14em]">done</div>
              </div>
            </div>

            <div className="mt-4 rounded-[1.35rem] border border-[#0f2742]/10 bg-white/58 p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[#0f2742]/70">
                <span>Progress</span>
                <span>{completion.answered}/{completion.total}</span>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#0f2742]/10">
                <div
                  className="h-full rounded-full bg-[#0f4f88] transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {saveError ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {saveError}
              </div>
            ) : null}
          </section>

          {loading ? (
            <div className="rounded-[1.35rem] border border-[#0f2742]/10 bg-white/60 p-5 text-sm font-semibold text-[#0f2742]/70">
              Loading…
            </div>
          ) : mode === QUIZ_MODES.DEALBREAKERS ? (
            <section className="space-y-3">
              {questions.map((q, index) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  value={answersById[q.id]}
                  onChange={(v) => updateAnswer(q.id, v)}
                  number={index + 1}
                  statusText={answerSummary(q, answersById[q.id])}
                />
              ))}
            </section>
          ) : (
            <section className="space-y-3">
              {refineGroups.map((group) => {
                const isOpen = openRefineSection === group.title;
                const answeredCount = getAnsweredCountForQuestions(group.questions, answersById);
                const totalCount = group.questions.length;

                return (
                  <AccordionSection
                    key={group.title}
                    id={`refine-${group.title.toLowerCase().replaceAll(" ", "-")}`}
                    title={group.title}
                    summary={`${answeredCount}/${totalCount} answered`}
                    status={sectionStatus(answeredCount, totalCount)}
                    isOpen={isOpen}
                    onToggle={() => setOpenRefineSection(isOpen ? "" : group.title)}
                  >
                    <div className="space-y-3">
                      {group.questions.map((q, index) => (
                        <QuestionCard
                          key={q.id}
                          question={q}
                          value={answersById[q.id]}
                          onChange={(v) => updateAnswer(q.id, v)}
                          number={index + 1}
                          statusText={answerSummary(q, answersById[q.id])}
                        />
                      ))}
                    </div>
                  </AccordionSection>
                );
              })}
            </section>
          )}
        </main>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#0f2742]/10 bg-[#f4f1ea]/94 px-3.5 py-3 shadow-[0_-10px_30px_rgba(15,39,66,0.08)] backdrop-blur sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="grid grid-cols-[1fr_1.2fr] gap-2">
              <button
                type="button"
                onClick={saveAndExit}
                className="inline-flex items-center justify-center rounded-2xl border border-[#0f2742]/15 bg-white/80 px-4 py-3 text-sm font-bold text-[#0f2742] shadow-sm hover:bg-white"
              >
                Save & exit
              </button>

              {mode === QUIZ_MODES.DEALBREAKERS ? (
                <button
                  type="button"
                  onClick={goRefine}
                  className="inline-flex items-center justify-center rounded-2xl bg-[#0f4f88] px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#0d416f]"
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goResults}
                  className="inline-flex items-center justify-center rounded-2xl bg-[#0f4f88] px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#0d416f]"
                >
                  See matches →
                </button>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-medium text-[#0f2742]/55">
              <button
                type="button"
                onClick={mode === QUIZ_MODES.DEALBREAKERS ? goResults : goDealbreakers}
                className="underline underline-offset-4 hover:text-[#0f2742]"
              >
                {mode === QUIZ_MODES.DEALBREAKERS
                  ? "Skip to matches"
                  : "Back to Deal Breakers"}
              </button>

              <span>You can update these later.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}