'use client';

import { useEffect, useRef, useState } from 'react';
import { fromStroops } from '@/lib/format';

interface RateTickerProps {
  /** Rate in stroops per second */
  ratePerSecond: bigint;
  /** Current withdrawable balance in stroops (fetched from contract) */
  startBalance: bigint;
  /** Decimal places to display (default: 7 for XLM) */
  decimals?: number;
}

/**
 * Live-updating balance counter.
 * Increments every 100ms based on ratePerSecond without any contract calls.
 */
export function RateTicker({ ratePerSecond, startBalance, decimals = 7 }: RateTickerProps) {
  const startRef  = useRef<{ ts: number; balance: bigint }>({
    ts:      Date.now(),
    balance: startBalance,
  });

  const [display, setDisplay] = useState(fromStroops(startBalance, decimals));

  useEffect(() => {
    startRef.current = { ts: Date.now(), balance: startBalance };
  }, [startBalance]);

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = BigInt(Math.floor((Date.now() - startRef.current.ts) / 1000));
      const current = startRef.current.balance + elapsed * ratePerSecond;
      setDisplay(fromStroops(current, decimals));
    }, 100);
    return () => clearInterval(id);
  }, [ratePerSecond, decimals]);

  return (
    <span className="amount" aria-live="polite" aria-atomic="true">
      {display}
    </span>
  );
}
