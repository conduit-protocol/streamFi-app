/**
 * ProfileSkeleton
 *
 * Placeholder that mirrors the layout of the connected profile view while
 * data loads. Uses Tailwind's `animate-pulse` to signal pending state without CLS.
 */
export function ProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 animate-pulse" aria-hidden="true" role="presentation">
      {/* Page heading */}
      <div className="h-8 w-32 rounded bg-gray-200 dark:bg-gray-700 mb-8" />

      {/* Wallet card */}
      <div className="card mb-6">
        <div className="h-2.5 w-16 rounded bg-gray-200 dark:bg-gray-700 mb-4" />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="flex items-center justify-between">
            <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2">
              <div className="h-5 w-28 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-5 w-5 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick links card */}
      <div className="card">
        <div className="h-2.5 w-20 rounded bg-gray-200 dark:bg-gray-700 mb-4" />
        <div className="space-y-2">
          <div className="h-9 w-full rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-9 w-full rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-9 w-full rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  );
}
