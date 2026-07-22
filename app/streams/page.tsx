"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { StreamCard } from "@/components/stream/StreamCard";
import { streamsBySender, streamsByRecipient } from "@/lib/factory";
import { getStreamAddress, getStreamInfo } from "@/lib/stream";
import type { StreamInfo } from "@/lib/stream";

type Tab = "receiving" | "sending";
type StreamStatus = "active" | "paused" | "ended" | "cancelled";

interface StreamRow {
  id: string;
  info: StreamInfo;
  status: StreamStatus;
  progress: number;
}

function deriveStatus(info: StreamInfo, now: number): StreamStatus {
  if (info.cancelled) return "cancelled";
  if (info.paused) return "paused";
  if (info.endTime > 0 && now >= info.endTime) return "ended";
  return "active";
}

function deriveProgress(info: StreamInfo, now: number): number {
  if (info.endTime === 0) return 0;
  if (now <= info.startTime) return 0;
  if (now >= info.endTime) return 1;
  return (now - info.startTime) / (info.endTime - info.startTime);
}

async function loadRows(
  publicKey: string,
  role: "sender" | "recipient",
  now: number,
): Promise<StreamRow[]> {
  const ids =
    role === "sender"
      ? await streamsBySender(publicKey, publicKey, 0, 100)
      : await streamsByRecipient(publicKey, publicKey, 0, 100);

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
        progress: deriveProgress(info, now),
      });
    } catch {
      /* skip invalid */
    }
  }
  return rows;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StreamsPage() {
  const { publicKey, connected } = useWallet();

  const [tab, setTab] = useState<Tab>("receiving");
  const [receiving, setReceiving] = useState<StreamRow[]>([]);
  const [sending, setSending] = useState<StreamRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"ALL" | StreamStatus>("ALL");

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

  const displayed = (tab === "receiving" ? receiving : sending).filter(
    (row) => statusFilter === "ALL" || row.status === statusFilter,
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black tracking-tight">Streams</h1>
        <Link href="/create" className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> New stream
        </Link>
      </div>

      {/* Tabs and Filter */}
      <div className="flex justify-between items-end border-b border-gray-200 dark:border-gray-800 mb-6">
        <div className="flex gap-1">
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
            </button>
          ))}
        </div>
        <div className="pb-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="border-gray-300 dark:border-gray-700 border py-1 px-2 text-sm rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
          >
            <option value="ALL">All Streams</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {!connected ? (
        <div className="card text-center py-12 text-sm text-gray-400 dark:text-gray-500">
          Connect your wallet to see your streams.
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="card animate-pulse h-20 bg-gray-50 dark:bg-gray-800"
            />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="card text-center py-12 text-sm text-gray-400 dark:text-gray-500">
          No streams match your filter.
          {tab === "sending" && statusFilter === "ALL" && (
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
              progress={row.progress}
              status={row.status}
            />
          ))}
        </div>
      )}
    </div>
  );
}
