// src/components/RunnerDog.jsx
import { useEffect, useRef } from "react";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";

// A centered, frame-by-frame gallop using an original transparent sprite.
// The dog stays in place while the dashed ground moves beneath it, creating
// a treadmill effect without competing with the trust-bar content.
//
// The transparent sprite uses standard background-position animation rather
// than an animated CSS mask. Mobile Safari can display a mask correctly while
// leaving its position frozen, so background-position is the more dependable
// way to show the same six-frame run cycle on iPhone.
export default function RunnerDog({ trackRef, className = "" }) {
  const laneRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const track = trackRef.current;
    const lane = laneRef.current;
    if (!track || !lane || reducedMotion || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        lane.style.setProperty(
          "--hf-runner-state",
          entries[0]?.isIntersecting ? "running" : "paused"
        );
      },
      { rootMargin: "20% 0px 20% 0px" }
    );

    observer.observe(track);
    return () => observer.disconnect();
  }, [trackRef, reducedMotion]);

  return (
    <div
      ref={laneRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-5 items-end justify-center overflow-hidden text-[#2490C0] sm:h-6 ${className}`}
    >
      <div className="hf-runner-ground absolute bottom-0.5 left-1/2 h-px w-9 -translate-x-1/2" />
      <div className="hf-runner-cycle relative z-10 h-4 w-7 opacity-70 sm:h-5 sm:w-8" />

      <style>{`
        .hf-runner-cycle {
          background-image: url(/assets/dog-run-cycle.png);
          background-repeat: no-repeat;
          background-size: 600% 100%;
          background-position: 0% 0;
          animation: hf-runner-frames 2400ms steps(5, end) infinite;
          animation-play-state: var(--hf-runner-state, running);
          will-change: background-position;
        }

        .hf-runner-ground {
          background-image: repeating-linear-gradient(
            to right,
            currentColor 0 3px,
            transparent 3px 8px
          );
          opacity: 0.16;
          animation: hf-runner-ground 1200ms linear infinite;
          animation-play-state: var(--hf-runner-state, running);
          will-change: background-position;
        }

        @keyframes hf-runner-frames {
          from { background-position: 0% 0; }
          to { background-position: 100% 0; }
        }

        @keyframes hf-runner-ground {
          from { background-position: 0 0; }
          to { background-position: -8px 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .hf-runner-cycle,
          .hf-runner-ground {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
