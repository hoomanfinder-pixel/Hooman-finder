// src/components/QuestionCard.jsx
import React from "react";
import OptionSelect from "./OptionSelect";

export default function QuestionCard({ question, value, onChange }) {
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
      exclusiveValues={question.exclusiveValues || []} // ✅ KEY LINE
    />
  );
}
