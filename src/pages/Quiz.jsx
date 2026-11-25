// src/pages/Quiz.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import AccordionSection from "../components/AccordionSection";
import SEO from "../components/SEO";
import QuestionCard from "../components/QuestionCard";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";
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
import { trackQuizComplete, trackQuizStart } from "../lib/googleAnalytics";
import { INDEXABLE_ROUTE_SEO } from "../lib/siteSeo";

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

function sectionStatus(answered, total) {
  if (!answered) return "empty";
  if (answered >= total) return "complete";
  return "partial";
}

function reportQuizError(context, error) {
  console.error(`Quiz ${context} failed`, error);
  return "We couldn’t save your quiz right now. Your answers are still saved on this device. Please try again.";
}

export default function Quiz() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const modeParam = searchParams.get("mode") || QUIZ_MODES.DEALBREAKERS;
  const mode = modeParam === QUIZ_MODES.REFINE ? QUIZ_MODES.REFINE : QUIZ_MODES.DEALBREAKERS;
  const isEditing = searchParams.get("edit") === "1";

  const sessionFromUrl = searchParams.get("session");
  const sessionId = useMemo(
    () => ensureSessionId(sessionFromUrl || getActiveQuizSessionId()),
    [sessionFromUrl]
  );

  const [answersById, setAnswersById] = useState({});
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState("");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [openRefineSection, setOpenRefineSection] = useState(REFINE_SECTIONS[0]);
  const prefersReducedMotion = usePrefersReducedMotion();
  const quizTopRef = useRef(null);
  const refineSectionRefs = useRef({});
  const didMountModeRef = useRef(false);

  const questions = useMemo(() => getQuestionsForMode(mode, answersById), [mode, answersById]);
  const completion = useMemo(() => getCompletionCounts(mode, answersById), [mode, answersById]);

  useEffect(() => {
    setActiveQuizSessionId(sessionId);
  }, [sessionId]);

  function scrollToElement(element) {
    if (!element || typeof element.scrollIntoView !== "function") return;
    const activeElement = document.activeElement;
    const userIsTyping =
      activeElement?.matches?.("input, textarea, select, [contenteditable='true']");
    if (userIsTyping) return;

    window.requestAnimationFrame(() => {
      element.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
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
        setSaveError(reportQuizError("load", e));
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
    const isFirstAnswer =
      !Object.values(answersById).some(hasAnswer) &&
      Object.values(nextAnswers).some(hasAnswer);

    setAnswersById(nextAnswers);
    if (isFirstAnswer) trackQuizStart(sessionId);

    // Keep the stable /quiz landing URL indexable until the visitor actually
    // begins a personalized session. From the first answer onward, the URL is
    // session-specific and SEO marks it noindex.
    if (!sessionFromUrl) {
      const next = new URLSearchParams(searchParams);
      next.set("session", sessionId);
      next.set("mode", mode);
      setSearchParams(next, { replace: true });
    }

    if (!isEditing) {
      try {
        setSaveError("");
        await saveQuizResponses(sessionId, nextAnswers);
      } catch (e) {
        setSaveError(reportQuizError("save", e));
      }
    }
  }

  function goRefine() {
    const editParam = isEditing ? "&edit=1" : "";
    navigate(`/quiz?session=${encodeURIComponent(sessionId)}&mode=${QUIZ_MODES.REFINE}${editParam}`);
  }

  function goDealbreakers() {
    const editParam = isEditing ? "&edit=1" : "";
    navigate(`/quiz?session=${encodeURIComponent(sessionId)}&mode=${QUIZ_MODES.DEALBREAKERS}${editParam}`);
  }

  function navigateToResults() {
    const essentialCompletion = getCompletionCounts(
      QUIZ_MODES.DEALBREAKERS,
      answersById
    );

    if (
      essentialCompletion.total > 0 &&
      essentialCompletion.answered === essentialCompletion.total
    ) {
      trackQuizComplete(sessionId);
    }

    navigate(`/results?session=${encodeURIComponent(sessionId)}`);
  }

  function saveAndSeeMatches() {
    navigateToResults();
  }

  async function updateMatches() {
    try {
      setSaveError("");
      await saveQuizResponses(sessionId, answersById);
      navigateToResults();
    } catch (e) {
      setSaveError(reportQuizError("save", e));
    }
  }

  function backToResults() {
    navigate(`/results?session=${encodeURIComponent(sessionId)}`);
  }

  function resetAnswers() {
    const nextSessionId = ensureSessionId("");
    const next = new URLSearchParams();

    next.set("session", nextSessionId);
    next.set("mode", QUIZ_MODES.DEALBREAKERS);

    setAnswersById({});
    setSaveError("");
    setResetConfirmOpen(false);
    setOpenRefineSection(REFINE_SECTIONS[0]);
    setActiveQuizSessionId(nextSessionId);
    setSearchParams(next, { replace: true });
    scrollToQuizTop();
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
  const hasAnyAnswers = Object.values(answersById).some(hasAnswer);
  const essentialCompletion = getCompletionCounts(QUIZ_MODES.DEALBREAKERS, answersById);
  const essentialsComplete =
    essentialCompletion.total > 0 &&
    essentialCompletion.answered === essentialCompletion.total;
  const essentialsRemaining = Math.max(
    essentialCompletion.total - essentialCompletion.answered,
    0
  );
  const stageLabel = mode === QUIZ_MODES.DEALBREAKERS ? "Essentials" : "Personalize";
  const stageDescription = mode === QUIZ_MODES.DEALBREAKERS
    ? "Five quick questions that shape your starting matches."
    : "Optional details for your quiz; each question shows whether it affects ranking.";

  const pageTitle =
    isEditing
      ? "Edit your quiz"
      : mode === QUIZ_MODES.DEALBREAKERS
        ? "Start your match"
        : "Refine matches";

  const pageSubtitle =
    isEditing
      ? "Review or change any answer. Your existing matches update only when you choose Update Matches."
      : mode === QUIZ_MODES.DEALBREAKERS
      ? "Start this lifestyle-based dog adoption quiz with the home, routine, and experience details that matter most."
      : "Add lifestyle and care context; each question shows whether it currently affects ranking.";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(223,231,215,0.72),transparent_34rem),#F5F1E9] font-['Inter',sans-serif] text-[#183D35]">
      <SEO
        title={INDEXABLE_ROUTE_SEO["/quiz"].title}
        description={INDEXABLE_ROUTE_SEO["/quiz"].description}
        canonicalPath="/quiz"
        ogImage="/home-hero-dogs.jpg"
        ogImageAlt="Shelter and rescue dogs looking for a good lifestyle match"
        noindex={Boolean(sessionFromUrl) || hasAnyAnswers}
      />
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-12 sm:px-6 sm:pb-16">
        <header className="sticky top-0 z-30 -mx-4 border-b border-[#C7D4BB]/70 bg-[#F5F1E9]/92 px-4 py-2.5 shadow-[0_8px_28px_rgba(24,61,53,0.05)] backdrop-blur-xl sm:-mx-6 sm:px-6 sm:py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Link
                to="/"
                aria-label="Go to Hooman Finder homepage"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#C7D4BB] bg-white p-1.5 shadow-sm sm:h-11 sm:w-11"
              >
                <img
                  src="/logo-180.png"
                  alt="Hooman Finder"
                  width="180"
                  height="163"
                  decoding="async"
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
              </Link>

              <button
                type="button"
                className="inline-flex min-h-10 items-center gap-1 rounded-full px-2 text-xs font-bold text-[#183D35] hover:bg-white/70 sm:px-3 sm:text-sm"
                onClick={isEditing ? backToResults : () => navigate("/dogs")}
              >
                {isEditing ? "← Back to results" : "← Back to dogs"}
              </button>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setResetConfirmOpen(true)}
                disabled={loading || !hasAnyAnswers}
                className="hidden min-h-9 rounded-full px-3 text-xs font-bold text-[#5F5A56] underline decoration-[#183D35]/25 underline-offset-4 hover:bg-white/70 disabled:cursor-not-allowed disabled:no-underline disabled:text-[#8A8681] sm:inline-flex sm:items-center"
              >
                Reset answers
              </button>

              <div className="text-right text-[11px] font-bold text-[#183D35] sm:text-xs">
                {completion.answered}/{completion.total} answered
              </div>
            </div>
          </div>

          {resetConfirmOpen ? (
            <div
              className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[#C7D4BB] bg-white px-3 py-2.5 shadow-lg"
              role="alertdialog"
              aria-label="Confirm reset answers"
            >
              <p className="text-xs font-bold text-[#183D35]">
                Clear every answer and start over?
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setResetConfirmOpen(false)}
                  className="min-h-9 rounded-full px-3 text-xs font-black text-[#183D35] hover:bg-[#f5f1e9]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={resetAnswers}
                  className="min-h-9 rounded-full bg-[#183D35] px-3 text-xs font-black text-[#F3C982] hover:bg-[#12332C]"
                >
                  Reset
                </button>
              </div>
            </div>
          ) : null}

          <div
            className="mt-2.5"
            role="progressbar"
            aria-label={`${stageLabel} quiz progress`}
            aria-valuemin="0"
            aria-valuemax={completion.total}
            aria-valuenow={completion.answered}
            aria-valuetext={`${completion.answered} of ${completion.total} questions answered`}
          >
            <div className="flex gap-1.5 overflow-hidden" aria-hidden="true">
              {segments.map((_, idx) => (
                <div
                  key={idx}
                  className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#183D35]/10"
                >
                  <div
                    className="hf-quiz-progress-fill h-full rounded-full bg-[#183D35]"
                    style={{ width: idx < completion.answered ? "100%" : "0%" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </header>

        <main className="flex-1">
          <section ref={quizTopRef} className="scroll-mt-24 py-4 sm:scroll-mt-28 sm:py-6">
            <div className="overflow-hidden rounded-[1.65rem] bg-[#183D35] px-5 py-5 text-[#F5F1E9] shadow-[0_18px_44px_rgba(24,61,53,0.14)] sm:px-8 sm:py-6">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F3C982] sm:text-xs">
                  {stageLabel} · {mode === QUIZ_MODES.DEALBREAKERS ? "Step 1 of 2" : "Step 2 of 2"}
                </p>

                <h1 className="mt-1.5 max-w-2xl font-['Fraunces',serif] text-[1.8rem] font-semibold leading-[1.04] sm:text-[2.65rem]">
                  {isEditing
                    ? pageTitle
                    : mode === QUIZ_MODES.DEALBREAKERS
                    ? "Find an adoptable dog that fits your lifestyle"
                    : pageTitle}
                </h1>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm leading-5 text-white/70">
                  <p>{isEditing ? pageSubtitle : stageDescription}</p>
                  <div className="flex items-center gap-2">
                    {!isEditing ? (
                      <span className="inline-flex items-center gap-1 text-xs text-white/55">
                        <span aria-hidden="true">✓</span> Answers save automatically
                      </span>
                    ) : null}
                    {hasAnyAnswers ? (
                      <button
                        type="button"
                        onClick={() => setResetConfirmOpen(true)}
                        className="inline-flex min-h-9 items-center rounded-full px-2 text-xs font-bold text-white/65 underline decoration-white/30 underline-offset-4 hover:bg-white/10 hover:text-white sm:hidden"
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {saveError ? (
              <div role="alert" className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {saveError}
              </div>
            ) : null}

          </section>

          {loading ? (
            <div className="rounded-[1.65rem] border border-[#C7D4BB] bg-white p-5 shadow-sm" role="status">
              <span className="sr-only">Loading quiz answers.</span>
              <div className="hf-skeleton h-5 w-2/5 rounded-full" aria-hidden="true" />
              <div className="hf-skeleton mt-4 h-14 w-full rounded-2xl" aria-hidden="true" />
              <div className="hf-skeleton mt-3 h-14 w-full rounded-2xl" aria-hidden="true" />
            </div>
          ) : mode === QUIZ_MODES.DEALBREAKERS ? (
            <section className="space-y-3 sm:space-y-4" aria-label="Essential matching questions">
              {questions.map((q, index) => (
                <div
                  key={q.id}
                  data-quiz-question={q.id}
                  className="scroll-mt-28 sm:scroll-mt-32"
                >
                  <QuestionCard
                    question={q}
                    value={answersById[q.id]}
                    onChange={(v) => updateAnswer(q.id, v)}
                    number={index + 1}
                  />
                </div>
              ))}

              <section
                className="rounded-[1.5rem] border border-[#C7D4BB] bg-white px-5 py-5 shadow-[0_14px_36px_rgba(24,61,53,0.065)] sm:px-6 sm:py-6"
                aria-label="Essential quiz completion"
                aria-live="polite"
              >
                {essentialsComplete ? (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-['Fraunces',serif] text-xl font-semibold text-[#183D35] sm:text-2xl">
                        Your essentials are complete.
                      </p>
                      <p className="mt-1 text-sm text-[#6F6A66]">
                        View your matches now, or add optional details; scored questions can fine-tune their order.
                      </p>
                    </div>
                    <div className="grid shrink-0 gap-2 sm:flex">
                      <button
                        type="button"
                        onClick={isEditing ? updateMatches : saveAndSeeMatches}
                        className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#183D35] px-5 py-2.5 text-sm font-bold text-[#F3C982] shadow-[0_8px_20px_rgba(24,61,53,0.18)] hover:-translate-y-0.5 hover:bg-[#12332C]"
                      >
                        {isEditing ? "Update Matches" : "See My Matches"}
                      </button>
                      <button
                        type="button"
                        onClick={goRefine}
                        className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#C7D4BB] bg-[#F8F6F1] px-5 py-2.5 text-sm font-bold text-[#183D35] hover:border-[#183D35]/35 hover:bg-white"
                      >
                        Deeper questions →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-[#5F5A56]">
                    <p className="flex items-start gap-2">
                      <span aria-hidden="true" className="mt-px text-[#43614F]">→</span>
                      Answer {essentialsRemaining} more essential {essentialsRemaining === 1 ? "question" : "questions"} to view your matches.
                    </p>
                  </div>
                )}
              </section>
            </section>
          ) : (
            <section className="space-y-3 sm:space-y-4" aria-label="Optional personalization questions">
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
                    className="scroll-mt-28 sm:scroll-mt-32"
                  >
                    <AccordionSection
                      id={`refine-${group.title.toLowerCase().replaceAll(" ", "-")}`}
                      title={group.title}
                      summary={`${answeredCount}/${totalCount} answered`}
                      status={sectionStatus(answeredCount, totalCount)}
                      isOpen={isOpen}
                      onToggle={() => toggleRefineSection(group.title, isOpen)}
                    >
                      <div className="space-y-3 sm:space-y-4">
                        {group.questions.map((q) => (
                          <div key={q.id} data-quiz-question={q.id}>
                            <QuestionCard
                              question={q}
                              value={answersById[q.id]}
                              onChange={(v) => updateAnswer(q.id, v)}
                              number={questions.findIndex((question) => question.id === q.id) + 1}
                            />
                          </div>
                        ))}
                      </div>
                    </AccordionSection>
                  </div>
                );
              })}

              <section className="rounded-[1.5rem] border border-[#C7D4BB] bg-white px-5 py-5 shadow-[0_14px_36px_rgba(24,61,53,0.065)] sm:px-6 sm:py-6" aria-label="Personalization actions">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-['Fraunces',serif] text-xl font-semibold text-[#183D35]">
                      Ready to meet your matches?
                    </p>
                    <p className="mt-1 text-sm text-[#6F6A66]">Optional answers are saved with this quiz.</p>
                  </div>
                  <div className="grid shrink-0 gap-2 sm:flex">
                    <button
                      type="button"
                      onClick={goDealbreakers}
                      className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#C7D4BB] bg-[#F8F6F1] px-5 py-2.5 text-sm font-bold text-[#183D35] hover:border-[#183D35]/35 hover:bg-white"
                    >
                      ← Back to essentials
                    </button>
                    <button
                      type="button"
                      onClick={isEditing ? updateMatches : saveAndSeeMatches}
                      className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#183D35] px-5 py-2.5 text-sm font-bold text-[#F3C982] shadow-[0_8px_20px_rgba(24,61,53,0.18)] hover:-translate-y-0.5 hover:bg-[#12332C]"
                    >
                      {isEditing ? "Update Matches" : "See My Matches"}
                    </button>
                  </div>
                </div>
              </section>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
