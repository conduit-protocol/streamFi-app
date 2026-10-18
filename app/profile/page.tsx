"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/contexts/WalletContext";
import { useSelectedNetwork } from "@/hooks/useSelectedNetwork";
import { CopyHashButton } from "@/components/ui/CopyHashButton";
import { ProfileSkeleton } from "@/components/ProfileSkeleton";
import { isValidStellarPublicKey } from "@/lib/stellar-address";
import { CashflowChart } from "@/components/profile/CashflowChart";
import {
  computeCashflow,
  CASHFLOW_WINDOW_DAYS,
  type CashflowStream,
} from "@/lib/profile-analytics";
import { streamsBySender, streamsByRecipient } from "@/lib/factory";
import { getStreamAddress, getStreamInfo } from "@/lib/stream";
import { fromStroops } from "@/lib/format";

type ConnectionState =
  | { status: "loading" }
  | { status: "connected"; publicKey: string; walletName: string | null }
  | { status: "disconnected" };

function useConnectionState(): ConnectionState {
  const wallet = useWallet();
  const { publicKey, connected, walletName, connecting } = wallet;

  if (connecting) return { status: "loading" };
  if (connected && publicKey && isValidStellarPublicKey(publicKey)) {
    return { status: "connected", publicKey, walletName };
  }
  return { status: "disconnected" };
}

/**
 * Aggregated incoming vs outgoing streaming volume over the trailing 30 days
 * (#690). Resolves the user's stream IDs in both directions, estimates
 * per-day volume as rate × overlap, and renders totals + a stacked bar chart.
 */
function CashflowSection({ publicKey }: { publicKey: string }) {
  const [streams, setStreams] = useState<CashflowStream[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const [senderIds, recipientIds] = await Promise.all([
          streamsBySender(publicKey, publicKey, 0, 50).catch(() => [] as bigint[]),
          streamsByRecipient(publicKey, publicKey, 0, 50).catch(() => [] as bigint[]),
        ]);
        const jobs: { id: bigint; direction: "incoming" | "outgoing" }[] = [
          ...senderIds.map((id) => ({ id, direction: "outgoing" as const })),
          ...recipientIds.map((id) => ({ id, direction: "incoming" as const })),
        ];
        const settled = await Promise.allSettled(
          jobs.map(async (job) => {
            const addr = await getStreamAddress(publicKey, job.id);
            if (!addr) return null;
            const info = await getStreamInfo(publicKey, addr);
            return { info, direction: job.direction } as CashflowStream;
          }),
        );
        if (!active) return;
        setStreams(
          settled.flatMap((r) =>
            r.status === "fulfilled" && r.value ? [r.value] : [],
          ),
        );
      } catch {
        if (active) setStreams([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [publicKey]);

  const summary = useMemo(
    () =>
      computeCashflow(
        streams,
        Math.floor(Date.now() / 1000),
        CASHFLOW_WINDOW_DAYS,
      ),
    [streams],
  );

  return (
    <div className="card mb-6">
      <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
        Cash Flow — past {CASHFLOW_WINDOW_DAYS} days
      </h2>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
        Estimated streaming income vs expenditure from active stream rates.
      </p>
      {loading ? (
        <div className="py-10 text-center text-sm text-gray-400" aria-busy="true">
          Loading cash flow…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">Income</p>
              <p className="text-lg font-black font-mono" data-testid="cashflow-incoming">
                {fromStroops(summary.totalIncoming)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">Spent</p>
              <p className="text-lg font-black font-mono" data-testid="cashflow-outgoing">
                {fromStroops(summary.totalOutgoing)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">Net</p>
              <p
                className={`text-lg font-black font-mono ${summary.net >= 0n ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                data-testid="cashflow-net"
              >
                {summary.net >= 0n ? "+" : "−"}
                {fromStroops(summary.net >= 0n ? summary.net : -summary.net)}
              </p>
            </div>
          </div>
          <CashflowChart daily={summary.daily} />
        </>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const connection = useConnectionState();
  const { disconnect } = useWallet();
  const network = useSelectedNetwork();
  const [showFullKey, setShowFullKey] = useState(false);

  const shortenedKey = useMemo(() => {
    if (connection.status !== "connected") return "";
    return `${connection.publicKey.slice(0, 6)}...${connection.publicKey.slice(-4)}`;
  }, [connection]);

  const explorerNetwork = network?.name === "mainnet" ? "public" : "testnet";

  const content = () => {
    switch (connection.status) {
      case "loading":
        return <ProfileSkeleton />;
      case "disconnected":
        return (
          <div className="max-w-2xl mx-auto px-4 py-10">
            <h1 className="text-2xl font-black tracking-tight mb-4">Profile</h1>
            <div className="card text-center py-12">
              <p className="text-gray-400 dark:text-gray-500 mb-4">
                Connect your wallet to view your profile.
              </p>
              <Link href="/" className="btn-primary text-sm">
                Connect Wallet
              </Link>
            </div>
          </div>
        );
      case "connected": {
        const { publicKey, walletName } = connection;
        const explorerUrl = `https://stellar.expert/explorer/${explorerNetwork}/account/${publicKey}`;

        return (
          <div className="max-w-2xl mx-auto px-4 py-10">
            <h1 className="text-2xl font-black tracking-tight mb-8">Profile</h1>

            <div className="card mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Wallet
                </h2>
                <button
                  type="button"
                  onClick={disconnect}
                  className="btn-secondary text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                  Disconnect Wallet
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Provider</span>
                  <span className="text-sm font-medium">{walletName ?? "Unknown"}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">Public Key</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded break-all">
                      {showFullKey ? publicKey : shortenedKey}
                    </code>
                    <button
                      type="button"
                      onClick={() => setShowFullKey((prev) => !prev)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {showFullKey ? "Show shortened" : "Show full"}
                    </button>
                    <CopyHashButton hash={publicKey} />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Explorer</span>
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    View on Stellar Expert
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-3.5 h-3.5"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            </div>

            <CashflowSection publicKey={publicKey} />

            <div className="card">
              <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
                Quick Links
              </h2>
              <div className="space-y-2">
                <Link
                  href="/dashboard"
                  className="block px-3 py-2 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  href="/streams"
                  className="block px-3 py-2 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  All Streams
                </Link>
                <Link
                  href="/transactions"
                  className="block px-3 py-2 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Transaction History
                </Link>
              </div>
            </div>
          </div>
        );
      }
    }
  };

  return content();
}
