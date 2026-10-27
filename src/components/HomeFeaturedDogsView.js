import React from "react";
import { Link } from "react-router-dom";

const EMPTY_MESSAGE =
  "New adoptable dogs are added regularly. Check back soon, or browse the full list.";
const ERROR_MESSAGE =
  "We could not load dogs right now. Please try again in a moment.";
const PANEL_CLASS =
  "mt-4 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-[#C7D4BB] bg-white p-6 text-center sm:min-h-[22rem] sm:p-8";

export function getHomepageFeaturedDogsViewState({ count, loading, failed }) {
  if (count > 0) return "dogs";
  if (loading) return "loading";
  return failed ? "error" : "empty";
}

export default function HomeFeaturedDogsView({ state, children }) {
  if (state === "dogs") return children;

  if (state === "loading") {
    return React.createElement(
      "div",
      {
        className: PANEL_CLASS,
        role: "status",
        "aria-live": "polite",
        "aria-busy": "true",
      },
      React.createElement("span", {
        "aria-hidden": "true",
        className:
          "mb-3 h-7 w-7 animate-pulse rounded-full border-2 border-[#C7D4BB] border-t-[#183D35] motion-reduce:animate-none",
      }),
      React.createElement(
        "p",
        { className: "text-sm leading-6 text-[#6F6A66]" },
        "Loading featured dogs…"
      )
    );
  }

  return React.createElement(
    "div",
    { className: PANEL_CLASS },
    React.createElement(
      "p",
      { className: "text-sm leading-6 text-[#6F6A66]" },
      state === "error" ? ERROR_MESSAGE : EMPTY_MESSAGE
    ),
    React.createElement(
      Link,
      {
        to: "/dogs",
        className:
          "mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-[#183D35] px-6 text-sm font-bold text-[#183D35] transition hover:bg-[#183D35] hover:text-white",
      },
      "Browse Dogs"
    )
  );
}
