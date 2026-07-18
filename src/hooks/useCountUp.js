// src/hooks/useCountUp.js
import { useEffect, useRef, useState } from "react";
import usePrefersReducedMotion from "./usePrefersReducedMotion";

const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

/**
 * Animates a verified numeric value from 0 once, the first time the
 * returned ref scrolls into view. Runs only once per page view, disables
 * itself for prefers-reduced-motion, and always exposes the true final
 * value (callers should also render it in accessible text separately so
 * screen readers get one announcement, not a stream of intermediate ones).
 */
export default function useCountUp(targetValue, { duration = 1200 } = {}) {
  const elementRef = useRef(null);
  const hasRunRef = useRef(false);
  const [displayValue, setDisplayValue] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const hasTarget = Number.isFinite(targetValue) && targetValue > 0;

  useEffect(() => {
    if (!hasTarget) return undefined;

    if (reducedMotion) {
      setDisplayValue(targetValue);
      return undefined;
    }

    const node = elementRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setDisplayValue(targetValue);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || hasRunRef.current) return;

        hasRunRef.current = true;
        observer.disconnect();

        const start = performance.now();

        function tick(now) {
          const elapsed = now - start;
          const progress = Math.min(1, elapsed / duration);
          const value = Math.round(targetValue * easeOutQuad(progress));
          setDisplayValue(value);

          if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasTarget, targetValue, duration, reducedMotion]);

  return { ref: elementRef, value: hasTarget ? displayValue : 0 };
}
