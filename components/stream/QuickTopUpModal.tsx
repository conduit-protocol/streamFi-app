'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useWallet } from '@/contexts/WalletContext';
import * as streamLib from '@/lib/stream';
import { isMock } from '@/lib/factory';
import { getTokenBalance } from '@/lib/soroban';
import { safeToStroops } from '@/lib/safe-operations';
import { fromStroops, formatTimestamp } from '@/lib/format';
import { queryClient } from '@/lib/queryClient';
import {
  invalidateStreamMutation,
  invalidateProfileAndAllowance,
} from '@/lib/query-keys';
import {
  invalidateTokenBalance,
  useTokenBalance,
} from '@/hooks/useTokenBalance';
import { queueTransaction } from '@/lib/offline-transactions';
import { useSettings } from '@/hooks/useSettings';
import { DeveloperPayloadInspector } from '@/components/DeveloperPayloadInspector';

/** i128 ceiling — mirrors the existing StreamActions top-up guard. */
const MAX_I128 = 170141183460469231731687303715884105727n;
/** Balance served in demo/mock mode so auto-fill still demonstrates the flow. */
const MOCK_BALANCE = 100_0000000n; // 100.00 at 7 decimals

interface QuickTopUpModalProps {
  streamAddress: string;
  /** Sender's public key — the only role allowed to top up. */
  sender: string;
  /** SEP-41 token contract the stream is denominated in. */
  tokenAddress: string;
  tokenSymbol: string;
  /** Token-specific decimals — never assume 7 (#364). */
  decimals?: number;
  /** Current per-second release rate — drives the runway projection. */
  ratePerSecond: bigint;
  /** Stream end time (unix s); 0 = open-ended. */
  endTime: number;
  onClose: () => void;
  /** Called after a successful on-chain top-up so the page can reload. */
  onSuccess?: () => void;
}

/** Compact "3d 4h" / "45m" label for runway projections. */
function formatSpan(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/**
 * One-click top-up modal with balance auto-fill (#779).
 *
 * The stream page opens this from its header button; the amount field is
 * pre-filled with the sender's full token balance (SEP-41 `balance_of`) the
 * moment it resolves, so topping up is: open → confirm. Runway presets and a
 * live "adds N days" projection cover the sender who wants a specific
 * extension instead of the whole balance.
 */
export function QuickTopUpModal({
  streamAddress,
  sender,
  tokenAddress,
  tokenSymbol,
  decimals = 7,
  ratePerSecond,
  endTime,
  onClose,
  onSuccess,
}: QuickTopUpModalProps) {
  const { signTx } = useWallet();
  const { developerMode } = useSettings();
  const mounted = useRef(true);
  /** Flips true the moment the user edits — auto-fill must never fight them. */
  const touchedRef = useRef(false);

  const [amount, setAmount] = useState('');
  const [autoFilled, setAutoFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchBalance = useCallback(
    (owner: string, token: string) =>
      isMock() ? Promise.resolve(MOCK_BALANCE) : getTokenBalance(owner, token),
    [],
  );
  const balanceQuery = useTokenBalance(sender, tokenAddress, fetchBalance);
  const balance = balanceQuery.data ?? null;

  // Balance auto-fill (#779): pre-fill with the full wallet balance once it
  // resolves, unless the user already started editing the field.
  useEffect(() => {
    if (balance === null || touchedRef.current) return;
    setAmount(fromStroops(balance, decimals));
    setAutoFilled(true);
  }, [balance, decimals]);

  const amountStroops = amount.trim() ? safeToStroops(amount.trim(), decimals) : null;
  const invalid = amountStroops === null || amountStroops <= 0n;
  const tooLarge = amountStroops !== null && amountStroops > MAX_I128;
  const overBalance = balance !== null && amountStroops !== null && amountStroops > balance;

  // Runway projection: top_up adds balance while the rate stays fixed, so the
  // extra runway is amount / rate — the same "extend the stream's lifetime at
  // the current rate" framing the original top-up modal uses.
  const extensionSeconds =
    ratePerSecond > 0n && amountStroops !== null && amountStroops > 0n
      ? Number(amountStroops / ratePerSecond)
      : null;
  const nowSec = Math.floor(Date.now() / 1000);
  const runwayLeft = endTime > 0 ? Math.max(0, endTime - nowSec) : null;
  const newEnd =
    endTime > 0 && extensionSeconds !== null && extensionSeconds > 0
      ? endTime + extensionSeconds
      : null;

  const applyPreset = (days: number) => {
    if (ratePerSecond <= 0n) return;
    touchedRef.current = true;
    setAutoFilled(false);
    setAmount(fromStroops(ratePerSecond * BigInt(days * 86400), decimals));
    setError(null);
  };

  const useFullBalance = () => {
    if (balance === null) return;
    touchedRef.current = true;
    setAmount(fromStroops(balance, decimals));
    setAutoFilled(true);
    setError(null);
  };

  const handleChange = (value: string) => {
    touchedRef.current = true;
    setAutoFilled(false);
    setAmount(value);
    setError(null);
  };

  const submit = async () => {
    if (invalid) {
      setError('Enter a valid amount greater than 0.');
      return;
    }
    if (tooLarge) {
      setError('Amount exceeds maximum allowed.');
      return;
    }
    if (overBalance) {
      setError('Amount exceeds your available token balance.');
      return;
    }
    const stroops = amountStroops!;
    setError(null);

    // Offline: queue the top-up like every other mutation does so it submits
    // automatically on reconnect (docs/offline-support.md).
    if (!navigator.onLine) {
      queueTransaction({
        kind: 'topup',
        publicKey: sender,
        streamAddress,
        amount: stroops.toString(),
      });
      setError(
        'Queued while offline. It will be submitted automatically when you reconnect.',
      );
      return;
    }

    setPending(true);
    try {
      await streamLib.topUp(sender, streamAddress, stroops, signTx);
      if (!mounted.current) return;
      await invalidateStreamMutation(queryClient, streamAddress);
      await invalidateProfileAndAllowance(queryClient, sender);
      // The deposit left the wallet — refresh the displayed balance (#756).
      await invalidateTokenBalance(queryClient, sender, tokenAddress);
      onSuccess?.();
      onClose();
    } catch (e) {
      if (!mounted.current) return;
      console.error('[topup] error:', e);
      setError(e instanceof Error ? e.message : 'Top-up failed.');
    } finally {
      if (mounted.current) setPending(false);
    }
  };

  return (
    <Modal
      title="Quick top-up"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Add {tokenSymbol} to extend the stream&apos;s runway at the current
          rate of{' '}
          <span className="font-mono font-semibold text-black dark:text-white">
            {fromStroops(ratePerSecond, decimals)} {tokenSymbol}/s
          </span>
          .
        </p>

        {/* Runway summary */}
        <div className="rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 text-xs">
          {runwayLeft !== null && (
            <div className="flex justify-between gap-4 px-3 py-2">
              <span className="text-gray-500 dark:text-gray-400">Runs dry in</span>
              <span className="font-mono text-black dark:text-white">
                {runwayLeft > 0 ? formatSpan(runwayLeft) : 'now'}
              </span>
            </div>
          )}
          {extensionSeconds !== null && extensionSeconds > 0 && (
            <div className="flex justify-between gap-4 px-3 py-2">
              <span className="text-gray-500 dark:text-gray-400">Adds runway</span>
              <span className="font-mono text-black dark:text-white">
                ≈ {formatSpan(extensionSeconds)}
                {newEnd ? ` · until ${formatTimestamp(newEnd)}` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Amount — auto-filled with the wallet balance (#779) */}
        <div>
          <Input
            label={`Amount (${tokenSymbol})`}
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => handleChange(e.target.value)}
            disabled={pending}
          />
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            <span>
              {balanceQuery.isLoading || balanceQuery.isFetching
                ? 'Loading wallet balance…'
                : balance !== null
                  ? `Wallet balance: ${fromStroops(balance, decimals)} ${tokenSymbol}`
                  : 'Wallet balance unavailable'}
            </span>
          </div>
          {autoFilled && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              Auto-filled with your full {tokenSymbol} balance — edit it freely.
            </p>
          )}
          {balanceQuery.isError && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              Couldn&apos;t read your wallet balance — enter an amount manually.
            </p>
          )}
          {error && (
            <p className="text-xs text-red-600 mt-1" role="alert">
              {error}
            </p>
          )}
          {!error && overBalance && (
            <p className="text-xs text-amber-600 mt-1" role="alert">
              Amount exceeds your wallet balance — the transaction will fail.
            </p>
          )}
        </div>
        {/* Runway presets — amount = exact balance needed for N more days */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Runway presets">
          {[7, 30].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => applyPreset(days)}
              disabled={pending || ratePerSecond <= 0n}
              className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              +{days} days
            </button>
          ))}
          <button
            type="button"
            onClick={useFullBalance}
            disabled={pending || balance === null}
            className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Full balance
          </button>
        </div>

        {developerMode && (
          <DeveloperPayloadInspector
            contractId={streamAddress}
            method="top_up"
            storageKeySymbol="info"
            args={{ amount: amount || '0' }}
          />
        )}

        <div className="flex gap-2">
          <button
            className="btn-primary flex-1"
            onClick={submit}
            disabled={pending || invalid || overBalance || tooLarge}
          >
            {pending
              ? 'Signing…'
              : amountStroops !== null && amountStroops > 0n
                ? `Top up ${fromStroops(amountStroops, decimals)} ${tokenSymbol}`
                : 'Confirm top-up'}
          </button>
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

