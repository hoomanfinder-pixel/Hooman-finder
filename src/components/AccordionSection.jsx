// src/components/AccordionSection.jsx
import React from "react";

function Badge({ status }) {
  const base = "rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em]";

  if (status === "complete") {
    return <span className={`${base} bg-[#dfe7d7] text-[#183D35]`}>Complete</span>;
  }

  if (status === "partial") {
    return <span className={`${base} bg-[#FBF0DC] text-[#8A6A2F]`}>In progress</span>;
  }

  return <span className={`${base} bg-[#f5f1e9] text-[#183D35]/55`}>Not started</span>;
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
        "overflow-hidden rounded-[1.35rem] border shadow-sm shadow-[#183D35]/5 transition",
        isOpen
          ? "border-[#183D35]/22 bg-white"
          : "border-[#183D35]/10 bg-white/72",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2.5 text-left sm:px-4"
        aria-expanded={isOpen}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-['Fraunces',serif] text-sm font-semibold text-[#183D35] sm:text-base">
                {title}
              </h2>

              <Badge status={status} />
            </div>

            {summary ? (
              <div className="mt-0.5 text-xs font-semibold text-[#6f6a66] sm:text-sm">
                {summary}
              </div>
            ) : null}
          </div>

          <div
            className={[
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-base font-black transition",
              isOpen
                ? "border-[#183D35]/20 bg-[#dfe7d7] text-[#183D35]"
                : "border-[#183D35]/10 bg-[#f5f1e9] text-[#183D35]/60",
            ].join(" ")}
          >
            {isOpen ? "⌄" : "›"}
          </div>
        </div>
      </button>

      {isOpen ? <div className="space-y-2 px-2.5 pb-2.5 sm:px-3 sm:pb-3">{children}</div> : null}
    </section>
  );
}
