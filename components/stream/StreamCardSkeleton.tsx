/**
 * StreamCardSkeleton
 *
 * Placeholder that mirrors the exact layout of StreamCard while data loads.
 * Uses Tailwind's `animate-pulse` to signal pending state without CLS.
 *
 * Usage:
 *   {loading && Array.from({ length: 3 }).map((_, i) => <StreamCardSkeleton key={i} />)}
 */
export function StreamCardSkeleton() {
  return (
    <div
      className="card animate-pulse"
      aria-hidden="true"
      role="presentation"
    >
      {/* ── Top row: counterparty | rate | badge ── */}
      <div className="flex items-center justify-between gap-2 mb-3">
        {/* Counterparty block */}
        <div className="min-w-0 flex flex-col gap-1">
          {/* "From / To" label */}
          <div className="h-2.5 w-6 rounded bg-gray-200 dark:bg-gray-700" />
          {/* Truncated address */}
          <div className="h-3 w-28 rounded bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* Rate — centred */}
        <div className="flex-1 flex justify-center px-1">
          <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* Badge */}
        <div className="shrink-0 h-5 w-14 rounded bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* ── Progress bar strip ── */}
      <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700" />

      {/* ── Footer row: token address | percentage ── */}
      <div className="flex items-center justify-between mt-3">
        <div className="h-2.5 w-36 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-2.5 w-6 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}
