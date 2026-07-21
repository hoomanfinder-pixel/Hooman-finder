// src/components/TrustRibbon.jsx
import { Fragment, useState } from "react";
import useCountUp from "../hooks/useCountUp";

function HeartIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 20.5s-7-4.35-9.5-8.8C1 8.4 2.5 5 6 5c2 0 3.5 1.2 6 4 2.5-2.8 4-4 6-4 3.5 0 5 3.4 3.5 6.7C19 16.15 12 20.5 12 20.5z" />
    </svg>
  );
}

function BoltIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" />
    </svg>
  );
}

function HomeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
    </svg>
  );
}

function PawIcon(props) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path fill="none" d="M8 14.5c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5-1.8 4-4 4-4-1.5-4-4Z" />
      <circle cx="6.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="5.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="5.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CompassIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="m14.3 9.7-1.3 3.6-3.6 1.3 1.3-3.6z" />
    </svg>
  );
}

function ScaleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 4v16M7 7h10M4.5 13a2.5 2.5 0 0 0 5 0L7 7l-2.5 6ZM16.5 13a2.5 2.5 0 0 0 5 0L19 7l-2.5 6Z" />
    </svg>
  );
}

function ChatIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="5" width="16" height="10.5" rx="3" />
      <path d="M9 15.5v3l4-3" />
    </svg>
  );
}

function InfoIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5" />
      <path d="M12 8v.01" />
    </svg>
  );
}

function PlayIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

function PauseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

const SOURCES = {
  expectations: "https://pubmed.ncbi.nlm.nih.gov/35565480/",
  returnedDogFactors: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7552273/",
  behaviorLimitations: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7401658/",
  shelterOutcomes2025: "https://www.shelteranimalscount.org/2025-report",
};

const RIBBON_ITEMS = [
  { text: "Free to use", icon: HeartIcon },
  { text: "No account required", icon: BoltIcon },
  { text: "Real shelter and rescue listings", icon: HomeIcon },
  {
    text: "About one dog is euthanized in a U.S. shelter every 99 seconds",
    icon: HeartIcon,
    source: SOURCES.shelterOutcomes2025,
  },
  { text: "Lifestyle fit goes beyond breed and looks", icon: PawIcon },
  {
    text: "Better starts begin with realistic expectations",
    icon: CompassIcon,
    source: SOURCES.expectations,
  },
  {
    text: "Behavior and household fit can influence adoption outcomes",
    icon: ScaleIcon,
    source: SOURCES.returnedDogFactors,
  },
  { text: "Shelter counseling and meet and greets still matter", icon: ChatIcon },
  {
    text: "Match guidance is never a guarantee",
    icon: InfoIcon,
    source: SOURCES.behaviorLimitations,
  },
];

function Divider() {
  return (
    <span
      aria-hidden="true"
      className="ribbon-divider mx-4 h-4 w-px shrink-0 self-center bg-[#2490C0]/25 sm:mx-5"
    />
  );
}

function RibbonItem({ item, interactive }) {
  const Icon = item.icon;
  return (
    <div
      className="ribbon-item flex shrink-0 items-center gap-2.5"
      role={interactive ? "listitem" : undefined}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#2490C0]" />
      <span className="ribbon-item-text whitespace-nowrap text-[13px] font-semibold text-[#2490C0]">
        {item.text}
      </span>
      {item.source ? (
        interactive ? (
          <a
            href={item.source}
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap rounded-sm text-[10.5px] font-bold uppercase tracking-wide text-[#8A6A2F] underline decoration-dotted underline-offset-2 transition hover:text-[#183D35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183D35]"
          >
            Source
          </a>
        ) : (
          <span className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-[#8A6A2F]/70">
            Source
          </span>
        )
      ) : null}
    </div>
  );
}

function RibbonGroup({ interactive }) {
  return (
    <div
      className="ribbon-group flex shrink-0 items-center"
      aria-hidden={interactive ? undefined : "true"}
      role={interactive ? "list" : undefined}
    >
      {RIBBON_ITEMS.map((item, index) => (
        <Fragment key={`${interactive ? "real" : "dup"}-${index}`}>
          {index > 0 && <Divider />}
          <RibbonItem item={item} interactive={interactive} />
        </Fragment>
      ))}
      <Divider />
    </div>
  );
}

function StatRow({ value, label }) {
  const { ref, value: displayValue } = useCountUp(value);
  const digits = String(value).length;

  if (!Number.isFinite(value) || value <= 0) return null;

  return (
    <div className="flex items-center gap-2 border-b border-[#183D35]/10 px-4 py-1 sm:gap-2.5 sm:px-6 sm:py-2">
      <span
        aria-hidden="true"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#183D35] text-[#F3C982] sm:h-7 sm:w-7"
      >
        <PawIcon className="h-3 w-3" />
      </span>
      <p className="text-[12px] font-semibold leading-tight text-[#183D35] sm:text-[14.5px]">
        <span
          ref={ref}
          aria-hidden="true"
          className="tabular-nums font-['Fraunces',serif] text-[17px] font-bold text-[#183D35] sm:text-xl"
          style={{ minWidth: `${digits}ch`, display: "inline-block" }}
        >
          {displayValue}
        </span>{" "}
        <span aria-hidden="true">{label}</span>
        <span className="sr-only">{`${value} ${label}`}</span>
      </p>
    </div>
  );
}

export default function TrustRibbon({ stat = null }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const paused = !isPlaying || isFocusWithin;

  return (
    <section
      aria-label="Trust and evidence"
      className="px-4 pb-1 pt-1 sm:px-6 sm:pb-1 sm:pt-3 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <div
          className="relative rounded-[1.35rem] border border-[#C7D4BB] bg-white/70 pb-2 shadow-[0_12px_32px_rgba(24,61,53,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-sm sm:pb-3"
        >
          {stat ? <StatRow value={stat.value} label={stat.label} /> : null}

          <div
            className="ribbon-viewport relative overflow-hidden py-2 pl-4 pr-14 sm:py-3 sm:pl-6 sm:pr-20"
            style={{
              WebkitMaskImage:
                "linear-gradient(to right, transparent, black 10%, black 84%, transparent)",
              maskImage:
                "linear-gradient(to right, transparent, black 10%, black 84%, transparent)",
            }}
            onFocusCapture={() => setIsFocusWithin(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setIsFocusWithin(false);
              }
            }}
          >
            <div
              className="ribbon-track flex w-max min-w-max flex-nowrap items-center"
              style={{ animationPlayState: paused ? "paused" : "running" }}
            >
              <RibbonGroup interactive />
              <RibbonGroup />
            </div>

            <button
              type="button"
              onClick={() => setIsPlaying((prev) => !prev)}
              aria-pressed={!isPlaying}
              aria-label={isPlaying ? "Pause scrolling ribbon" : "Play scrolling ribbon"}
              className="ribbon-toggle absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#2490C0]/30 bg-white/90 text-[#2490C0] shadow-sm transition hover:bg-white hover:text-[#183D35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2490C0]"
            >
              {isPlaying ? <PauseIcon className="h-3 w-3" /> : <PlayIcon className="h-3 w-3" />}
            </button>
          </div>

          <img
            src="/assets/peeking-dog-silhouette.webp"
            alt=""
            aria-hidden="true"
            width="280"
            height="322"
            decoding="async"
            className={`pointer-events-none absolute z-30 select-none opacity-90 drop-shadow-[0_2px_2px_rgba(0,0,0,0.15)] ${stat ? "top-[11px] right-[10px] w-[18px] sm:top-[15px] sm:right-[24px] sm:w-[27px]" : "top-[36px] right-[14px] w-[25px] sm:top-[52px] sm:right-[30px] sm:w-[40px]"}`}
          />
        </div>

        <a
          href="#how-it-works"
          className="mx-auto mt-0.5 flex min-h-8 w-fit items-center gap-2 rounded-full px-3 py-0.5 text-[12px] font-bold text-[#176B91] transition hover:bg-[#EAF6FB] hover:text-[#183D35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2490C0] sm:mt-1 sm:py-1 sm:text-[13px]"
        >
          See how Hooman Finder works
          <span aria-hidden="true" className="text-base leading-none">↓</span>
        </a>
      </div>

      <style>{`
        .ribbon-track {
          animation: trust-ribbon-scroll 90s linear infinite;
          transform: translate3d(0, 0, 0);
          will-change: transform;
        }
        @keyframes trust-ribbon-scroll {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
      `}</style>
    </section>
  );
}
