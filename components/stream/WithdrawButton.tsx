'use client';

import { useState }             from 'react';
import { ArrowDownToLine, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { fromStroops }          from '@/lib/format';
import { useWallet }            from '@/contexts/WalletContext';
import { withdraw }             from '@/lib/stream';
import { CopyHashButton }       from '@/components/ui/CopyHashButton';

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
              tabIndex={-1}
              className="text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1 rounded"
              aria-label="Protocol fee information"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
      )}
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
    </div>
  );
}
