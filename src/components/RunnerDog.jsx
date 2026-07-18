// src/components/RunnerDog.jsx
import { useEffect, useRef } from "react";

// A centered, frame-by-frame gallop using an original transparent sprite.
// The dog stays in place while the dashed ground moves beneath it, creating
// a treadmill effect without competing with the trust-bar content.
//
// The transparent sprite uses standard background-position animation rather
// than an animated CSS mask. Mobile Safari can display a mask correctly while
// leaving its position frozen, so background-position is the more dependable
// way to show the same six-frame run cycle on iPhone.
export default function RunnerDog({ trackRef, paused = false, className = "" }) {
  const laneRef = useRef(null);

  useEffect(() => {
    const track = trackRef.current;
    const lane = laneRef.current;
    if (!track || !lane) {
      return undefined;
    }

    if (paused) {
      lane.style.setProperty("--hf-runner-state", "paused");
      return undefined;
    }

    lane.style.setProperty("--hf-runner-state", "running");

    if (typeof IntersectionObserver === "undefined") {
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
  }, [trackRef, paused]);

  return (
    <div
      ref={laneRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-6 items-end justify-center overflow-hidden text-[#2490C0] ${className}`}
      style={{ "--hf-runner-state": paused ? "paused" : "running" }}
    >
      <div className="hf-runner-ground absolute bottom-0.5 left-1/2 h-px w-9 -translate-x-1/2" />
      <div className="hf-runner-cycle relative z-10 h-5 w-8 opacity-75" />

      <style>{`
        .hf-runner-cycle {
          background-image: url(/assets/dog-run-cycle.png);
          background-repeat: no-repeat;
          background-size: 600% 100%;
          background-position: 0% 0;
          animation: hf-runner-frames 840ms steps(5, end) infinite;
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
          animation: hf-runner-ground 2000ms linear infinite;
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
          .hf-runner-cycle {
            animation: hf-runner-frames 4800ms steps(5, end) infinite !important;
            animation-play-state: var(--hf-runner-state, running) !important;
          }

          .hf-runner-ground {
            animation: hf-runner-ground 2400ms linear infinite !important;
            animation-play-state: var(--hf-runner-state, running) !important;
          }
        }
      `}</style>
    </div>
  );
}
