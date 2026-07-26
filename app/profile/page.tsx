'use client';

import { useWallet }          from '@/contexts/WalletContext';
import { CopyHashButton }     from '@/components/ui/CopyHashButton';
import { truncateAddress }    from '@/lib/format';
import { LogOut }             from 'lucide-react';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { connected, connecting, publicKey, walletName, connect, disconnect } = useWallet();

  if (connecting) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <p className="text-sm text-gray-400">Connecting wallet…</p>
      </div>
    );
  }

  if (!connected || !publicKey) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="card text-center py-12">
          <p className="text-sm text-gray-400 mb-4">
            Connect your wallet to view your profile.
          </p>
          <button onClick={connect} className="btn-primary text-sm">
            Connect wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-black tracking-tight">Profile</h1>

      {/* Wallet card */}
      <div className="card divide-y divide-gray-100">
        {/* Wallet name */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
            Wallet
          </span>
          <span className="text-sm font-medium">{walletName ?? '—'}</span>
        </div>

        {/* Public key */}
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold shrink-0">
            Address
          </span>
          <div className="flex items-center gap-1 min-w-0">
            <span
              className="text-sm font-mono truncate"
              title={publicKey}
              aria-label={`Public key: ${publicKey}`}
            >
              {truncateAddress(publicKey, 8)}
            </span>
            <CopyHashButton value={publicKey} label="Copy public key" />
          </div>
        </div>
      </div>

      {/* Disconnect */}
      <div className="flex justify-end">
        <button
          onClick={disconnect}
          className="btn-secondary text-sm flex items-center gap-1.5"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          Disconnect
        </button>
      </div>
    </div>
  );
}
