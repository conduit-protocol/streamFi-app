'use client';

import { useEffect, useState } from 'react';
import { getRpcUrl } from '@/lib/env';
import { Tooltip } from './ui/Tooltip';

interface LatencyState {
  latencyMs: number | null;
  ledgerHeight: number | null;
  status: 'green' | 'amber' | 'neutral' | 'offline' | 'loading';
  /** Host:port of the probed endpoint — shown in the tooltip (#796). */
  endpoint: string | null;
  /** Epoch ms of the most recent probe, success or failure (#796). */
  lastCheckedAt: number | null;
}

/** Host:port of the probed URL so the tooltip can say exactly which
 *  endpoint the round-trip timing was measured against (#796). */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function NetworkLatencyIndicator() {
  const [state, setState] = useState<LatencyState>({
    latencyMs: null,
    ledgerHeight: null,
    status: 'loading',
    endpoint: null,
    lastCheckedAt: null,
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
      const started = Date.now();

      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' }),
          signal: abortController.signal,
        });
        const ended = Date.now();
        const latencyMs = Math.max(0, Math.round(ended - started));

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

        setState({
          latencyMs,
          ledgerHeight,
          status,
          endpoint: hostOf(rpcUrl),
          lastCheckedAt: Date.now(),
        });
      } catch {
        if (cancelled) return;
        setState({
          latencyMs: null,
          ledgerHeight: null,
          status: 'offline',
          endpoint: hostOf(rpcUrl),
          lastCheckedAt: Date.now(),
        });
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

  const tooltipContent =
    state.status === 'offline' ? (
      'RPC unreachable'
    ) : (
      <div className="space-y-1">
        <div>Horizon RPC Response</div>
        <div className="font-mono text-xs opacity-90">{state.latencyMs}ms</div>
        {state.ledgerHeight && (
          <div className="text-xs opacity-90">Ledger #{state.ledgerHeight}</div>
        )}
      </div>
    );

  return (
    // `group` + focusable pill so the detailed tooltip (#796) is revealed on
    // hover and on keyboard focus — the native title attribute alone gave no
    // room for the numeric round-trip metrics engineers need.
    <span className="relative group inline-block">
      <span
        className={`latency-pill inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium transition-colors ${colorStyles}`}
        tabIndex={0}
        aria-label={tooltip}
        data-testid="network-latency-pill"
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
      <span
        role="tooltip"
        data-testid="network-latency-tooltip"
        className="invisible absolute left-0 top-full z-50 mt-1.5 w-60 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2.5 text-left text-[11px] font-normal normal-case leading-relaxed text-gray-600 shadow-lg opacity-0 transition-opacity dark:text-gray-300 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <span className="block font-semibold text-black dark:text-white">
          {state.status === 'offline'
            ? 'Horizon RPC unreachable'
            : `Horizon RPC response time: ${state.latencyMs} ms`}
        </span>
        {state.endpoint && (
          <span className="mt-1 block break-all">Endpoint: {state.endpoint}</span>
        )}
        {state.ledgerHeight !== null && (
          <span className="block">Ledger: #{state.ledgerHeight}</span>
        )}
        {state.lastCheckedAt !== null && (
          <span className="block">
            Last checked: {new Date(state.lastCheckedAt).toLocaleTimeString()}
          </span>
        )}
        <span className="mt-1 block text-gray-400 dark:text-gray-500">
          Healthy &lt; 500 ms · Slow &gt; 2000 ms · Polled every 10 s
        </span>
      </span>
    </span>
  );
}
