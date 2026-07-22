'use client';

/**
 * StreamProgressBar
 *
 * A zero-React-state progress bar for live token streams.
 *
 * Instead of firing React state updates every 100 ms (which re-renders every
 * StreamCard in the list), this component uses a single CSS `@keyframes`
 * animation that the browser compositor runs entirely off the main thread.
 *
 * How it works
 * ─────────────
 * 1. Total duration  = endTime – startTime  (in seconds / milliseconds for CSS)
 * 2. Elapsed time    = now – startTime
 * 3. We set  `animation-duration: <totalDuration>ms`
 *    and     `animation-delay:    -<elapsedMs>ms`
 *
 * A negative animation-delay makes the animation start "already in progress"
 * at exactly the right position with no JavaScript tick loop at all.
 *
 * For paused / ended / cancelled streams the bar is static (no animation).
 */

import { useRef, useEffect } from 'react';

interface StreamProgressBarProps {
  /** Unix timestamp (seconds) when the stream started */
  startTime: number;
  /** Unix timestamp (seconds) when the stream ends (0 = open-ended) */
  endTime: number;
  /** Current stream status */
  status: 'active' | 'paused' | 'ended' | 'cancelled';
  /** aria-label for screen readers */
  label?: string;
}

export function StreamProgressBar({
  startTime,
  endTime,
  status,
  label,
}: StreamProgressBarProps) {
  const fillRef = useRef<HTMLDivElement>(null);

  // Derive a stable snapshot of the bar's position at mount time.
  // We never call setState — the DOM ref carries the animation forward.
  useEffect(() => {
    const el = fillRef.current;
    if (!el) return;

    const nowMs       = Date.now();
    const startMs     = startTime * 1_000;
    const endMs       = endTime   * 1_000;

    // Open-ended stream or invalid times — show indeterminate / no progress
    const isOpenEnded = endTime === 0 || endMs <= startMs;

    if (isOpenEnded) {
      el.style.width     = '0%';
      el.style.animation = 'none';
      return;
    }

    const totalDurationMs = endMs - startMs;
    const elapsedMs       = Math.max(0, nowMs - startMs);

    // Clamp for ended streams — show full bar, static
    if (status === 'ended' || status === 'cancelled') {
      el.style.width     = status === 'ended' ? '100%' : `${Math.min(100, (elapsedMs / totalDurationMs) * 100).toFixed(2)}%`;
      el.style.animation = 'none';
      return;
    }

    // Paused — freeze at current position, no animation
    if (status === 'paused') {
      const frozenPct = Math.min(100, (elapsedMs / totalDurationMs) * 100);
      el.style.width     = `${frozenPct.toFixed(2)}%`;
      el.style.animation = 'none';
      return;
    }

    // Active — drive via CSS animation, no JS ticks
    // Negative delay positions the animation mid-playback at the correct point.
    el.style.width              = 'auto'; // let the animation control width
    el.style.animationName      = 'stream-progress-fill';
    el.style.animationDuration  = `${totalDurationMs}ms`;
    el.style.animationDelay     = `-${elapsedMs}ms`;
    el.style.animationTimingFunction = 'linear';
    el.style.animationFillMode  = 'forwards';
    el.style.animationPlayState = 'running';
    el.style.animationIterationCount = '1';
  }, [startTime, endTime, status]);

  // Derive aria value for accessibility (computed once on render, not on tick)
  const nowSec     = Math.floor(Date.now() / 1_000);
  const totalSec   = endTime > 0 ? endTime - startTime : 0;
  const elapsedSec = totalSec > 0 ? Math.max(0, nowSec - startTime) : 0;
  const ariaNow    = totalSec > 0 ? Math.min(100, Math.round((elapsedSec / totalSec) * 100)) : 0;

  return (
    <>
      {/*
        The keyframe is injected once as a global style tag.
        It lives in the <head> only while this component is mounted.
        The animation simply widens from 0% → 100%.
      */}
      <style>{`
        @keyframes stream-progress-fill {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>

      <div
        role="progressbar"
        aria-valuenow={ariaNow}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `${ariaNow}% complete`}
        className="relative h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"
      >
        <div
          ref={fillRef}
          className="absolute inset-y-0 left-0 bg-black dark:bg-white rounded-full will-change-[width]"
          /* Initial inline style prevents a flash of 0% before useEffect fires */
          style={{
            width: (() => {
              if (endTime === 0) return '0%';
              const t = (Date.now() / 1_000 - startTime) / (endTime - startTime);
              return `${Math.min(100, Math.max(0, t * 100)).toFixed(2)}%`;
            })(),
          }}
        />
      </div>
    </>
  );
}
