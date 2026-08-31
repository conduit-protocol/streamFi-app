'use client';

import { useEffect, useState } from 'react';
import { getCircuitBreakerStates } from '@/lib/soroban';

interface CircuitBreakerState {
  scope: string;
  consecutiveFailures: number;
  circuitOpenUntil: number;
  isOpen: boolean;
  remainingMs: number;
}

/**
 * Dev-only overlay that surfaces per-endpoint circuit-breaker state.
 *
 * Helps debug RPC flakiness by showing which scopes have tripped the breaker
 * and how long they remain open. Only renders in development builds.
 */
export function CircuitBreakerOverlay() {
  const [states, setStates] = useState<CircuitBreakerState[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const update = () => setStates(getCircuitBreakerStates());
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted || states.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-yellow-400/50 bg-yellow-50 p-3 text-xs shadow-lg dark:border-yellow-600/50 dark:bg-yellow-950/90 dark:text-yellow-100">
      <div className="mb-2 font-semibold">Circuit Breaker Monitor</div>
      <ul className="space-y-1">
        {states.map((s) => (
          <li key={s.scope} className="flex items-center justify-between gap-4">
            <span className="truncate font-mono" title={s.scope}>
              {s.scope}
            </span>
            <span className={s.isOpen ? 'font-bold text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}>
              {s.isOpen
                ? `OPEN (${Math.ceil(s.remainingMs / 1000)}s)`,
                : `closed (${s.consecutiveFailures})`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
