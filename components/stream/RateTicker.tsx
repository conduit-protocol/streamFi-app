'use client';

import { useEffect, useRef, useState } from 'react';
import { fromStroops } from '@/lib/format';

interface RateTickerProps {
  /** Rate in stroops per second */
  ratePerSecond: bigint;
  /** Current withdrawable balance in stroops (fetched from contract) */
  startBalance: bigint;
  /** Unix timestamp when the stream ends (0 = open-ended). Ticker freezes past this (#398). */
  endTime: number;
  /** Decimal places to display (default: 7 for XLM) */
  decimals?: number;
  /** Milestone threshold in stroops for audio chime (e.g., 10000 stroops = 0.001 XLM) */
  milestoneThreshold?: bigint;
  /** Enable audio chime on milestone */
  enableAudioChime?: boolean;
}

/**
 * Live-updating balance counter.
 * Increments every 100ms based on ratePerSecond without any contract calls.
 * Freezes at endTime so the ticker doesn't overshoot the contract balance (#398).
 * Optionally plays audio chimes at milestone thresholds.
 */
export function RateTicker({
  ratePerSecond,
  startBalance,
  endTime,
  decimals = 7,
  milestoneThreshold,
  enableAudioChime = false,
}: RateTickerProps) {
  const startRef = useRef<{ ts: number; balance: bigint }>({
    ts: Date.now(),
    balance: startBalance,
  });

  const milestonePassed = useRef<Set<bigint>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);

  const [display, setDisplay] = useState(fromStroops(startBalance, decimals));
  const [audioEnabled, setAudioEnabled] = useState(enableAudioChime);

  useEffect(() => {
    startRef.current = { ts: Date.now(), balance: startBalance };
    milestonePassed.current.clear();
  }, [startBalance]);

  const playChime = () => {
    if (!enableAudioChime || !audioEnabled) return;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.value = 800;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {
      console.debug('Audio context unavailable:', e);
    }
  };

  useEffect(() => {
    const update = () => {
      const now = endTime > 0 ? Math.min(Date.now(), endTime * 1000) : Date.now();
      const elapsed = BigInt(Math.max(0, Math.floor((now - startRef.current.ts) / 1000)));
      const current = startRef.current.balance + elapsed * ratePerSecond;

      if (
        milestoneThreshold &&
        enableAudioChime &&
        audioEnabled &&
        current > 0n
      ) {
        const milestoneMark = (current / milestoneThreshold) * milestoneThreshold;
        if (!milestonePassed.current.has(milestoneMark) && milestoneMark > 0n) {
          milestonePassed.current.add(milestoneMark);
          playChime();
        }
      }

      setDisplay(fromStroops(current, decimals));
    };

    update();
    if (endTime > 0 && Date.now() >= endTime * 1000) return;

    let id: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (id !== undefined) {
        clearInterval(id);
        id = undefined;
      }
    };
    const start = () => {
      if (id !== undefined) return;
      id = setInterval(() => {
        update();
        if (endTime > 0 && Date.now() >= endTime * 1000) stop();
      }, 100);
    };
    // Pause while the tab is hidden; resync immediately on becoming visible (#596).
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        update();
        if (!(endTime > 0 && Date.now() >= endTime * 1000)) start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ratePerSecond, endTime, decimals, milestoneThreshold, enableAudioChime, audioEnabled]);

  if (!enableAudioChime) {
    return (
      <span className="amount" suppressHydrationWarning>
        {display}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="amount" suppressHydrationWarning>
        {display}
      </span>
      <button
        onClick={() => setAudioEnabled(!audioEnabled)}
        className="inline-flex items-center justify-center w-5 h-5 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        title={audioEnabled ? 'Disable audio chime' : 'Enable audio chime'}
        aria-label={audioEnabled ? 'Audio chime enabled' : 'Audio chime disabled'}
      >
        {audioEnabled ? '🔊' : '🔇'}
      </button>
    </span>
  );
}
