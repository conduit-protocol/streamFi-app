'use client';

import { useState } from 'react';
import { WifiOff, X } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

/**
 * A single dismissible banner shown while the Soroban RPC is unreachable or the
 * circuit breaker is open. Pages defer their own per-card error states to this
 * banner (see `useNetworkStatus`), so the user sees one clear message instead
 * of a wall of identical "failed to load" cards.
 *
 * Dismissal is scoped to the current outage: if the network recovers and later
 * fails again, the banner returns.
 */
export function NetworkTroubleBanner() {
  const { status, episode } = useNetworkStatus();
  const [dismissedEpisode, setDismissedEpisode] = useState<number | null>(null);

  if (status !== 'trouble' || dismissedEpisode === episode) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="
        fixed top-16 inset-x-0 z-40 flex justify-center px-4 pointer-events-none
      "
    >
      <div
        className="
          pointer-events-auto flex items-center gap-3 max-w-2xl w-full
          bg-gray-900 dark:bg-gray-100 text-white dark:text-black
          border border-gray-700 dark:border-gray-300
          rounded-lg px-4 py-2.5 text-sm shadow-lg
        "
      >
        <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
        <p className="flex-1">
          Having trouble reaching the network. Showing the most recent data we
          loaded — it may be out of date.
        </p>
        <button
          type="button"
          onClick={() => setDismissedEpisode(episode)}
          aria-label="Dismiss network trouble notice"
          className="
            shrink-0 -mr-1 p-1 rounded
            hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors
          "
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
