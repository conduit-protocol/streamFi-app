'use client';

import { useEffect, useRef, useState } from 'react';
import * as soroban from '@/lib/soroban';
import { type CircuitBreakerState } from '@/lib/soroban';

/**
 * Dev-only overlay that surfaces per-endpoint circuit-breaker state.
 *
 * Helps debug RPC flakiness by showing which scopes have tripped the breaker
 * and how long they remain open. Shows an animated countdown ring until the
 * next automatic retry attempt and automatically tests the circuit upon expiry.
 * Only renders in development builds.
 */
export function CircuitBreakerOverlay() {
  const [states, setStates] = useState<CircuitBreakerState[]>([]);
  const [mounted, setMounted] = useState(false);
  const testedScopesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
    const update = () => {
      const currentStates = soroban.getCircuitBreakerStates();
      currentStates.forEach((s) => {
        if (s.isOpen && s.remainingMs <= 1000 && !testedScopesRef.current.has(s.scope)) {
          testedScopesRef.current.add(s.scope);
          if (typeof soroban.testCircuit === 'function') {
            soroban.testCircuit(s.scope).finally(() => {
              setStates(soroban.getCircuitBreakerStates());
            });
          } else if (typeof soroban.isCircuitOpen === 'function') {
            soroban.isCircuitOpen(s.scope);
            setStates(soroban.getCircuitBreakerStates());
          }
        } else if (!s.isOpen) {
          testedScopesRef.current.delete(s.scope);
        }
      });
      setStates(currentStates);
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted || states.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-yellow-400/50 bg-yellow-50 p-3 text-xs shadow-lg dark:border-yellow-600/50 dark:bg-yellow-950/90 dark:text-yellow-100">
      <div className="mb-2 font-semibold">Circuit Breaker Monitor</div>
      <p className="mb-2 text-[11px] opacity-80">
        Some actions are paused while the network recovers. They resume automatically.
      </p>
      <ul className="space-y-1.5">
        {states.map((s) => {
          const seconds = Math.ceil(s.remainingMs / 1000);
          return (
            <li
              key={s.scope}
              className="flex flex-col gap-1 border-b border-yellow-200/50 pb-1.5 last:border-b-0 last:pb-0 dark:border-yellow-800/50"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="truncate font-mono" title={s.scope}>
                  {s.scope}
                </span>
                <span
                  className={
                    s.isOpen
                      ? 'font-bold text-red-600 dark:text-red-400'
                      : 'text-green-700 dark:text-green-400'
                  }
                >
                  {s.isOpen
                    ? `OPEN (${seconds}s)`
                    : `closed (${s.consecutiveFailures})`}
                </span>
              </div>
              {s.isOpen && (
                <div
                  className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400"
                  aria-live="polite"
                >
                  <svg
                    className="h-3.5 w-3.5 -rotate-90 transform shrink-0 animate-spin"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      className="opacity-20"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      strokeDasharray={56.5}
                      strokeDashoffset={
                        56.5 * (1 - Math.max(0, Math.min(1, s.remainingMs / 30000)))
                      }
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <span>Retrying in {seconds}s...</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
