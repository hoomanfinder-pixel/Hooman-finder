// src/components/DogGridSkeleton.jsx

// Branded loading placeholder that roughly matches DogCard's grid-variant
// dimensions, so content doesn't jump when real cards swap in. The status
// text is announced once via aria-live rather than per-skeleton-card.
function SkeletonCard({ variant = "grid" }) {
  const isMatch = variant === "match";

  return (
    <div
      aria-hidden="true"
      className={[
        "overflow-hidden border border-[#183D35]/10 bg-white",
        isMatch
          ? "rounded-[1.75rem] shadow-sm"
          : "relative aspect-square rounded-2xl sm:aspect-auto sm:rounded-[1.5rem]",
      ].join(" ")}
    >
      <div className={isMatch
        ? "hf-skeleton aspect-[4/3] w-full"
        : "hf-skeleton h-full w-full sm:aspect-[4/3] sm:h-auto"}
      />
      <div className={isMatch
        ? "space-y-3 p-5"
        : "absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-[#102d27]/80 to-transparent p-3 pt-10 sm:relative sm:bg-none sm:p-4 sm:pt-4"}
      >
        <div className="hf-skeleton h-3 w-1/3 rounded-full" />
        <div className={isMatch ? "hf-skeleton h-7 w-2/3 rounded-full" : "hf-skeleton h-5 w-2/3 rounded-full"} />
        <div className={isMatch ? "hf-skeleton h-16 w-full rounded-2xl" : "hf-skeleton hidden h-3 w-full rounded-full sm:block"} />
      </div>
    </div>
  );
}

export default function DogGridSkeleton({ count = 6, label = "Loading adoptable dogs.", variant = "grid" }) {
  const isMatch = variant === "match";

  return (
    <div className="mt-4 sm:mt-6">
      <p role="status" className="sr-only">
        {label}
      </p>
      <div className={isMatch
        ? "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6"
        : "grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"}
      >
        {Array.from({ length: count }).map((_, index) => (
          <SkeletonCard key={index} variant={variant} />
        ))}
      </div>
    </div>
  );
}
