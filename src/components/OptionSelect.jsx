// src/components/OptionSelect.jsx
import React, { useMemo } from "react";

function toggleMultiWithExclusive(currentValue, clickedValue, exclusiveValues = []) {
  const current = Array.isArray(currentValue)
    ? currentValue.map(String)
    : currentValue
      ? [String(currentValue)]
      : [];

  const v = String(clickedValue);
  const exclusiveSet = new Set((exclusiveValues || []).map(String));

  if (exclusiveSet.has(v)) return [v];

  let next = current.filter((x) => !exclusiveSet.has(String(x)));

  if (next.includes(v)) next = next.filter((x) => x !== v);
  else next = [...next, v];

  return next;
}

function optionIcon(option) {
  const label = String(option?.label || "").toLowerCase();
  const value = String(option?.value || "").toLowerCase();

  if (label.includes("other dog") || value.includes("dog")) return "🐶";
  if (label.includes("cat") || value.includes("cat")) return "🐱";
  if (label.includes("small animal") || label.includes("rabbit") || value.includes("small")) return "🐰";
  if (label.includes("no other") || label.includes("not important") || value.includes("none")) return "🏠";
  if (label.includes("not sure") || label.includes("flexible") || value.includes("unsure")) return "?";
  if (label.includes("potty")) return "🏅";
  if (label.includes("preferred")) return "⭐";
  if (label.includes("training")) return "♡";
  if (label.includes("high")) return "⚡";
  if (label.includes("low")) return "🌿";
  if (label.includes("kid") || label.includes("child")) return "♡";

  return option?.icon || "🐾";
}

export default function OptionSelect({
  title,
  description,
  options,
  multiple = false,
  value,
  onChange,
  exclusiveValues = [],
  number = null,
  icon = "🐾",
  statusText = "",
}) {
  const normalizedExclusive = useMemo(
    () => (exclusiveValues || []).map(String),
    [exclusiveValues]
  );

  const isSelected = (optValue) => {
    if (multiple) return Array.isArray(value) && value.map(String).includes(String(optValue));
    return String(value) === String(optValue);
  };

  const toggle = (optValue) => {
    if (multiple) {
      const next = toggleMultiWithExclusive(value, optValue, normalizedExclusive);
      onChange(next);
    } else {
      onChange(optValue);
    }
  };

  return (
    <section className="rounded-[1.35rem] border border-[#0f2742]/10 bg-white/68 p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex items-start gap-3">
        {number !== null ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dfe7d7] text-sm font-black text-[#0f2742]">
            {number}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-lg leading-none">{icon}</span>

            <div className="min-w-0 flex-1">
              <h3 className="text-base font-black leading-snug tracking-[-0.02em] text-[#0f2742] sm:text-lg">
                {title}
              </h3>

              {description ? (
                <p className="mt-1 text-xs font-medium leading-5 text-[#0f2742]/62 sm:text-sm">
                  {description}
                </p>
              ) : null}
            </div>
          </div>

          {statusText ? (
            <div className="mt-2 inline-flex rounded-full bg-[#f4f1ea] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0f2742]/55 ring-1 ring-[#0f2742]/8">
              {statusText}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        {options.map((opt) => {
          const selected = isSelected(opt.value);
          const key = opt.key ?? String(opt.value);
          const mark = multiple ? "check" : "radio";

          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(opt.value)}
              className={[
                "w-full rounded-2xl border px-3 py-2.5 text-left transition sm:px-3.5",
                "min-h-[50px]",
                selected
                  ? "border-[#9ead8d] bg-[#dfe7d7]/72 shadow-sm"
                  : "border-[#0f2742]/10 bg-white/82 hover:border-[#0f4f88]/35 hover:bg-white",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={[
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base",
                      selected ? "bg-white/70" : "bg-[#f4f1ea]",
                    ].join(" ")}
                  >
                    {opt.icon || optionIcon(opt)}
                  </div>

                  <div className="min-w-0">
                    <div className="text-sm font-bold leading-snug text-[#0f2742]">
                      {opt.label}
                    </div>

                    {opt.help ? (
                      <div className="mt-0.5 text-xs leading-4 text-[#0f2742]/58">
                        {opt.help}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div
                  className={[
                    "flex h-5 w-5 shrink-0 items-center justify-center border transition",
                    mark === "radio" ? "rounded-full" : "rounded-md",
                    selected
                      ? "border-[#0f4f88] bg-[#0f4f88] text-white"
                      : "border-[#0f2742]/24 bg-white text-transparent",
                  ].join(" ")}
                >
                  {selected ? (
                    <span className="text-[12px] font-black leading-none">
                      {mark === "radio" ? "●" : "✓"}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}