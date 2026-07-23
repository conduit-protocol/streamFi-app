'use client';

/**
 * WalletContext — Stellar wallet connection state.
 *
 * Wraps @stellar/freighter-api. Freighter-only (not a multi-wallet kit) —
 * @creit.tech/stellar-wallets-kit was considered but its `dependencies`
 * unconditionally pull in Ledger/Trezor/WalletConnect/a NEAR Protocol SDK,
 * ~300 extra packages and 36 vulnerabilities for functionality this app
 * doesn't need.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  isConnected as freighterIsConnected,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api';
import { getNetworkPassphrase } from '@/lib/env';
import { queryClient } from '@/lib/queryClient';
import { useTransactionStore } from '@/lib/store';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WalletState {
  /** Connected Stellar public key (G-address), or null if not connected */
  publicKey:   string | null;
  /** Human-readable wallet name, e.g. 'Freighter' */
  walletName:  string | null;
  /** True while connection is being established */
  connecting:  boolean;
  /** True if the wallet is connected */
  connected:   boolean;
  connect:     () => Promise<void>;
  disconnect:  () => void;
  /** Sign a base64-encoded XDR transaction and return the signed XDR */
  signTx:      (xdr: string) => Promise<string>;
}

// ── Context ──────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [publicKey,  setPublicKey]  = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const isMountedRef = useRef(true);
  const pendingRequestIdRef = useRef(0);

  // Access the Zustand store's reset action outside of a component render
  const clearTransactions = useTransactionStore((s) => s.clearTransactions);

  // Restore previous session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('conduit:wallet');
    if (stored) {
      try {
        const { key, name } = JSON.parse(stored) as { key: string; name: string };
        if (typeof key === 'string' && key && typeof name === 'string' && name) {
          setPublicKey(key);
          setWalletName(name);
        } else {
          localStorage.removeItem('conduit:wallet');
        }
      } catch {
        localStorage.removeItem('conduit:wallet');
      }
    }

    return () => {
      isMountedRef.current = false;
      pendingRequestIdRef.current += 1;
    };
  }, []);

  const connect = useCallback(async () => {
    const requestId = ++pendingRequestIdRef.current;
    setConnecting(true);
    try {
      const { isConnected: hasFreighter } = await freighterIsConnected();
      if (requestId !== pendingRequestIdRef.current || !isMountedRef.current) return;

      if (!hasFreighter) {
        throw new Error(
          'Freighter wallet extension not detected. Install it from https://www.freighter.app/ and reload.',
        );
      }

      // Prompts the user for permission if not already granted, then
      // returns the currently-selected address.
      const { address, error } = await requestAccess();
      if (requestId !== pendingRequestIdRef.current || !isMountedRef.current) return;
      if (error || !address) {
        throw new Error(error?.message ?? 'Failed to connect to Freighter.');
      }

      setPublicKey(address);
      setWalletName('Freighter');
      localStorage.setItem('conduit:wallet', JSON.stringify({ key: address, name: 'Freighter' }));
    } finally {
      if (requestId === pendingRequestIdRef.current && isMountedRef.current) {
        setConnecting(false);
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    pendingRequestIdRef.current += 1;
    setConnecting(false);
    setPublicKey(null);
    setWalletName(null);
    localStorage.removeItem('conduit:wallet');
    // Clear all cached stream data so a subsequent wallet connection
    // cannot see the previous wallet's streams (fixes #81).
    queryClient.clear();
    clearTransactions();
  }, [clearTransactions]);

  const signTx = useCallback(async (xdr: string): Promise<string> => {
    if (!publicKey) throw new Error('Wallet not connected');
    if (typeof xdr !== 'string' || !xdr.trim()) {
      throw new Error('Invalid transaction payload.');
    }

    const requestId = pendingRequestIdRef.current;
    const currentPublicKey = publicKey;
    const { signedTxXdr, error } = await signTransaction(xdr, {
      networkPassphrase: getNetworkPassphrase(),
      address:           currentPublicKey,
    });

    if (requestId !== pendingRequestIdRef.current || currentPublicKey !== publicKey) {
      throw new Error('Wallet state changed during signing. Please retry the operation.');
    }

    if (error || !signedTxXdr) {
      throw new Error(error?.message ?? 'Failed to sign transaction in Freighter.');
    }
    return signedTxXdr;
  }, [publicKey]);

  return (
    <WalletContext.Provider value={{
      publicKey,
      walletName,
      connecting,
      connected: publicKey !== null,
      connect,
      disconnect,
      signTx,
    }}>
      {children}
    </WalletContext.Provider>
  );
}
