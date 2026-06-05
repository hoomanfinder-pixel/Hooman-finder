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

  if (label.includes("mile") || value.includes("mile")) return "↔";
  if (label.includes("michigan") || value.includes("michigan")) return "MI";
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
  inputMode = "text",
  placeholder = "",
  type = "single",
  preferCompactGrid = false,
}) {
  const normalizedExclusive = useMemo(
    () => (exclusiveValues || []).map(String),
    [exclusiveValues]
  );
  const compactOptions = useMemo(() => {
    if (type === "text") return false;
    if (!Array.isArray(options) || options.length < 2 || options.length > 6) return false;
    if (options.some((opt) => opt?.help)) return false;

    const labels = options.map((opt) => String(opt?.label || ""));
    const averageLength =
      labels.reduce((sum, label) => sum + label.length, 0) / labels.length;

    if (preferCompactGrid) {
      return averageLength <= 28 && labels.filter((label) => label.length > 42).length === 0;
    }

    return averageLength <= 20 && labels.every((label) => label.length <= 28);
  }, [options, preferCompactGrid, type]);

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

  const isTextQuestion = type === "text";

  return (
    <section className="rounded-[1.35rem] border border-[#0f2742]/10 bg-white/95 p-2.5 shadow-sm shadow-stone-950/5 sm:p-3.5">
      <div className="mb-2.5 flex items-start gap-2.5">
        {number !== null ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dfe7d7] text-xs font-black text-[#0f2742] ring-1 ring-[#0f2742]/5">
            {number}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden="true">
              {icon}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-sm font-black leading-tight text-[#0f2742] sm:text-base">
                  {title}
                </h3>

                {statusText ? (
                  <span className="inline-flex max-w-full rounded-full bg-[#f5f1e9] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-[#0f2742]/58 ring-1 ring-[#0f2742]/8">
                    {statusText}
                  </span>
                ) : null}
              </div>

              {description ? (
                <p className="mt-0.5 text-xs font-semibold leading-4 text-[#6f6a66]">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {isTextQuestion ? (
        <label className="block">
          <span className="sr-only">{title}</span>
          <input
            type="text"
            inputMode={inputMode}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className="min-h-11 w-full rounded-2xl border border-[#0f2742]/12 bg-[#f5f1e9]/50 px-3.5 py-2.5 text-sm font-bold text-[#0f2742] outline-none transition placeholder:text-[#0f2742]/35 focus:border-[#0f4f88]/45 focus:bg-white focus:ring-4 focus:ring-[#0f4f88]/10"
          />
        </label>
      ) : (
        <div className={compactOptions ? "grid grid-cols-2 gap-1.5" : "grid gap-1.5"}>
          {options.map((opt) => {
            const selected = isSelected(opt.value);
            const key = opt.key ?? String(opt.value);
            const mark = multiple ? "check" : "radio";
            const label = String(opt?.label || "");
            const shouldSpan = compactOptions && label.length > 28;

            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(opt.value)}
                className={[
                  "w-full rounded-2xl border px-2.5 py-2 text-left transition sm:px-3",
                  compactOptions ? "min-h-11" : "min-h-[46px]",
                  shouldSpan ? "col-span-2" : "",
                  selected
                    ? "border-[#0f4f88]/35 bg-[#dfe7d7] shadow-sm ring-1 ring-[#0f4f88]/10"
                    : "border-[#0f2742]/10 bg-white hover:border-[#0f4f88]/35 hover:bg-[#f8f6f1]",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={[
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm",
                        selected ? "bg-white/80" : "bg-[#f5f1e9]",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      {opt.icon || optionIcon(opt)}
                    </div>

                    <div className="min-w-0">
                      <div className="text-[13px] font-extrabold leading-tight text-[#0f2742] sm:text-sm">
                        {opt.label}
                      </div>

                      {opt.help ? (
                        <div className="mt-0.5 text-xs font-medium leading-4 text-[#6f6a66]">
                          {opt.help}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className={[
                      "flex h-4 w-4 shrink-0 items-center justify-center border transition",
                      mark === "radio" ? "rounded-full" : "rounded-md",
                      selected
                        ? "border-[#0f4f88] bg-[#0f4f88] text-white"
                        : "border-[#0f2742]/24 bg-white text-transparent",
                    ].join(" ")}
                  >
                    {selected ? (
                      <span className="text-[10px] font-black leading-none">
                        {mark === "radio" ? "●" : "✓"}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
