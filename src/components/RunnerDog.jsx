// src/components/RunnerDog.jsx
import { useEffect, useRef } from "react";

// A centered, frame-by-frame gallop using an original transparent sprite.
// The dog stays in place while the dashed ground moves beneath it, creating
// a treadmill effect without competing with the trust-bar content.
//
// The six-frame strip is animated with a GPU-composited transform (translateX)
// rather than by animating background-position. iOS Safari reliably hardware-
// accelerates transform animations but is known to stutter/skip frames when
// background-position is animated directly, which is what caused the glitchy
// run cycle specifically on iPhone while desktop looked fine.
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
      <div className="relative z-10 h-5 w-8 overflow-hidden">
        <div className="hf-runner-strip h-full opacity-75" />
      </div>

      <style>{`
        .hf-runner-strip {
          width: 600%;
          height: 100%;
          background-image: url(/assets/dog-run-cycle.png);
          background-repeat: no-repeat;
          background-size: 100% 100%;
          transform: translate3d(0, 0, 0);
          animation: hf-runner-frames 840ms steps(5, end) infinite;
          animation-play-state: var(--hf-runner-state, running);
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
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
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-83.3333%, 0, 0); }
        }

        @keyframes hf-runner-ground {
          from { background-position: 0 0; }
          to { background-position: -8px 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .hf-runner-strip {
            animation: hf-runner-frames 840ms steps(5, end) infinite !important;
            animation-play-state: var(--hf-runner-state, running) !important;
          }

          .hf-runner-ground {
            animation: hf-runner-ground 2000ms linear infinite !important;
            animation-play-state: var(--hf-runner-state, running) !important;
          }
        }
      `}</style>
    </div>
  );
}
