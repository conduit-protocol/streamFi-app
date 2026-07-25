"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, AlertCircle, RefreshCw } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { StreamCard } from "@/components/stream/StreamCard";
import { StreamCardSkeleton } from "@/components/stream/StreamCardSkeleton";
import { BulkWithdrawButton } from "@/components/stream/BulkWithdrawButton";
import { streamsBySender, streamsByRecipient } from "@/lib/factory";
import { getStreamAddress, getStreamInfo, getWithdrawable } from "@/lib/stream";
import { fromStroops } from "@/lib/format";
import { refreshStreamData } from "@/lib/queryClient";
import type { StreamInfo } from "@/lib/stream";

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

async function loadRows(
  publicKey: string,
  role: "sender" | "recipient",
  now: number,
  signal: AbortSignal,
): Promise<StreamRow[]> {
  let ids: bigint[];
  try {
    ids =
      role === "sender"
        ? await streamsBySender(publicKey, publicKey, 0, 50, { signal })
        : await streamsByRecipient(publicKey, publicKey, 0, 50, { signal });
  } catch {
    return [];
  }

  if (!ids || !Array.isArray(ids)) return [];

  const rows: StreamRow[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (signal.aborted) return [];
    if (typeof id !== "bigint") continue;
    const rowId = id.toString();
    if (seen.has(rowId)) continue;
    try {
      const addr = await getStreamAddress(publicKey, id, { signal });
      if (!addr || typeof addr !== "string") continue;
      const [info, withdrawable] = await Promise.all([
        getStreamInfo(publicKey, addr, { signal }),
        getWithdrawable(publicKey, addr),
      ]);
      if (!info || typeof info !== "object") continue;
      if (typeof info.ratePerSecond !== "bigint") continue;
      if (signal.aborted) return [];
      rows.push({
        id: rowId,
        address: addr,
        info,
        withdrawable,
        status: deriveStatus(info, now),
      });
      seen.add(rowId);
    } catch {
      /* skip invalid streams */
    }
  }
  return rows;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();

  const [tab, setTab] = useState<Tab>("receiving");
  const [receiving, setReceiving] = useState<StreamRow[]>([]);
  const [sending, setSending] = useState<StreamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSeqRef = useRef(0);

  const fetchStreams = useCallback(async (signal: AbortSignal) => {
    if (!publicKey) return;
    const now = Math.floor(Date.now() / 1000);
    setLoading(true);
    setError(null);
    try {
      const [recv, sent] = await Promise.all([
        loadRows(publicKey, "recipient", now, signal),
        loadRows(publicKey, "sender", now, signal),
      ]);
      if (!signal.aborted) {
        setReceiving(recv);
        setSending(sent);
      }
    } catch (e) {
      if (!signal.aborted) {
        console.error(e);
        setError("Failed to load streams. Please try again.");
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey) {
      setReceiving([]);
      setSending([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    fetchStreams(controller.signal);
    return () => controller.abort();
  }, [publicKey, fetchStreams]);

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

      {error && (
        <div className="card text-center py-4 mb-6 text-sm text-red-500 dark:text-red-400">
          {error}
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
                    const controller = new AbortController();
                    fetchStreams(controller.signal);
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
          ) : error ? (
            <div className="card py-8 px-6 flex flex-col items-center gap-4 text-center">
              <AlertCircle className="w-8 h-8 text-gray-400 dark:text-gray-500" aria-hidden="true" />
              <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
              <button
                onClick={() => {
                  if (publicKey) {
                    setError(null);
                    setLoading(true);
                    const now = Math.floor(Date.now() / 1000);
                    const controller = new AbortController();
                    Promise.all([
                      loadRows(publicKey, "recipient", now, controller.signal),
                      loadRows(publicKey, "sender", now, controller.signal),
                    ])
                      .then(([recv, sent]) => {
                        setReceiving(recv);
                        setSending(sent);
                      })
                      .catch((e) => {
                        console.error(e);
                        const message =
                          (e instanceof Error && e.name === "RpcTimeoutError")
                            ? "The RPC provider didn't respond in time. Check your connection and try again."
                            : "Failed to load streams. Please try again.";
                        setError(message);
                      })
                      .finally(() => setLoading(false));
                  }
                }}
                className="flex items-center gap-2 text-sm font-semibold underline hover:text-black dark:hover:text-white text-gray-500 dark:text-gray-400"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Retry
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
                <StreamCard
                  key={row.id}
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
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
