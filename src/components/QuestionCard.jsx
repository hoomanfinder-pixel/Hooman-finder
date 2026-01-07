import React from "react";

export default function QuestionCard({
  title,
  description,
  options,
  multiple = false,
  value,
  onChange,
  onNext,
  onBack,
  stepLabel,
  nextLabel = "Next",
  backLabel = "Back",
  canGoNext = true,
}) {
  const isSelected = (optValue) => {
    if (multiple) return Array.isArray(value) && value.includes(optValue);
    return value === optValue;
  };

  const toggle = (optValue) => {
    if (multiple) {
      const arr = Array.isArray(value) ? value : [];
      if (arr.includes(optValue)) onChange(arr.filter((x) => x !== optValue));
      else onChange([...arr, optValue]);
    } else {
      onChange(optValue);
    }
  };

  return (
    <div className="rounded-2xl bg-white p-6 shadow">
      <div className="mb-4">
        {stepLabel && (
          <div className="text-xs font-semibold text-gray-500">{stepLabel}</div>
        )}
        <h2 className="mt-1 text-2xl font-bold">{title}</h2>
        {description && <p className="mt-2 text-gray-600">{description}</p>}
      </div>

      <div className="grid gap-3">
        {options.map((opt) => {
          const selected = isSelected(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={[
                "w-full rounded-xl border px-4 py-3 text-left transition",
                selected
                  ? "border-green-600 bg-green-50"
                  : "border-gray-200 bg-white hover:bg-gray-50",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold">{opt.label}</div>
                  {opt.help && <div className="mt-1 text-sm text-gray-600">{opt.help}</div>}
                </div>

                <div
                  className={[
                    "mt-1 h-5 w-5 rounded-full border",
                    selected ? "border-green-600 bg-green-600" : "border-gray-300 bg-white",
                  ].join(" ")}
                />
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          disabled={!onBack}
        >
          {backLabel}
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext}
          className={[
            "rounded-lg px-5 py-2 text-sm font-semibold text-white",
            canGoNext ? "bg-green-600 hover:bg-green-700" : "bg-gray-300",
          ].join(" ")}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
