'use client';

import { useEffect, useRef, useState } from 'react';
import { fromStroops } from '@/lib/format';

interface RateTickerProps {
  /** Rate in stroops per second */
  ratePerSecond: bigint;
  /** Current withdrawable balance in stroops (fetched from contract) */
  startBalance: bigint;
  /** Unix timestamp when accrual stops; 0 means no fixed end */
  endTime: number;
  /** Decimal places to display (default: 7 for XLM) */
  decimals?: number;
  /** Unix timestamp when the stream ends (0 = open-ended). Ticker freezes past this. */
  endTime?: number;
}

/**
 * Live-updating balance counter.
 * Increments every 100ms based on ratePerSecond without any contract calls.
 * Freezes at endTime so the ticker doesn't overshoot the contract balance (#398).
 */
export function RateTicker({ ratePerSecond, startBalance, endTime, decimals = 7 }: RateTickerProps) {
  const startRef  = useRef<{ ts: number; balance: bigint }>({
    ts:      Date.now(),
    balance: startBalance,
  });

  const [display, setDisplay] = useState(fromStroops(startBalance, decimals));

  useEffect(() => {
    startRef.current = { ts: Date.now(), balance: startBalance };
  }, [startBalance]);

  useEffect(() => {
    const update = () => {
      const now = endTime > 0 ? Math.min(Date.now(), endTime * 1000) : Date.now();
      const elapsed = BigInt(Math.max(0, Math.floor((now - startRef.current.ts) / 1000)));
      const current = startRef.current.balance + elapsed * ratePerSecond;
      setDisplay(fromStroops(current, decimals));
    };

    update();
    if (endTime > 0 && Date.now() >= endTime * 1000) return;

    const id = setInterval(() => {
      update();
      if (endTime > 0 && Date.now() >= endTime * 1000) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [ratePerSecond, endTime, decimals]);

  return (
    <span className="amount" suppressHydrationWarning>
      {display}
    </span>
  );
}
