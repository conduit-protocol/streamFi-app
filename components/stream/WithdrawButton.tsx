'use client';

import { useState }             from 'react';
import { ArrowDownToLine, CheckCircle, AlertCircle } from 'lucide-react';
import { fromStroops }          from '@/lib/format';
import { useWallet }            from '@/contexts/WalletContext';
import { withdraw }             from '@/lib/stream';

type Step = 'idle' | 'signing' | 'submitting' | 'done' | 'error';

interface WithdrawButtonProps {
  streamAddress: string;
  withdrawable:  bigint;
  token:         string;
  onSuccess?:    () => void;
}

export function WithdrawButton({ streamAddress, withdrawable, token, onSuccess }: WithdrawButtonProps) {
  const { publicKey, signTx } = useWallet();
  const [step, setStep]     = useState<Step>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);

  const amount = fromStroops(withdrawable);
  const isEmpty = withdrawable === 0n;

  async function handleWithdraw() {
    if (!publicKey) {
      setError('Connect your wallet first.');
      setStep('error');
      return;
    }
    setStep('signing');
    setError(null);
    try {
      // withdraw() internally simulates, hands the assembled XDR to signTx
      // (which prompts Freighter), then submits and polls — 'submitting' is
      // shown for the whole call since there's no intermediate callback to
      // distinguish "waiting on the signature popup" from "waiting on chain".
      setStep('submitting');
      const hash = await withdraw(publicKey, streamAddress, withdrawable, signTx);
      setTxHash(hash);
      setStep('done');
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaction failed');
      setStep('error');
    }
  }

  if (step === 'done') {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded text-sm">
        <CheckCircle className="w-4 h-4 text-green-600 shrink-0" aria-hidden="true" />
        <span>
          <strong>Withdrawn {amount} {token}</strong>
          {txHash && (
            <span className="text-gray-400 font-mono text-xs ml-2">{txHash.slice(0, 12)}…</span>
          )}
        </span>
        <button onClick={() => setStep('idle')} className="ml-auto text-xs text-gray-400 hover:text-black">
          Dismiss
        </button>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="flex items-start gap-2 px-4 py-3 bg-white border border-gray-200 rounded text-sm">
        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-semibold text-black">Transaction failed</p>
          <p className="text-xs text-gray-500 mt-0.5">{error}</p>
        </div>
        <button onClick={() => setStep('idle')} className="text-xs text-gray-400 hover:text-black shrink-0">
          Retry
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleWithdraw}
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
  );
}
