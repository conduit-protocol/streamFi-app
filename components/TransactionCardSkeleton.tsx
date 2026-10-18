/**
 * TransactionCardSkeleton
 *
 * Placeholder that mirrors the layout of a transaction row while data loads.
 * Uses Tailwind's `animate-pulse` to signal pending state without CLS.
 */
export function TransactionCardSkeleton() {
  return (
    <div className="card !p-0 animate-pulse" aria-hidden="true" role="presentation">
      {/* Mobile row skeleton */}
      <div className="sm:hidden flex items-center justify-between py-4 px-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="space-y-1.5">
            <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-2.5 w-32 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
        <div className="space-y-1.5 flex flex-col items-end">
          <div className="h-3.5 w-20 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-2.5 w-16 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>

      {/* Desktop table skeleton */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="py-2.5 px-4 text-left"><div className="h-2.5 w-12 rounded bg-gray-200 dark:bg-gray-700" /></th>
              <th className="py-2.5 px-4 text-right"><div className="h-2.5 w-14 rounded bg-gray-200 dark:bg-gray-700 ml-auto" /></th>
              <th className="py-2.5 px-4 text-right"><div className="h-2.5 w-10 rounded bg-gray-200 dark:bg-gray-700 ml-auto" /></th>
              <th className="py-2.5 px-4 text-center"><div className="h-2.5 w-12 rounded bg-gray-200 dark:bg-gray-700 mx-auto" /></th>
              <th className="py-2.5 px-4 text-right"><div className="h-2.5 w-16 rounded bg-gray-200 dark:bg-gray-700 ml-auto" /></th>
              <th className="py-2.5 px-4 text-right"><div className="h-2.5 w-20 rounded bg-gray-200 dark:bg-gray-700 ml-auto" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                <td className="py-2.5 px-4"><div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" /></td>
                <td className="py-2.5 px-4 text-right"><div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700 ml-auto" /></td>
                <td className="py-2.5 px-4 text-right"><div className="h-3 w-12 rounded bg-gray-200 dark:bg-gray-700 ml-auto" /></td>
                <td className="py-2.5 px-4 text-center"><div className="h-4 w-14 rounded bg-gray-200 dark:bg-gray-700 mx-auto" /></td>
                <td className="py-2.5 px-4 text-right"><div className="h-2.5 w-16 rounded bg-gray-200 dark:bg-gray-700 ml-auto" /></td>
                <td className="py-2.5 px-4 text-right"><div className="h-2.5 w-20 rounded bg-gray-200 dark:bg-gray-700 ml-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
