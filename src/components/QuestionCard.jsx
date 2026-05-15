// src/components/QuestionCard.jsx
import React from "react";
import OptionSelect from "./OptionSelect";

function questionIcon(question) {
  const id = String(question?.id || "").toLowerCase();
  const title = String(question?.title || "").toLowerCase();

  if (id.includes("dog") || title.includes("dog")) return "🐶";
  if (id.includes("cat") || title.includes("cat")) return "🐱";
  if (id.includes("pet") || title.includes("animal")) return "🐾";
  if (id.includes("kids") || title.includes("kid") || title.includes("children")) return "♡";
  if (id.includes("potty") || title.includes("potty")) return "🏅";
  if (id.includes("size") || title.includes("size")) return "📏";
  if (id.includes("home") || title.includes("home") || title.includes("house")) return "🏠";
  if (id.includes("crate") || title.includes("crate")) return "🧺";
  if (id.includes("train") || title.includes("training")) return "⭐";
  if (id.includes("energy") || title.includes("energy")) return "⚡";
  if (id.includes("allerg") || title.includes("allerg")) return "🌿";
  if (id.includes("groom") || title.includes("groom")) return "✂️";

  return "🐾";
}

export default function QuestionCard({
  question,
  value,
  onChange,
  number = null,
  statusText = "",
}) {
  const multiple =
    question.multiple === true ||
    question.type === "multi" ||
    question.type === "multiple";

  return (
    <OptionSelect
      title={question.title}
      description={question.description}
      options={question.options || []}
      multiple={multiple}
      value={value}
      onChange={onChange}
      exclusiveValues={question.exclusiveValues || []}
      number={number}
      icon={question.icon || questionIcon(question)}
      statusText={statusText}
    />
  );
}