// src/components/DogGridSkeleton.jsx

// Branded loading placeholder that roughly matches DogCard's grid-variant
// dimensions, so content doesn't jump when real cards swap in. The status
// text is announced once via aria-live rather than per-skeleton-card.
function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-square overflow-hidden rounded-2xl border border-[#183D35]/10 bg-white sm:aspect-auto sm:rounded-[1.5rem]"
    >
      <div className="hf-skeleton h-full w-full sm:aspect-[4/3] sm:h-auto" />
      <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-[#102d27]/80 to-transparent p-3 pt-10 sm:relative sm:bg-none sm:p-4 sm:pt-4">
        <div className="hf-skeleton h-3 w-1/3 rounded-full" />
        <div className="hf-skeleton h-5 w-2/3 rounded-full" />
        <div className="hf-skeleton hidden h-3 w-full rounded-full sm:block" />
      </div>
    </div>
  );
}

export default function DogGridSkeleton({ count = 6, label = "Loading adoptable dogs." }) {
  return (
    <div className="mt-4 sm:mt-6">
      <p role="status" className="sr-only">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    </div>
  );
}
