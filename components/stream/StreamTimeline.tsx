'use client';

import { formatTimestamp } from '@/lib/format';

interface StreamTimelineProps {
  startTime: number;
  endTime:   number;
  paused:    boolean;
  pausedAt:  number;
}

/**
 * Horizontal progress timeline for a bounded stream.
 * Returns null for open-ended streams (endTime === 0).
 */
export function StreamTimeline({ startTime, endTime, paused, pausedAt }: StreamTimelineProps) {
  if (endTime === 0) return null;

  const now      = Math.floor(Date.now() / 1000);
  const total    = endTime - startTime;
  const elapsed  = Math.max(Math.min(now - startTime, total), 0);
  const progress = elapsed / total;

  const pausePct = paused
    ? (Math.max(Math.min(pausedAt - startTime, total), 0) / total) * 100
    : null;

  const progressPct = Math.round(progress * 100);

  return (
    <div>
      {/* Bar */}
      <div className="relative h-2 bg-gray-100 dark:bg-gray-800 rounded-full">
        {/* Filled portion */}
        <div
          className="absolute inset-y-0 left-0 bg-black dark:bg-white rounded-full"
          style={{ width: `${progressPct}%` }}
        />

        {/* Pause marker */}
        {pausePct !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-gray-900 border-2 border-gray-400 dark:border-gray-500 rounded-full z-10"
            style={{ left: `${Math.round(pausePct)}%` }}
            title={`Paused at ${formatTimestamp(pausedAt)}`}
          />
        )}

        {/* Current position dot */}
        {progressPct > 0 && progressPct < 100 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-black dark:bg-white rounded-full z-20 ring-2 ring-white dark:ring-gray-900"
            style={{ left: `${progressPct}%` }}
          />
        )}
      </div>

      {/* Labels */}
      <div className="flex justify-between mt-2 text-xs text-gray-400 dark:text-gray-500">
        <span>{formatTimestamp(startTime)}</span>
        <span className="font-semibold text-black dark:text-white">{progressPct}% complete</span>
        <span>{formatTimestamp(endTime)}</span>
      </div>
    </div>
  );
}
