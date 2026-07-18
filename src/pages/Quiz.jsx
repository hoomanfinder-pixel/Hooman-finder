// src/pages/Quiz.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import AccordionSection from "../components/AccordionSection";
import SEO from "../components/SEO";
import QuestionCard from "../components/QuestionCard";
import {
  QUIZ_MODES,
  getQuestionsForMode,
  getCompletionCounts,
} from "../lib/quizQuestions";
import {
  getActiveQuizSessionId,
  loadQuizResponses,
  saveQuizResponses,
  setActiveQuizSessionId,
} from "../lib/quizStorage";

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
  if (!hasAnswer(value)) return "NOT ANSWERED";

  const values = Array.isArray(value) ? value.map(String) : [String(value)];
  const options = Array.isArray(question?.options) ? question.options : [];

  const labels = values
    .map((v) => options.find((opt) => String(opt.value) === String(v))?.label)
    .filter(Boolean);

  if (labels.length === 0) return Array.isArray(value) ? `${value.length} SELECTED` : "ANSWERED";
  if (labels.length === 1) return labels[0];
  return `${labels.length} SELECTED`;
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
  const sessionId = useMemo(
    () => ensureSessionId(sessionFromUrl || getActiveQuizSessionId()),
    [sessionFromUrl]
  );

  const [answersById, setAnswersById] = useState({});
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState("");
  const [openRefineSection, setOpenRefineSection] = useState(REFINE_SECTIONS[0]);
  const quizTopRef = useRef(null);
  const refineSectionRefs = useRef({});
  const didMountModeRef = useRef(false);

  const questions = useMemo(() => getQuestionsForMode(mode, answersById), [mode, answersById]);
  const completion = useMemo(() => getCompletionCounts(mode, answersById), [mode, answersById]);

  useEffect(() => {
    setActiveQuizSessionId(sessionId);

    if (!sessionFromUrl || sessionFromUrl !== sessionId) {
      const next = new URLSearchParams(searchParams);
      next.set("session", sessionId);
      next.set("mode", mode);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, mode]);

  function scrollToElement(element) {
    if (!element || typeof element.scrollIntoView !== "function") return;
    window.requestAnimationFrame(() => {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function scrollToQuizTop() {
    scrollToElement(quizTopRef.current);
  }

  useEffect(() => {
    if (mode === QUIZ_MODES.REFINE) setOpenRefineSection(REFINE_SECTIONS[0]);

    if (didMountModeRef.current) {
      scrollToQuizTop();
    } else {
      didMountModeRef.current = true;
    }
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

  function saveAndSeeMatches() {
    goResults();
  }

  function toggleRefineSection(groupTitle, isOpen) {
    if (isOpen) {
      setOpenRefineSection("");
      return;
    }

    setOpenRefineSection(groupTitle);
    scrollToElement(refineSectionRefs.current[groupTitle] || quizTopRef.current);
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

  const segments = Array.from({ length: Math.max(completion.total || 1, 1) });

  const pageTitle =
    mode === QUIZ_MODES.DEALBREAKERS ? "Start your match" : "Refine matches";

  const pageSubtitle =
    mode === QUIZ_MODES.DEALBREAKERS
      ? "Start this lifestyle-based dog adoption quiz with the home, routine, and experience details that matter most."
      : "Fine-tune how Hooman Finder ranks adoptable dogs using your lifestyle and care preferences.";

  return (
    <div className="min-h-screen bg-[#f5f1e9] font-['Inter',sans-serif] text-[#183D35]">
      <SEO
        title="Dog Adoption Matching Quiz | Hooman Finder"
        description="Take Hooman Finder's dog adoption matching quiz to compare adoptable shelter and rescue dogs by home, routine, lifestyle fit, energy, and care preferences."
        canonicalPath="/quiz"
        ogImage="/home-hero-dogs.jpg"
        ogImageAlt="Shelter and rescue dogs looking for a good lifestyle match"
        noindex={Boolean(sessionFromUrl)}
      />
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-3 pb-32 pt-1.5 sm:px-5 sm:pb-32 sm:pt-3">
        <header className="sticky top-0 z-30 -mx-3 border-b border-[#183D35]/10 bg-[#f5f1e9]/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5">
          <div className="flex items-center justify-between gap-2.5">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-black text-[#183D35] hover:opacity-75 sm:text-sm"
              onClick={() => navigate("/dogs")}
            >
              ← Back to dogs
            </button>

            <div className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-right text-[10px] font-black uppercase tracking-[0.12em] text-[#183D35] ring-1 ring-[#183D35]/8">
              {completion.answered}/{completion.total} answered
            </div>
          </div>

          <div className="mt-2 flex gap-1 overflow-hidden">
            {segments.map((_, idx) => (
              <div
                key={idx}
                className={[
                  "h-1 min-w-0 flex-1 rounded-full transition",
                  idx < completion.answered ? "bg-[#183D35]" : "bg-[#183D35]/12",
                ].join(" ")}
              />
            ))}
          </div>
        </header>

        <main className="flex-1">
          <section ref={quizTopRef} className="scroll-mt-20 py-2.5 sm:scroll-mt-24 sm:py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[9px] font-extrabold uppercase tracking-[0.26em] text-[#183D35]/55 sm:text-[10px]">
                  Hooman Finder Quiz
                </p>

                <h1 className="mt-1 font-['Fraunces',serif] text-[2rem] font-semibold leading-[1.05] text-[#183D35] sm:text-5xl">
                  {pageTitle}
                </h1>

                <p className="mt-1.5 max-w-xl text-xs font-semibold leading-5 text-[#6f6a66] sm:text-sm">
                  {pageSubtitle}
                </p>
              </div>
            </div>

            {saveError ? (
              <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {saveError}
              </div>
            ) : null}
          </section>

          {loading ? (
            <div className="rounded-[1.35rem] border border-[#183D35]/10 bg-white/70 p-4 text-sm font-semibold text-[#183D35]/70">
              Loading…
            </div>
          ) : mode === QUIZ_MODES.DEALBREAKERS ? (
            <section className="space-y-2">
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
            <section className="space-y-2">
              {refineGroups.map((group) => {
                const isOpen = openRefineSection === group.title;
                const answeredCount = getAnsweredCountForQuestions(group.questions, answersById);
                const totalCount = group.questions.length;

                return (
                  <div
                    key={group.title}
                    ref={(element) => {
                      if (element) refineSectionRefs.current[group.title] = element;
                    }}
                    className="scroll-mt-20 sm:scroll-mt-24"
                  >
                    <AccordionSection
                      id={`refine-${group.title.toLowerCase().replaceAll(" ", "-")}`}
                      title={group.title}
                      summary={`${answeredCount}/${totalCount} answered`}
                      status={sectionStatus(answeredCount, totalCount)}
                      isOpen={isOpen}
                      onToggle={() => toggleRefineSection(group.title, isOpen)}
                    >
                      <div className="space-y-2">
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
                  </div>
                );
              })}
            </section>
          )}
        </main>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#183D35]/10 bg-[#f5f1e9]/96 px-3 pb-2.5 pt-2 shadow-2xl backdrop-blur sm:px-5 sm:pb-3">
          <div className="mx-auto max-w-3xl">
            <div className="grid grid-cols-[1fr_1.1fr] gap-2">
              <button
                type="button"
                onClick={saveAndSeeMatches}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#183D35]/18 bg-white px-3 py-2 text-xs font-black text-[#183D35] shadow-sm hover:bg-[#f8f6f1] sm:text-sm"
              >
                See Matches
              </button>

              {mode === QUIZ_MODES.DEALBREAKERS ? (
                <button
                  type="button"
                  onClick={goRefine}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#183D35] px-3 py-2 text-center text-xs font-black leading-snug text-[#F3C982] shadow-sm hover:bg-[#12332C] sm:px-4 sm:text-sm"
                >
                  Deeper questions →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goResults}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#183D35] px-3 py-2 text-xs font-black text-[#F3C982] shadow-sm hover:bg-[#12332C] sm:text-sm"
                >
                  See matches →
                </button>
              )}
            </div>

            <div
              className={[
                "mt-1 flex items-center gap-2 text-[10px] font-semibold text-[#183D35]/55",
                mode === QUIZ_MODES.DEALBREAKERS ? "justify-center" : "justify-between",
              ].join(" ")}
            >
              {mode === QUIZ_MODES.REFINE ? (
                <button
                  type="button"
                  onClick={goDealbreakers}
                  className="underline underline-offset-4 hover:text-[#183D35]"
                >
                  Back to essentials
                </button>
              ) : null}

              <span>You can update these later.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
