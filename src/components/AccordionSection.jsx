// src/components/AccordionSection.jsx
import React from "react";

function Badge({ status }) {
  const base = "rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.04em]";

  if (status === "complete") {
    return <span className={`${base} bg-[#DFE7D7] text-[#183D35]`}>✓ Complete</span>;
  }

  if (status === "partial") {
    return <span className={`${base} bg-[#FBF0DC] text-[#704B1F]`}>In progress</span>;
  }

  return <span className={`${base} bg-[#F5F1E9] text-[#5F5A56]`}>Not started</span>;
}

export default function AccordionSection({
  id,
  title,
  summary,
  status,
  isOpen,
  onToggle,
  children,
}) {
  return (
    <section
      id={id}
      className={[
        "overflow-hidden rounded-[1.65rem] border shadow-[0_14px_38px_rgba(24,61,53,0.06)] transition",
        isOpen
          ? "border-[#C7D4BB] bg-white"
          : "border-[#C7D4BB]/75 bg-white/72 hover:border-[#183D35]/25 hover:bg-white",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-4 text-left sm:px-5 sm:py-5"
        aria-expanded={isOpen}
        aria-controls={`${id}-content`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-['Fraunces',serif] text-lg font-semibold text-[#183D35] sm:text-xl">
                {title}
              </h2>

              <Badge status={status} />
            </div>

            {summary ? (
              <div className="mt-1 text-sm text-[#6F6A66]">
                {summary}
              </div>
            ) : null}
          </div>

          <div
            className={[
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-lg font-bold transition",
              isOpen
                ? "rotate-180 border-[#183D35]/20 bg-[#DFE7D7] text-[#183D35]"
                : "border-[#C7D4BB] bg-[#F5F1E9] text-[#183D35]/70",
            ].join(" ")}
          >
            ↓
          </div>
        </div>
      </button>

      {isOpen ? (
        <div id={`${id}-content`} className="hf-quiz-accordion-content space-y-3 px-3 pb-3 sm:px-4 sm:pb-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}
