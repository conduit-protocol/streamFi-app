'use client';

/**
 * CountdownTicker — live countdown to a target timestamp (issue #717).
 *
 * Recalculates remaining duration every second without triggering full
 * page re-renders. Uses a self-contained interval so the parent component
 * does not need to manage timers.
 */

import { useState, useEffect, useRef } from 'react';

interface CountdownTickerProps {
  /** Target Unix timestamp in seconds (0 = no end / stream ended). */
  targetTime: number;
  /** Optional CSS class for the container. */
  className?: string;
  /** Show "ended" label when target is in the past. */
  showEndedLabel?: boolean;
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00:00';

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (days > 0) {
    return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function CountdownTicker({
  targetTime,
  className,
  showEndedLabel = true,
}: CountdownTickerProps) {
  const [remaining, setRemaining] = useState<number>(() => {
    if (targetTime <= 0) return 0;
    return Math.max(0, targetTime - Math.floor(Date.now() / 1000));
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (targetTime <= 0) {
      setRemaining(0);
      return;
    }

    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const left = targetTime - now;
      setRemaining(left > 0 ? left : 0);
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [targetTime]);

  if (targetTime <= 0) {
    return (
      <span className={className ?? 'font-mono text-sm text-muted-foreground'}>
        —
      </span>
    );
  }

  if (remaining <= 0 && showEndedLabel) {
    return (
      <span className={className ?? 'font-mono text-sm text-muted-foreground'}>
        Ended
      </span>
    );
  }

  return (
    <span
      className={className ?? 'font-mono text-sm text-foreground'}
      aria-label={`${remaining} seconds remaining`}
      role="timer"
    >
      {formatDuration(remaining)}
    </span>
  );
}
