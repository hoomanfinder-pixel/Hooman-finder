// src/components/PawPattern.jsx

// Very subtle, decorative paw-print texture. Purely visual (aria-hidden),
// tiled with an SVG <pattern> so it stays crisp at any size and never
// affects text contrast or layout.
export default function PawPattern({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="hf-paw-pattern" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
          <g fill="currentColor">
            <ellipse cx="23" cy="27" rx="6.4" ry="5.2" />
            <ellipse cx="15.5" cy="18" rx="2.4" ry="3" />
            <ellipse cx="21" cy="14" rx="2.4" ry="3" />
            <ellipse cx="27.5" cy="14.5" rx="2.4" ry="3" />
            <ellipse cx="32.5" cy="19" rx="2.3" ry="2.8" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hf-paw-pattern)" />
    </svg>
  );
}
