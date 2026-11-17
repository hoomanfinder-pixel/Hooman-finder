// src/components/QuestionCard.jsx
import React from "react";
import OptionSelect from "./OptionSelect";
import { questionAffectsMatchRanking } from "../lib/matchingLogic";

export default function QuestionCard({
  question,
  value,
  onChange,
  number = null,
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
      rankingDisclosure={questionAffectsMatchRanking(question.id)
        ? ""
        : "Saved for context · does not currently affect fit scores or ranking."}
      inputMode={question.inputMode}
      placeholder={question.placeholder}
      type={question.type}
    />
  );
}
