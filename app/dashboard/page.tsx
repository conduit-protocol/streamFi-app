"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, AlertCircle, RefreshCw } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { StreamCard } from "@/components/stream/StreamCard";
import { StreamCardSkeleton } from "@/components/stream/StreamCardSkeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BulkWithdrawButton } from "@/components/stream/BulkWithdrawButton";
import { streamsBySender, streamsByRecipient } from "@/lib/factory";
import { getStreamAddress, getStreamInfo, getWithdrawable, type StreamInfo } from '@/lib/stream';
import { fromStroops } from "@/lib/format";
import { refreshStreamData } from "@/lib/queryClient";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { isFulfilled } from "@/lib/safe-operations";

type Tab = "receiving" | "sending";
type StreamStatus = "active" | "paused" | "ended" | "cancelled";

interface StreamRow {
  id: string;
  address: string;
  info: StreamInfo;
  withdrawable: bigint;
  status: StreamStatus;
}

function deriveStatus(info: StreamInfo, now: number): StreamStatus {
  if (info.cancelled) return "cancelled";
  if (info.paused) return "paused";
  if (info.endTime > 0 && now >= info.endTime) return "ended";
  return "active";
}

interface LoadRowsResult {
  rows: StreamRow[];
  failedCount: number;
}

async function loadRows(
  publicKey: string,
  role: "sender" | "recipient",
  now: number,
  signal: AbortSignal,
): Promise<LoadRowsResult> {
  let ids: bigint[];
  try {
    ids =
      role === "sender"
        ? await streamsBySender(publicKey, publicKey, 0, 50, { signal })
        : await streamsByRecipient(publicKey, publicKey, 0, 50, { signal });
  } catch {
    return { rows: [], failedCount: 0 };
  }

  if (!ids || !Array.isArray(ids)) return { rows: [], failedCount: 0 };

  const uniqueIds = [...new Set(ids.filter((id): id is bigint => typeof id === "bigint"))];

  // Phase 1: resolve all stream addresses in parallel
  const addrResults = await Promise.allSettled(
    uniqueIds.map((id) => getStreamAddress(publicKey, id, { signal })),
  );

  const addrPairs: { id: bigint; rowId: string; addr: string }[] = [];
  let failedCount = 0;
  for (let i = 0; i < uniqueIds.length; i++) {
    const r = addrResults[i];
    if (signal.aborted) return { rows: [], failedCount: 0 };
    if (isFulfilled(r) && r.value && typeof r.value === "string") {
      addrPairs.push({ id: uniqueIds[i]!, rowId: uniqueIds[i]!.toString(), addr: r.value });
    } else {
      failedCount++;
    }
  }

  // Phase 2: fetch info+withdrawable in bounded-parallel batches
  const BATCH_SIZE = 5;
  const rows: StreamRow[] = [];

  for (let start = 0; start < addrPairs.length; start += BATCH_SIZE) {
    if (signal.aborted) return { rows: [], failedCount: 0 };
    const batch = addrPairs.slice(start, start + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(({ addr }) =>
        Promise.all([
          getStreamInfo(publicKey, addr, { signal }),
          getWithdrawable(publicKey, addr, { signal }),
        ]),
      ),
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const pair = batch[j]!;
      if (
        isFulfilled(r) &&
        r.value[0] &&
        typeof r.value[0] === "object" &&
        typeof r.value[0].ratePerSecond === "bigint"
      ) {
        rows.push({
          id: pair.rowId,
          address: pair.addr,
          info: r.value[0],
          withdrawable: r.value[1],
          status: deriveStatus(r.value[0], now),
        });
      } else {
        failedCount++;
      }
    }
  }

  return { rows, failedCount };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  // When the RPC is unreachable, a global banner (NetworkTroubleBanner)
  // already explains the situation — suppress the per-page error card and the
  // partial-load bar so the user isn't told the same thing twice.
  const { status: networkStatus } = useNetworkStatus();
  const networkTrouble = networkStatus === "trouble";

  const [tab, setTab] = useState<Tab>("receiving");
  const [receiving, setReceiving] = useState<StreamRow[]>([]);
  const [sending, setSending] = useState<StreamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  // #307 — loadSeqRef is the ordering guard: each fetch captures its own
  // seq and only commits state if it's still the most recent request by the
  // time it resolves, the same pattern app/stream/[id]/page.tsx uses.
  // activeControllerRef tracks whichever AbortController is currently "the"
  // in-flight fetch so every trigger (mount, visibility change, retry,
  // bulk-withdraw completion) aborts the previous one before starting a new
  // one, instead of each site spinning up its own untracked controller.
  const loadSeqRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const lastFetchAtRef = useRef(0);
  // Guards the manual refresh controls: while a fetch is in flight, extra
  // clicks are ignored rather than piling up overlapping requests.
  const inFlightRef = useRef(false);

  const fetchStreams = useCallback(async (signal: AbortSignal) => {
    if (!publicKey) return;
    inFlightRef.current = true;
    const seq = ++loadSeqRef.current;
    const isCurrent = () => seq === loadSeqRef.current;
    const now = Math.floor(Date.now() / 1000);
    setLoading(true);
    // The previous error / partial-load notices stay on screen (with their
    // Retry control disabled) until this refresh settles, rather than blinking
    // out and back — the `loading` flag is what signals work is in progress.
    try {
      const [recv, sent] = await Promise.all([
        loadRows(publicKey, "recipient", now, signal),
        loadRows(publicKey, "sender", now, signal),
      ]);
      if (!signal.aborted && isCurrent()) {
        setReceiving(recv.rows);
        setSending(sent.rows);
        const totalFailed = recv.failedCount + sent.failedCount;
        setPartialError(
          totalFailed > 0
            ? `${totalFailed} stream${totalFailed === 1 ? "" : "s"} couldn\u2019t load`
            : null,
        );
        setError(null);
        lastFetchAtRef.current = Date.now();
      }
    } catch (e) {
      if (!signal.aborted && isCurrent()) {
        console.error(e); captureError(e, { tags: { source: 'dashboard-page' } });
        setError("Failed to load streams. Please try again.");
      }
    } finally {
      // Only the most recent fetch clears the in-flight latch — an older,
      // superseded fetch resolving late must not re-open the gate.
      if (isCurrent()) {
        inFlightRef.current = false;
        if (!signal.aborted) setLoading(false);
      }
    }
  }, [publicKey]);

  const refetch = useCallback((force = false) => {
    // Ignore manual triggers while a refresh is already running. `force` is
    // for callers that must always re-read (wallet switch, post-withdraw).
    if (!force && inFlightRef.current) return;
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    fetchStreams(controller.signal);
  }, [fetchStreams]);

  useEffect(() => {
    if (!publicKey) {
      setReceiving([]);
      setSending([]);
      setError(null);
      setPartialError(null);
      return;
    }
    refetch(true);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Skip refetch if the last fetch was less than 5s ago
        if (Date.now() - lastFetchAtRef.current < 5_000) return;
        refetch();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      activeControllerRef.current?.abort();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [publicKey, refetch]);

  const activeCount = useMemo(
    () =>
      [...receiving, ...sending].filter((s) => s.status === "active").length,
    [receiving, sending],
  );
  const receivingRate = useMemo(
    () =>
      receiving
        .filter((s) => s.status === "active" && s.info && typeof s.info.ratePerSecond === "bigint")
        .reduce((a, s) => a + s.info.ratePerSecond, 0n),
    [receiving],
  );
  const totalWithdrawn = useMemo(
    () =>
      receiving
        .filter((s) => s.info && typeof s.info.withdrawn === "bigint")
        .reduce((a, s) => a + s.info.withdrawn, 0n),
    [receiving],
  );
  const senderCount = useMemo(
    () =>
      new Set(
        receiving.filter((s) => s.info?.sender).map((s) => s.info.sender),
      ).size,
    [receiving],
  );

  const displayed = tab === "receiving" ? receiving : sending;

  const STATS = [
    { label: "Active streams", value: loading ? "…" : error ? "—" : String(activeCount) },
    {
      label: "Receiving /s",
      value: loading ? "…" : error ? "—" : fromStroops(receivingRate),
    },
    {
      label: "Total received",
      value: loading ? "…" : error ? "—" : fromStroops(totalWithdrawn),
    },
    { label: "Senders", value: loading ? "…" : error ? "—" : String(senderCount) },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black tracking-tight">Dashboard</h1>
        {connected && (
          <Link href="/create" className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> New stream
          </Link>
        )}
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {STATS.map((s) => (
          <div key={s.label} className="card">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
              {s.label}
            </p>
            <p
              className={[
                "text-2xl font-black font-mono",
                !connected || loading
                  ? "text-gray-300 dark:text-gray-600"
                  : "text-black dark:text-white",
              ].join(" ")}
            >
              {connected ? s.value : "—"}
            </p>
          </div>
        ))}
      </div>

      {error && !networkTrouble && (
        <div className="card text-center py-4 mb-6 text-sm text-gray-600 dark:text-gray-400">
          {error}
        </div>
      )}

      {partialError && !error && !networkTrouble && (
        <div
          role="alert"
          aria-live="polite"
          className="card text-center py-3 mb-6 text-sm text-gray-600 dark:text-gray-400 flex items-center justify-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{partialError} &mdash;</span>
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="underline font-semibold hover:text-black dark:hover:text-white disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
          >
            {loading ? "Retrying\u2026" : "retry"}
          </button>
        </div>
      )}

      {!connected ? (
        <div className="card text-center py-12 text-sm text-gray-400 dark:text-gray-500">
          Connect your wallet to see your streams.
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-6">
            {(["receiving", "sending"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={[
                  "px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors",
                  tab === t
                    ? "border-black text-black dark:border-white dark:text-white"
                    : "border-transparent text-gray-400 hover:text-black dark:hover:text-white",
                ].join(" ")}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
                {!loading && (
                  <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
                    ({(t === "receiving" ? receiving : sending).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === "receiving" &&
            receiving.filter((s) => s.status === "active").length > 0 && (
              <div className="mb-6">
                <BulkWithdrawButton
                  activeStreams={receiving
                    .filter((s) => s.status === "active")
                    .map((s) => ({
                      id: s.id,
                      address: s.address,
                      info: { withdrawable: s.withdrawable },
                    }))}
                  onComplete={async () => {
                    await refreshStreamData();
                    // Balances just changed — bypass the in-flight guard so
                    // this refresh always lands.
                    refetch(true);
                  }}
                />
              </div>
            )}

          {/* Stream list */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <StreamCardSkeleton key={i} />
              ))}
            </div>
          ) : error && !networkTrouble ? (
            <div className="card py-8 px-6 flex flex-col items-center gap-4 text-center">
              <AlertCircle className="w-8 h-8 text-gray-400 dark:text-gray-500" aria-hidden="true" />
              <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
              <button
                onClick={() => refetch()}
                className="flex items-center gap-2 text-sm font-semibold underline hover:text-black dark:hover:text-white text-gray-500 dark:text-gray-400"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Retry
              </button>
            </div>
          ) : displayed.length === 0 && error ? (
            <div className="card text-center py-12 text-sm text-gray-400 dark:text-gray-500">
              Your streams will appear here once the connection is back.
            </div>
          ) : displayed.length === 0 && partialError ? (
            <div className="card text-center py-12 text-sm text-gray-500 dark:text-gray-400">
              <p className="mb-2">{partialError}.</p>
              <button
                onClick={() => refetch()}
                disabled={loading}
                className="underline font-semibold hover:text-black dark:hover:text-white disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
              >
                {loading ? "Retrying…" : "Retry"}
              </button>
            </div>
          ) : displayed.length === 0 ? (
            <div className="card text-center py-12 text-sm text-gray-400 dark:text-gray-500">
              No {tab} streams yet.
              {tab === "sending" && (
                <>
                  {" "}
                  <Link
                    href="/create"
                    className="underline hover:text-black dark:hover:text-white"
                  >
                    Create your first stream
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map((row) => (
                <ErrorBoundary
                  key={row.id}
                  fallback={(_err, retry) => (
                    <div className="p-4 border border-red-200 dark:border-red-800 rounded bg-red-50 dark:bg-red-900/20">
                      <p className="text-sm text-red-600 dark:text-red-400">Failed to load stream {row.id}</p>
                      <button onClick={retry} className="mt-2 text-xs underline">Retry</button>
                    </div>
                  )}
                >
                  <StreamCard
                    id={row.id}
                    counterparty={
                      tab === "receiving" ? row.info.sender : row.info.recipient
                    }
                    role={tab === "receiving" ? "recipient" : "sender"}
                    token={row.info.token}
                    ratePerSecond={row.info.ratePerSecond}
                    startTime={row.info.startTime}
                    endTime={row.info.endTime}
                    status={row.status}
                    pausedAt={row.info.pausedAt}
                  />
                </ErrorBoundary>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
import { captureError } from "@/lib/error-tracking";
