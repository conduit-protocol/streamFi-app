"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { StreamCard } from "@/components/stream/StreamCard";
import { StreamCardSkeleton } from "@/components/stream/StreamCardSkeleton";
import { BulkWithdrawButton } from "@/components/stream/BulkWithdrawButton";
import { streamsBySender, streamsByRecipient } from "@/lib/factory";
import { getStreamAddress, getStreamInfo } from "@/lib/stream";
import { fromStroops } from "@/lib/format";
import type { StreamInfo } from "@/lib/stream";

type Tab = "receiving" | "sending";
type StreamStatus = "active" | "paused" | "ended" | "cancelled";

interface StreamRow {
  id: string;
  info: StreamInfo;
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
): Promise<StreamRow[]> {
  const ids =
    role === "sender"
      ? await streamsBySender(publicKey, publicKey, 0, 50)
      : await streamsByRecipient(publicKey, publicKey, 0, 50);

  const rows: StreamRow[] = [];
  for (const id of ids) {
    try {
      const addr = await getStreamAddress(publicKey, id);
      if (!addr) continue;
      const info = await getStreamInfo(publicKey, addr);
      rows.push({
        id: id.toString(),
        info,
        status: deriveStatus(info, now),
      });
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

  useEffect(() => {
    if (!publicKey) return;
    let active = true;

    setLoading(true);
    const now = Math.floor(Date.now() / 1000);
    Promise.all([
      loadRows(publicKey, "recipient", now),
      loadRows(publicKey, "sender", now),
    ])
      .then(([recv, sent]) => {
        if (!active) return;
        setReceiving(recv);
        setSending(sent);
      })
      .catch((e) => { if (active) console.error(e); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [publicKey]);

  const activeCount = useMemo(
    () =>
      [...receiving, ...sending].filter((s) => s.status === "active").length,
    [receiving, sending],
  );
  const receivingRate = useMemo(
    () =>
      receiving
        .filter((s) => s.status === "active")
        .reduce((a, s) => a + s.info.ratePerSecond, 0n),
    [receiving],
  );
  const totalWithdrawn = useMemo(
    () => receiving.reduce((a, s) => a + s.info.withdrawn, 0n),
    [receiving],
  );
  const senderCount = useMemo(
    () => new Set(receiving.map((s) => s.info.sender)).size,
    [receiving],
  );

  const displayed = tab === "receiving" ? receiving : sending;

  const STATS = [
    { label: "Active streams", value: loading ? "…" : String(activeCount) },
    {
      label: "Receiving /s",
      value: loading ? "…" : fromStroops(receivingRate),
    },
    {
      label: "Total received",
      value: loading ? "…" : fromStroops(totalWithdrawn),
    },
    { label: "Senders", value: loading ? "…" : String(senderCount) },
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
                  activeStreams={receiving.filter((s) => s.status === "active")}
                  onComplete={() => window.location.reload()}
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
