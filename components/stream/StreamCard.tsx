"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { CopyableAddress } from "@/components/ui/CopyableAddress";
import { StreamProgressBar } from "@/components/stream/StreamProgressBar";
import { fromStroops } from "@/lib/format";
import { CopyAddress } from "@/components/ui/CopyAddress";
import { getStreamNote } from "@/lib/stream-notes-storage";

interface StreamCardProps {
  id: string;
  counterparty: string; // sender (if you're recipient) or recipient (if you're sender)
  role: "sender" | "recipient";
  token: string;
  ratePerSecond: bigint;
  /** Unix timestamp (seconds) when the stream started */
  startTime: number;
  /** Unix timestamp (seconds) when the stream ends (0 = open-ended) */
  endTime: number;
  status: "active" | "paused" | "ended" | "cancelled";
  /** Unix timestamp (seconds) when the stream was paused — required to freeze the % label correctly while status === 'paused' */
  pausedAt?: number;
  /** Stream address for note lookup */
  streamAddress?: string;
}

export function StreamCard({
  id,
  counterparty,
  role,
  token,
  ratePerSecond,
  startTime,
  endTime,
  status,
  pausedAt,
  streamAddress,
}: StreamCardProps) {
  const rateFormatted = fromStroops(ratePerSecond);
  const [note, setNote] = useState<string | null>(null);

  // Load note from storage
  useEffect(() => {
    if (streamAddress) {
      const storedNote = getStreamNote(streamAddress);
      setNote(storedNote);
    }
  }, [streamAddress]);

  // Client-only wall-clock snapshot for cancelled streams
  const [mountSec] = useState(() => Date.now() / 1_000);

  // Derive a snapshot percentage for the text label only (no state, no timer)
  const pctSnapshot = (() => {
    if (endTime === 0) return 0;
    const total = endTime - startTime;
    if (total <= 0) return 0;
    // Paused streams freeze at pausedAt, not the wall-clock time this
    // renders at — otherwise the % label keeps climbing for a stream
    // that isn't actually streaming.
    // Cancelled streams freeze at min(now, endTime) captured once at mount.
    let now = Date.now() / 1_000;
    if (status === "paused" && pausedAt) {
      now = pausedAt;
    } else if (status === "cancelled") {
      now = endTime > 0 ? Math.min(mountSec, endTime) : mountSec;
    }
    return Math.min(100, Math.max(0, ((now - startTime) / total) * 100));
  })();

  return (
    <Link
      href={`/stream/${id}`}
      className="card block hover:border-black dark:hover:border-white transition-colors group"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">
            {role === "recipient" ? "From" : "To"}
          </p>
          <div className="truncate max-w-[110px] sm:max-w-[180px]">
            <CopyableAddress address={counterparty} />
          </div>
        </div>

        {/* Rate number centered, green text */}
        <div
          className="amount text-xs sm:text-sm font-bold text-green-600 dark:text-green-400 truncate text-center px-1"
          aria-label={`streaming rate: ${rateFormatted} per second`}
        >
          {rateFormatted}/s
        </div>

        <div className="shrink-0">
          <Badge status={status} />
        </div>
      </div>

      {/* Note if present */}
      {note && (
        <div className="mb-2 p-2 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/50">
          <p className="text-xs text-blue-700 dark:text-blue-300 line-clamp-2">
            {note}
          </p>
        </div>
      )}

      {/* CSS-animated progress bar — zero React state updates */}
      <StreamProgressBar
        startTime={startTime}
        endTime={endTime}
        status={status}
        pausedAt={pausedAt}
      />

      <div className="flex items-center justify-between mt-3 text-xs">
        <CopyAddress
          address={token}
          className="text-gray-500 dark:text-gray-400"
          maxWidth="max-w-[200px] sm:max-w-[300px]"
          showQrCode
        />
        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium font-mono">
          {Math.round(pctSnapshot)}%
        </span>
      </div>
    </Link>
  );
}
