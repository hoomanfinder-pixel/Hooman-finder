// src/components/OptionSelect.jsx
import React, { useId, useMemo } from "react";

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
  rankingDisclosure = "",
  inputMode = "text",
  placeholder = "",
  type = "single",
}) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = `${generatedId}-description`;
  const normalizedExclusive = useMemo(
    () => (exclusiveValues || []).map(String),
    [exclusiveValues]
  );
  const optionLayout = useMemo(() => {
    if (type === "text") return false;
    if (!Array.isArray(options) || options.length < 2) return false;

    const labels = options.map((opt) => String(opt?.label || ""));
    const longCount = labels.filter((label) => label.length > 42).length;
    const veryLongCount = labels.filter((label) => label.length > 58).length;
    const averageLength =
      labels.reduce((sum, label) => sum + label.length, 0) / labels.length;
    const useSingleColumn =
      longCount > labels.length / 2 || veryLongCount >= 2 || averageLength > 42;

    return {
      useTwoColumns: !useSingleColumn,
      lastOptionCanSpan: options.length % 2 === 1 && options.length > 2,
    };
  }, [options, type]);

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
    <section
      className="hf-quiz-question-card rounded-[1.5rem] border border-[#C7D4BB]/90 bg-white p-4 shadow-[0_14px_36px_rgba(24,61,53,0.065)] sm:p-5"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <div className="mb-3.5 sm:mb-4">
        {number !== null ? (
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6F6A66]">
            Question {String(number).padStart(2, "0")}
          </p>
        ) : null}

        <h3 id={titleId} className="max-w-2xl font-['Fraunces',serif] text-[1.35rem] font-semibold leading-[1.12] text-[#183D35] sm:text-2xl">
          {title}
        </h3>

        {description ? (
          <p id={descriptionId} className="mt-1.5 max-w-xl text-sm leading-5 text-[#6F6A66] sm:text-[15px] sm:leading-6">
            {description}
          </p>
        ) : null}

        {rankingDisclosure ? (
          <p className="mt-2 rounded-xl bg-[#F5F1E9] px-3 py-2 text-xs font-medium leading-5 text-[#6F6A66]">
            {rankingDisclosure}
          </p>
        ) : null}
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
            className="min-h-14 w-full rounded-2xl border border-[#C7D4BB] bg-[#F8F6F1] px-4 py-3 text-base font-semibold text-[#183D35] outline-none transition placeholder:text-[#183D35]/35 focus:border-[#2490C0] focus:bg-white focus:ring-4 focus:ring-[#2490C0]/12"
          />
        </label>
      ) : (
        <div
          className={
            optionLayout?.useTwoColumns
              ? "grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5"
              : "grid gap-2 sm:gap-2.5"
          }
        >
          {options.map((opt, index) => {
            const selected = isSelected(opt.value);
            const key = opt.key ?? String(opt.value);
            const mark = multiple ? "check" : "radio";
            const shouldSpan =
              optionLayout?.useTwoColumns &&
              optionLayout.lastOptionCanSpan &&
              index === options.length - 1;

            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(opt.value)}
                aria-pressed={selected}
                data-selected={selected ? "true" : "false"}
                className={[
                  "hf-quiz-option w-full rounded-2xl border px-3.5 py-2.5 text-left sm:px-4 sm:py-3",
                  "min-h-14",
                  shouldSpan ? "sm:col-span-2" : "",
                  selected
                    ? "border-[#183D35] bg-[#DFE7D7] shadow-[0_8px_22px_rgba(24,61,53,0.12)] ring-1 ring-[#183D35]/10"
                    : "border-[#C7D4BB]/90 bg-[#FDFCF9] hover:-translate-y-0.5 hover:border-[#183D35]/35 hover:bg-white hover:shadow-md",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                    <div
                      className={[
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base transition sm:h-10 sm:w-10",
                        selected ? "bg-white text-[#183D35] shadow-sm" : "bg-[#F5F1E9] text-[#5F5A56]",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      {opt.icon || optionIcon(opt)}
                    </div>

                    <div className="min-w-0">
                      <div className="whitespace-normal break-words text-sm font-bold leading-snug text-[#183D35] sm:text-[15px]">
                        {opt.label}
                      </div>

                      {opt.help ? (
                        <div className="mt-1 whitespace-normal break-words text-xs font-medium leading-4 text-[#6F6A66] sm:text-[13px] sm:leading-5">
                          {opt.help}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div
                    aria-hidden="true"
                    className={[
                      "flex h-5 w-5 shrink-0 items-center justify-center border transition",
                      mark === "radio" ? "rounded-full" : "rounded-md",
                      selected
                        ? "border-[#183D35] bg-[#183D35] text-[#F3C982] shadow-sm"
                        : "border-[#183D35]/24 bg-white text-transparent",
                    ].join(" ")}
                  >
                    {selected ? (
                      <span className="text-[11px] font-black leading-none">
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
