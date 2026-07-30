"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useWallet } from "@/contexts/WalletContext";
import { CopyHashButton } from "@/components/ui/CopyHashButton";

const STELLAR_ADDRESS_RE = /^[GA][A-Z0-9]{55}$/;

type ConnectionState =
  | { status: "loading" }
  | { status: "connected"; publicKey: string; walletName: string | null }
  | { status: "disconnected" };

function useConnectionState(): ConnectionState {
  const wallet = useWallet();
  const { publicKey, connected, walletName, connecting } = wallet;

  if (connecting) return { status: "loading" };
  if (connected && publicKey && STELLAR_ADDRESS_RE.test(publicKey)) {
    return { status: "connected", publicKey, walletName };
  }
  return { status: "disconnected" };
}

export default function ProfilePage() {
  const connection = useConnectionState();

  const shortenedKey = useMemo(() => {
    if (connection.status !== "connected") return "";
    return `${connection.publicKey.slice(0, 6)}...${connection.publicKey.slice(-4)}`;
  }, [connection]);

  const content = () => {
    switch (connection.status) {
      case "loading":
        return (
          <div className="max-w-2xl mx-auto px-4 py-10">
            <div className="animate-pulse space-y-6">
              <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-64 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded" />
            </div>
          </div>
        );
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
        return (
          <div className="max-w-2xl mx-auto px-4 py-10">
            <h1 className="text-2xl font-black tracking-tight mb-8">Profile</h1>

            <div className="card mb-6">
              <h2 className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">
                Wallet
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Provider</span>
                  <span className="text-sm font-medium">{walletName ?? "Unknown"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Public Key</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                      {shortenedKey}
                    </code>
                    <CopyHashButton hash={publicKey} />
                  </div>
                </div>
              </div>
            </div>

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
