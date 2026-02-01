import React, { useMemo } from "react";

/**
 * Multi-select rules:
 * - If user clicks an exclusive option (e.g. "no_preference"), it becomes the ONLY selection.
 * - If user selects any normal option, it auto-removes exclusive options.
 */
function toggleMultiWithExclusive(currentValue, clickedValue, exclusiveValues = []) {
  const current = Array.isArray(currentValue)
    ? currentValue.map(String)
    : currentValue
      ? [String(currentValue)]
      : [];

  const v = String(clickedValue);
  const exclusiveSet = new Set((exclusiveValues || []).map(String));

  // Clicked an exclusive option → it becomes the only selection
  if (exclusiveSet.has(v)) return [v];

  // Otherwise remove any exclusive options first
  let next = current.filter((x) => !exclusiveSet.has(String(x)));

  // Toggle clicked
  if (next.includes(v)) next = next.filter((x) => x !== v);
  else next = [...next, v];

  return next;
}

export default function OptionSelect({
  title,
  description,
  options,
  multiple = false,
  value,
  onChange,
  exclusiveValues = [], // ✅ NEW
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
    <div className="rounded-2xl bg-white p-6 shadow">
      <div className="mb-4">
        <h3 className="text-lg font-bold">{title}</h3>
        {description && <p className="mt-2 text-sm text-gray-600">{description}</p>}
      </div>

      <div className="grid gap-3">
        {options.map((opt) => {
          const selected = isSelected(opt.value);
          const key = opt.key ?? String(opt.value);

          return (
            <button
              key={key}
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
    </div>
  );
}
