// src/hooks/usePrefersReducedMotion.js
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function getInitial() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

// Shared reduced-motion detector so every animated piece (trust ribbon
// runner, count-up stats, page transitions, success moments) reacts the
// same way, including live changes if the user flips the OS setting.
export default function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(getInitial);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;

    const mql = window.matchMedia(QUERY);
    const onChange = (event) => setReduced(event.matches);

    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);

    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  return reduced;
}
