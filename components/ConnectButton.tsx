'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet         } from '@/contexts/WalletContext';
import { CopyAddress       } from '@/components/ui/CopyAddress';
import { LogOut            } from 'lucide-react';
import { MultiWalletModal  } from '@/components/MultiWalletModal';
import { useSelectedNetwork } from '@/hooks/useSelectedNetwork';
import { NETWORKS, type NetworkConfig } from '@/lib/network-config';


const CONNECT_UI_TIMEOUT_MS = 20_000;

// Auto-reconnect: cache last connected provider in localStorage with expiry (#736).
const RECONNECT_KEY = 'streamfi_last_wallet';
const RECONNECT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheWalletProvider(providerId: string) {
  try {
    localStorage.setItem(RECONNECT_KEY, JSON.stringify({
      providerId,
      expires: Date.now() + RECONNECT_EXPIRY_MS,
    }));
  } catch { /* ignore storage errors */ }
}

function getCachedWalletProvider(): string | null {
  try {
    const raw = localStorage.getItem(RECONNECT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() > data.expires) {
      localStorage.removeItem(RECONNECT_KEY);
      return null;
    }
    return data.providerId;
  } catch { return null; }
}

function clearCachedWalletProvider() {
  try {
    localStorage.removeItem(RECONNECT_KEY);
  } catch { /* ignore */ }
}

export function ConnectButton() {
  const { connected, connecting, publicKey, walletName, network, networkPassphrase, connect, disconnect } = useWallet();
  const selectedNetwork = useSelectedNetwork();
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const connectStartRef = useRef<number>(0);
  const connectingProviderRef = useRef<string | null>(null);

  // Auto-reconnect on mount if a cached wallet exists (#736).
  useEffect(() => {
    if (connected) return;
    const cached = getCachedWalletProvider();
    if (!cached) return;
    // WebHID's device picker needs a user gesture, so a Ledger can't be
    // re-prompted on load. WalletProvider already restores the session, and
    // the previously granted device is re-opened on the first signature.
    if (cached === LEDGER_WALLET_ID) return;
    // Attempt silent reconnection with the same provider
    connect(cached).catch(() => {
      // Silent reconnect failed — user needs to connect manually
      clearCachedWalletProvider();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Safety net: if connecting stays true beyond the expected timeout window,
  // force-clear the UI state so the user isn't stuck with a spinner.
  useEffect(() => {
    if (!connecting) return;
    // The Ledger flow waits on the browser's device picker and the user
    // unlocking the device — no fixed deadline is meaningful there.
    if (connectingProviderRef.current === LEDGER_WALLET_ID) return;
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

  // Determine the wallet's effective network passphrase. Prefer the value
  // reported by the wallet context; fall back to the context's network
  // name when a raw passphrase isn't available.
  const walletPassphrase: string | null = (function () {
    if (networkPassphrase) return networkPassphrase;
    if (network) {
      const match = (Object.values(NETWORKS) as NetworkConfig[]).find(
        (n) => n.label.toLowerCase() === network.toLowerCase() || n.id === network,
      );
      if (match) return match.passphrase;
    }
    return null;
  })();

  const networkMismatch =
    connected &&
    !!walletPassphrase &&
    walletPassphrase !== selectedNetwork.passphrase;

  const walletNetworkLabel = (function (): string | null {
    if (!walletPassphrase) return null;
    const match = (Object.values(NETWORKS) as NetworkConfig[]).find(
      (n) => n.passphrase === walletPassphrase,
    );
    return match ? match.label : 'another network';
  })();

  // Surface the mismatch modal automatically when the wallet network
  // diverges from the app's selected network.
  useEffect(() => {
    if (networkMismatch) setShowNetworkModal(true);
    else setShowNetworkModal(false);
  }, [networkMismatch]);

  const handleConnect = async () => {
    setError(null);
    connectStartRef.current = Date.now();
    connectingProviderRef.current = null;
    try {
      await connect();
      cacheWalletProvider(walletName || 'freighter');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect wallet.');
    }
  };

  const handleModalConnect = async (providerId: string) => {
    setShowModal(false);
    setError(null);
    connectStartRef.current = Date.now();
    connectingProviderRef.current = providerId;
    try {
      await connect(providerId);
      cacheWalletProvider(providerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to connect ${providerId}.`);
    }
  };

  const handleDisconnect = () => {
    clearCachedWalletProvider();
    disconnect();
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
      <>
        <div className="flex items-center gap-2">
          <span className="hidden sm:block text-xs text-gray-500 dark:text-gray-400">
            <CopyAddress address={publicKey} />
          </span>
          <button
            onClick={handleDisconnect}
            className="btn-secondary text-xs"
            title={`Disconnect ${walletName}`}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Disconnect</span>
          </button>
        </div>
        {showNetworkModal && networkMismatch && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="network-mismatch-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
              <h2 id="network-mismatch-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Switch to {selectedNetwork.label}
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Your wallet is connected to {walletNetworkLabel}, but this app is configured for the {selectedNetwork.label} network. Switch networks in your wallet before submitting transactions.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setShowNetworkModal(false)}
                  className="btn-secondary text-xs"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={() => setShowModal(true)} className="btn-secondary text-xs">
        Connect wallet
      </button>
      {error && (
        <p role="alert" aria-live="polite" className="text-xs text-red-600 max-w-[16rem] text-right">
          {error}
        </p>
      )}
      <MultiWalletModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onConnect={handleModalConnect}
      />
    </div>
  );
}
