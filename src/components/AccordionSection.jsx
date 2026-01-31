import React from "react";

function Badge({ status }) {
  const base = "rounded-full px-2 py-0.5 text-[11px] font-semibold";
  if (status === "complete")
    return <span className={`${base} bg-green-100 text-green-800`}>Complete</span>;
  if (status === "partial")
    return <span className={`${base} bg-yellow-100 text-yellow-800`}>In progress</span>;
  return <span className={`${base} bg-gray-100 text-gray-700`}>Not started</span>;
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
    <div id={id} className="rounded-2xl border border-green-200 bg-green-50/40">
      <button
        type="button"
        onClick={onToggle}
        className="w-full rounded-2xl px-4 py-4 text-left"
        aria-expanded={isOpen}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-green-900">{title}</h2>
              <Badge status={status} />
            </div>

            {!isOpen && summary && (
              <div className="mt-1 truncate text-sm text-green-900/70">{summary}</div>
            )}
          </div>

          <div className="mt-0.5 text-green-900/60">{isOpen ? "▲" : "▼"}</div>
        </div>
      </button>

      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
