// src/components/AccordionSection.jsx
import React from "react";

function Badge({ status }) {
  const base = "rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em]";

  if (status === "complete") {
    return <span className={`${base} bg-[#dfe7d7] text-[#0f2742]`}>Complete</span>;
  }

  if (status === "partial") {
    return <span className={`${base} bg-[#fff6d8] text-[#6f5312]`}>In progress</span>;
  }

  return <span className={`${base} bg-white/70 text-[#0f2742]/55`}>Not started</span>;
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
        "overflow-hidden rounded-[1.35rem] border shadow-sm transition",
        isOpen
          ? "border-[#0f4f88]/22 bg-white/62"
          : "border-[#0f2742]/10 bg-white/44",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 text-left"
        aria-expanded={isOpen}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black tracking-[-0.02em] text-[#0f2742]">
                {title}
              </h2>

              <Badge status={status} />
            </div>

            {summary ? (
              <div className="mt-1 text-sm font-medium text-[#0f2742]/62">
                {summary}
              </div>
            ) : null}
          </div>

          <div
            className={[
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg font-bold transition",
              isOpen
                ? "border-[#0f4f88]/20 bg-[#dfe7d7] text-[#0f2742]"
                : "border-[#0f2742]/10 bg-white/72 text-[#0f2742]/60",
            ].join(" ")}
          >
            {isOpen ? "⌄" : "›"}
          </div>
        </div>
      </button>

      {isOpen ? <div className="space-y-3 px-3 pb-3 sm:px-4 sm:pb-4">{children}</div> : null}
    </section>
  );
}