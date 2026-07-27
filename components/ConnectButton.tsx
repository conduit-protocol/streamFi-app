'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet }         from '@/contexts/WalletContext';
import { truncateAddress }   from '@/lib/format';
import { LogOut }            from 'lucide-react';

const CONNECT_UI_TIMEOUT_MS = 20_000;

export function ConnectButton() {
  const { connected, connecting, publicKey, walletName, connect, disconnect } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const connectStartRef = useRef<number>(0);

  // Safety net: if connecting stays true beyond the expected timeout window,
  // force-clear the UI state so the user isn't stuck with a spinner.
  useEffect(() => {
    if (!connecting) return;
    const elapsed = Date.now() - connectStartRef.current;
    const remaining = CONNECT_UI_TIMEOUT_MS - elapsed;
    if (remaining <= 0) {
      setError('Connection timed out. Please try again.');
      return;
    }
    const timer = setTimeout(() => {
      setError('Connection timed out. Please try again.');
    }, remaining);
    return () => clearTimeout(timer);
  }, [connecting]);

  const handleConnect = async () => {
    setError(null);
    connectStartRef.current = Date.now();
    try {
      await connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect wallet.');
    }
  };

  if (connecting) {
    return (
      <button disabled aria-busy="true" className="btn-secondary text-xs opacity-60">
        Connecting…
      </button>
    );
  }

  if (connected && publicKey) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden sm:block text-xs text-gray-500 dark:text-gray-400 font-mono">
          {truncateAddress(publicKey)}
        </span>
        <button
          onClick={disconnect}
          className="btn-secondary text-xs"
          title={`Disconnect ${walletName}`}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Disconnect</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={handleConnect} className="btn-secondary text-xs">
        Connect wallet
      </button>
      {error && (
        <p role="alert" aria-live="polite" className="text-xs text-red-600 max-w-[16rem] text-right">
          {error}
        </p>
      )}
    </div>
  );
}
