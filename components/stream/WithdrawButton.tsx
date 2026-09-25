'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { Modal }   from '@/components/ui/Modal';
import { Input }   from '@/components/ui/Input';
import { fromStroops }          from '@/lib/format';
import { useWallet }            from '@/contexts/WalletContext';
import { withdraw }             from '@/lib/stream';
import { CopyHashButton }       from '@/components/ui/CopyHashButton';
import { queryClient }          from '@/lib/queryClient';
import { queueTransaction }     from '@/lib/offline-transactions';
import { invalidateStreamMutation } from '@/lib/query-keys';
import { getLargeWithdrawalThreshold, isLargeWithdrawal } from '@/lib/withdraw-config';

type Step = 'idle' | 'signing' | 'submitting' | 'done' | 'error';

interface WithdrawButtonProps {
  streamAddress: string;
  withdrawable:  bigint;
  token:         string;
  onSuccess?:    () => void;
}

export function WithdrawButton({ streamAddress, withdrawable, token, onSuccess }: WithdrawButtonProps) {
  const { publicKey, signTx } = useWallet();
  const mounted = useRef(true);
  const [step, setStep]     = useState<Step>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);
  // Large-withdrawal confirmation (#560): amounts at or above the configured
  // threshold require the user to retype the amount before we proceed.
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const amount = fromStroops(withdrawable);
  const isEmpty = withdrawable === 0n;
  const threshold = getLargeWithdrawalThreshold();
  const isLarge = !isEmpty && isLargeWithdrawal(amount, threshold);

  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  async function handleWithdraw() {
    if (!publicKey) {
      setError('Connect your wallet first.');
      setStep('error');
      return;
    }
    setStep('signing');
    setError(null);
    if (!navigator.onLine) {
      queueTransaction({ kind: 'withdraw', publicKey, streamAddress, amount: withdrawable.toString() });
      setError('Queued while offline. It will be submitted automatically when you reconnect.');
      setStep('error');
      return;
    }
    try {
      // withdraw() internally simulates, hands the assembled XDR to signTx
      // (which prompts Freighter), then submits and polls — 'submitting' is
      // shown for the whole call since there's no intermediate callback to
      // distinguish "waiting on the signature popup" from "waiting on chain".
      setStep('submitting');
      const hash = await withdraw(publicKey, streamAddress, withdrawable, signTx);
      if (!mounted.current) return;
      setTxHash(hash);
      setStep('done');
      // Withdrawn balance just changed on-chain — invalidate only the stream,
      // list/dashboard, transactions, and wallet-balance trees rather than
      // every query in the app (fixes #193, narrowed per #431).
      await invalidateStreamMutation(queryClient, streamAddress);
      onSuccess?.();
    } catch (e) {
      // Always clear the loading state, even if the RPC provider timed out
      // or the component is still mounted after the async failure — prevents
      // an infinite spinner (fixes #195).
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : 'Transaction failed');
      setStep('error');
    }
  }

  function onWithdrawClick() {
    if (isLarge) {
      setConfirmInput('');
      setConfirmError('');
      setConfirmOpen(true);
      return;
    }
    handleWithdraw();
  }

  function closeConfirm() {
    setConfirmOpen(false);
    setConfirmInput('');
    setConfirmError('');
  }

  function confirmAndWithdraw() {
    if (confirmInput.trim() !== amount) {
      setConfirmError(`Amount doesn't match. Type ${amount} exactly to confirm.`);
      return;
    }
    setConfirmOpen(false);
    setConfirmInput('');
    setConfirmError('');
    handleWithdraw();
  }

  if (step === 'done') {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-sm">
        <CheckCircle className="w-4 h-4 text-green-600 shrink-0" aria-hidden="true" />
        <span>
          <strong>Withdrawn {amount} {token}</strong>
          {txHash && (
            <span className="flex items-center gap-1 mt-0.5">
              <span className="text-gray-400 dark:text-gray-500 font-mono text-xs break-all">{txHash}</span>
              <CopyHashButton hash={txHash} className="shrink-0" />
            </span>
          )}
        </span>
        <button onClick={() => setStep('idle')} className="ml-auto text-xs text-gray-400 hover:text-black dark:hover:text-white">
          Dismiss
        </button>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="flex items-start gap-2 px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-sm">
        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-semibold text-black dark:text-white">Transaction failed</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{error}</p>
        </div>
        <button onClick={() => setStep('idle')} className="text-xs text-gray-400 hover:text-black dark:hover:text-white shrink-0">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!isEmpty && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>Protocol fee applies</span>
          <Tooltip
            content={
              <div className="text-left space-y-1">
                <p>A small protocol fee is deducted from each withdrawal to sustain the StreamFi protocol.</p>
                <p className="text-gray-300">• Fee rate is set by the protocol governor</p>
                <p className="text-gray-300">• Network transaction fee is covered separately</p>
              </div>
            }
          >
            <button
              className="text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1 rounded"
              aria-label="Protocol fee information"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
      )}
      <button
        onClick={onWithdrawClick}
        disabled={isEmpty || step !== 'idle'}
        className="btn-primary w-full"
      >
        <ArrowDownToLine className="w-4 h-4" />
        {step === 'signing'    && 'Waiting for signature…'}
        {step === 'submitting' && 'Submitting…'}
        {step === 'idle' && (
          isEmpty
            ? 'Nothing to withdraw yet'
            : `Withdraw ${amount} ${token}`
        )}
      </button>

      {/* Large-withdrawal confirmation — retype the amount to proceed (#560) */}
      {confirmOpen && (
        <Modal title="Confirm large withdrawal" onClose={closeConfirm}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              You&apos;re withdrawing <strong>{amount} {token}</strong>, which is at or
              above the {threshold} {token} large-withdrawal threshold. Type the
              amount below to confirm.
            </p>
            <div>
              <label className="block text-xs font-semibold mb-1">
                Amount ({token})
              </label>
              <Input
                type="text"
                placeholder={amount}
                value={confirmInput}
                onChange={e => { setConfirmInput(e.target.value); setConfirmError(''); }}
                autoFocus
              />
              {confirmError && <p className="text-xs text-red-600 mt-1">{confirmError}</p>}
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={confirmAndWithdraw}>
                Confirm withdrawal
              </button>
              <button className="btn-secondary" onClick={closeConfirm}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
