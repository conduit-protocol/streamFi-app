'use client';

import { useEffect, useState } from 'react';
import { getRpcUrl } from '@/lib/env';

interface LatencyState {
  latencyMs: number | null;
  ledgerHeight: number | null;
  status: 'green' | 'amber' | 'neutral' | 'offline' | 'loading';
}

export function NetworkLatencyIndicator() {
  const [state, setState] = useState<LatencyState>({
    latencyMs: null,
    ledgerHeight: null,
    status: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    let abortController: AbortController | null = null;

    const checkLatency = async () => {
      let rpcUrl = '';
      try {
        rpcUrl = getRpcUrl();
      } catch {
        return;
      }
      if (!rpcUrl) return;

      abortController = new AbortController();
      const started = typeof performance !== 'undefined' ? performance.now() : Date.now();

      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' }),
          signal: abortController.signal,
        });
        const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const latencyMs = Math.round(ended - started);

        let ledgerHeight: number | null = null;
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (typeof data?.result?.sequence === 'number') {
            ledgerHeight = data.result.sequence;
          }
        }

        if (cancelled) return;

        let status: LatencyState['status'] = 'neutral';
        if (latencyMs < 500) {
          status = 'green';
        } else if (latencyMs > 2000) {
          status = 'amber';
        }

        setState({ latencyMs, ledgerHeight, status });
      } catch {
        if (cancelled) return;
        setState({ latencyMs: null, ledgerHeight: null, status: 'offline' });
      }
    };

    checkLatency();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      checkLatency();
    }, 10_000);

    return () => {
      cancelled = true;
      if (abortController) abortController.abort();
      clearInterval(interval);
    };
  }, []);

  if (state.status === 'loading') {
    return null;
  }

  const colorStyles = {
    green:
      'border-green-300 bg-green-50 text-green-700 dark:border-green-800/60 dark:bg-green-950/40 dark:text-green-400',
    amber:
      'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-400',
    neutral:
      'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300',
    offline:
      'border-red-300 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-400',
  }[state.status];

  const dotColors = {
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    neutral: 'bg-yellow-500',
    offline: 'bg-red-500',
  }[state.status];

  const tooltip =
    state.status === 'offline'
      ? 'RPC unreachable'
      : state.ledgerHeight
        ? `Latency: ${state.latencyMs}ms | Ledger #${state.ledgerHeight}`
        : `Latency: ${state.latencyMs}ms`;

  return (
    <span
      className={`latency-pill inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium transition-colors ${colorStyles}`}
      title={tooltip}
      aria-label={tooltip}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColors}`}
        aria-hidden="true"
      />
      {state.status === 'offline' ? (
        <span>offline</span>
      ) : (
        <>
          <span>{state.latencyMs}ms</span>
          {state.ledgerHeight ? (
            <span className="opacity-60">#{state.ledgerHeight}</span>
          ) : null}
        </>
      )}
    </span>
  );
}
